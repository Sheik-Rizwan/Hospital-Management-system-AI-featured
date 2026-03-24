import logging

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from mongodb_config import MongoDatabase
from bson import ObjectId
import json
import os
import tempfile
from datetime import datetime

logger = logging.getLogger(__name__)
try:
    from services.chatbot import ask_nurse_assistant
except Exception:
    ask_nurse_assistant = None

from services.speech_to_text import SpeechToTextRecorder

try:
    from services.report_builder import build_structured_report
except Exception:
    build_structured_report = None
from auth import get_current_user
from models.user_models import Patient
from models.appointment_models import Appointment, DoctorSchedule
import calendar
from services.socket_service import (notify_task_completed, notify_task_rejected,
                                      notify_new_appointment, notify_nurse_status_changed)

nurse_bp = Blueprint('nurse_bp', __name__)
db = MongoDatabase()


@nurse_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_nurse_stats():
    """Get summary stats for the nurse dashboard."""
    try:
        nurse_id = get_jwt_identity()

        total_tasks = db.db.tasks.count_documents({'assigned_nurse_id': nurse_id})
        pending_tasks = db.db.tasks.count_documents({'assigned_nurse_id': nurse_id, 'status': 'pending'})
        completed_tasks = db.db.tasks.count_documents({'assigned_nurse_id': nurse_id, 'status': 'completed'})
        total_patients = db.patients.count_documents({})
        total_handoffs = db.handoffs.count_documents({'nurse_id': nurse_id})

        return jsonify({
            'success': True,
            'stats': {
                'total_tasks': total_tasks,
                'pending_tasks': pending_tasks,
                'completed_tasks': completed_tasks,
                'total_patients': total_patients,
                'total_handoffs': total_handoffs
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@nurse_bp.route('/tasks', methods=['GET'])
@jwt_required()
def get_nurse_tasks():
    """Get tasks assigned to the current nurse."""
    try:
        nurse_id = get_jwt_identity()
        tasks = db.get_nurse_tasks(nurse_id)
        return jsonify({'success': True, 'tasks': tasks}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


from flask_cors import cross_origin

@nurse_bp.route('/tasks/<task_id>', methods=['PATCH', 'POST'])
@cross_origin()
@jwt_required()
def update_task_status(task_id):
    """Update status of a task (e.g., pending -> completed)."""
    try:
        nurse_id = get_jwt_identity()
        data = request.json
        status = data.get('status')
        
        if not status:
            return jsonify({'success': False, 'error': 'Status required'}), 400
            
        if db.update_task_status(task_id, status, completed_by=nurse_id):
            # Real-time: Notify doctors when task is completed
            if status == 'completed':
                try:
                    task = db.db.tasks.find_one({'task_id': task_id}, {'_id': 0})
                    if task:
                        notify_task_completed(task.get('doctor_id', ''), {
                            'task_id': task_id,
                            'description': task.get('description', task.get('title', '')),
                            'patient_name': task.get('patient_name', ''),
                            'completed_by': nurse_id
                        })
                except Exception:
                    pass
            
            return jsonify({'success': True, 'message': 'Task updated'}), 200
        else:
            return jsonify({'success': False, 'error': 'Task not found or update failed'}), 404
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/status', methods=['POST'])
@jwt_required()
def update_nurse_status():
    """Update nurse status (online/offline/emergency) and trigger reassignment."""
    try:
        nurse_id = get_jwt_identity()
        data = request.json
        new_status = data.get('status') # 'online', 'offline', 'emergency'
        
        valid_statuses = ['online', 'offline', 'emergency']
        if new_status not in valid_statuses:
             return jsonify({'success': False, 'error': f'Invalid status. Must be one of {valid_statuses}'}), 400
             
        # Update user status in DB
        # is_available logic: true only if online
        is_available = (new_status == 'online')
        
        update_success = db.update_user(nurse_id, {
            'status': new_status, 
            'is_available': is_available
        })
        
        if not update_success:
             return jsonify({'success': False, 'error': 'Failed to update status'}), 500
        
        reassigned_count = 0
        if new_status in ['offline', 'emergency']:
            # Trigger Reassignment
            from services.scheduler import reassign_nurse_tasks
            reassigned_count = reassign_nurse_tasks(nurse_id, db, reason=f"Nurse switched to {new_status}")

        # Real-time: Notify doctors about nurse status change
        try:
            nurse_profile = db.get_user_by_id(nurse_id) or {}
            notify_nurse_status_changed({
                'nurse_id': nurse_id,
                'nurse_name': nurse_profile.get('full_name', ''),
                'status': new_status,
                'reassigned_tasks': reassigned_count
            })
        except Exception:
            pass

        return jsonify({
            'success': True,
            'status': new_status,
            'is_available': is_available,
            'reassigned_tasks': reassigned_count
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/chatbot/all-patients', methods=['POST'])
@jwt_required()
def nurse_chatbot_all_patients():
    """Ask questions about all patients' status (Nurse only)."""
    try:
        data = request.json
        question = data.get('question', '')
        
        if not question:
            return jsonify({'success': False, 'error': 'question is required'}), 400

        # Get all patients status
        all_patients_status = db.get_all_patients_status()
        
        # Prepare context
        context = json.dumps(all_patients_status, indent=2, default=str)
        
        # Get answer
        answer = ask_nurse_assistant(context, question)
        
        return jsonify({
            'success': True,
            'answer': answer,
            'patient_count': len(all_patients_status) if isinstance(all_patients_status, list) else 0
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/chatbot/handoff', methods=['POST'])
@jwt_required()
def nurse_chatbot_handoff():
    """Ask questions about a specific handoff report."""
    try:
        data = request.json
        handoff_id = data.get('handoff_id')
        question = data.get('question', '')
        
        if not handoff_id or not question:
            return jsonify({'success': False, 'error': 'handoff_id and question are required'}), 400

        # Get handoff details
        handoff = db.get_handoff(handoff_id)
        if not handoff:
            return jsonify({'success': False, 'error': 'Handoff not found'}), 404
            
        # Prepare Context for AI
        report = handoff.get('structured_report', {})
        context = f"""
        Patient: {handoff.get('patient_name', 'Unknown')} (ID: {handoff.get('patient_id')})
        Shift: {handoff.get('shift')}
        Timestamp: {handoff.get('timestamp')}
        Nurse: {handoff.get('nurse_name')}
        
        [VITALS]
        {json.dumps(report.get('vitals', {}), indent=2)}
        
        [OBSERVATION]
        {report.get('observation', 'N/A')}
        
        [RECOMMENDATION]
        {report.get('recommendation', 'N/A')}
        
        [MEDICATIONS]
        {json.dumps(report.get('medications', []), indent=2)}
        
        [FULL TRANSCRIPT]
        {handoff.get('transcript', '')}
        """
        
        # Get answer
        answer = ask_nurse_assistant(context, question)
        
        return jsonify({
            'success': True,
            'answer': answer
        })
    except Exception as e:
        logger.error(f"Error in handoff chatbot: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_nurse_profile():
    """Get current nurse profile details."""
    try:
        current_user = get_current_user()
        if not current_user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        # Ensure we return full user object structure expected by frontend
        return jsonify({
            'success': True, 
            'user': current_user
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/patients', methods=['POST'])
@jwt_required()
def create_patient_nurse():
    """Create a new patient (Nurse only)."""
    try:
        current_user = get_current_user()
        if current_user.get('role') != 'nurse':
             return jsonify({'success': False, 'error': 'Unauthorized'}), 403

        data = request.json
        
        # Validate required fields
        required_fields = ['patient_id', 'patient_name', 'date_of_birth', 'gender', 'password']
        missing_fields = [field for field in required_fields if not data.get(field)]
        
        if missing_fields:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing_fields)}'
            }), 400

        # Create user_id
        user_id = f"patient_{data['patient_id']}"
        
        # Check if user_id already exists
        existing_user = db.get_user_by_id(user_id)
        if existing_user:
            return jsonify({
                'success': False,
                'error': 'Patient ID already registered'
            }), 400
        
        # Create patient user account
        patient_data = {
            'user_id': user_id,
            'email': data.get('email', ''),
            'password': data['password'],
            'patient_id': data['patient_id'],
            'patient_name': data['patient_name'],
            'date_of_birth': data['date_of_birth'],
            'gender': data['gender'],
            'phone': data.get('phone', ''),
            'created_by_nurse': current_user['user_id']
        }
        
        patient_user = Patient.create(patient_data)
        
        # Create patient profile in patients collection (combined auth + profile)
        patient_profile_data = patient_user.copy()
        patient_profile_data.update({
            'room_number': data.get('room_number', ''),
            'admission_date': data.get('admission_date', datetime.now().strftime('%Y-%m-%d')),
            'diagnosis': data.get('diagnosis', ''),
            'updated_at': datetime.now()
        })
        
        try:
            db.add_patient(patient_profile_data)
            return jsonify({
                'success': True,
                'message': 'Patient created successfully',
                'patient_id': data['patient_id']
            }), 201
        except Exception as p_err:
             logger.error(f"Failed to create patient: {p_err}")
             return jsonify({'success': False, 'error': f"Failed to create patient: {str(p_err)}"}), 500

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@nurse_bp.route('/patients', methods=['GET'])
@jwt_required()
def get_all_patients_nurse():
    """Get all patients."""
    try:
        patients = db.get_all_patients()
        return jsonify({'success': True, 'patients': patients})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/patients/<patient_id>', methods=['GET'])
@jwt_required()
def get_patient_details_nurse(patient_id):
    """Get patient details."""
    try:
        patient = db.get_patient_status(patient_id)
        if patient:
            return jsonify({'success': True, 'patient': patient})
        return jsonify({'success': False, 'error': 'Patient not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/patients/<patient_id>', methods=['PUT'])
@jwt_required()
def update_patient_details_nurse(patient_id):
    """Update patient details (Nurse)."""
    try:
        nurse_id = get_jwt_identity()
        data = request.json
        
        patient = db.get_patient_status(patient_id)
        if not patient:
             return jsonify({'success': False, 'error': 'Patient not found'}), 404

        update_fields = {}
        if 'patient_name' in data: update_fields['patient_name'] = data['patient_name']
        if 'room_number' in data: update_fields['room_number'] = data['room_number']
        if 'diagnosis' in data: update_fields['diagnosis'] = data['diagnosis']
        if 'age' in data: update_fields['age'] = data['age']
        if 'phone' in data: update_fields['phone'] = data['phone']
        if 'notes' in data: update_fields['notes'] = data['notes']
        
        update_fields['updated_at'] = datetime.now()
        update_fields['updated_by'] = nurse_id
        
        db.patients.update_one(
            {'patient_id': patient_id},
            {'$set': update_fields}
        )
        
        # Propagate patient_name to denormalized copies
        if 'patient_name' in update_fields:
            new_name = update_fields['patient_name']
            try:
                db.db.appointments.update_many({'patient_id': patient_id}, {'$set': {'patient_name': new_name}})
                db.db.tasks.update_many({'patient_id': patient_id}, {'$set': {'patient_name': new_name}})
                db.healthcare_db['patient_meals'].update_many({'patient_id': patient_id}, {'$set': {'patient_name': new_name}})
                db.db.wa_users.update_many({'patient_id': patient_id}, {'$set': {'name': new_name}})
            except Exception:
                pass  # best-effort propagation
        
        return jsonify({'success': True, 'message': 'Patient updated successfully'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/patients/with-vitals', methods=['GET'])
@jwt_required()
def get_patients_vitals_nurse():
    """Get patients with latest vitals."""
    try:
        patients = db.get_patients_with_vitals()
        
        # Convert datetime objects to string to prevent jsonify serialization errors
        for p in patients:
            if 'last_handoff' in p and hasattr(p['last_handoff'], 'isoformat'):
                p['last_handoff'] = p['last_handoff'].isoformat()
            if 'created_at' in p and hasattr(p['created_at'], 'isoformat'):
                p['created_at'] = p['created_at'].isoformat()
            if 'updated_at' in p and hasattr(p['updated_at'], 'isoformat'):
                p['updated_at'] = p['updated_at'].isoformat()
                
        return jsonify({'success': True, 'patients': patients})
    except Exception as e:
        logger.error(f"Error in get_patients_vitals_nurse: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/patients/search', methods=['GET'])
@jwt_required()
def search_patients_nurse():
    """Search patients."""
    try:
        query = request.args.get('q', '').lower()
        patients = db.get_all_patients()
        filtered = [
            p for p in patients 
            if query in p.get('patient_name', '').lower() or 
               query in str(p.get('patient_id', '')).lower() or
               query in str(p.get('room_number', '')).lower()
        ]
        return jsonify({'success': True, 'patients': filtered})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/handoffs', methods=['GET'])
@jwt_required()
def get_handoffs_nurse():
    """Get handoffs (all or by patient)."""
    try:
        patient_id = request.args.get('patient_id')
        if patient_id:
            handoffs = db.get_patient_handoffs(patient_id)
        else:
            handoffs = db.get_all_handoffs()
            
        # Enrich/Format
        for h in handoffs:
            if 'timestamp' in h and hasattr(h['timestamp'], 'isoformat'):
                h['timestamp'] = h['timestamp'].isoformat()
            
            # Enrich with live patient name
            if 'patient_id' in h:
                p = db.get_patient(h['patient_id'])
                if p:
                    h['patient_name'] = p.get('patient_name', h.get('patient_name', 'Unknown'))
            # Enrich with live nurse name
            if 'nurse_id' in h:
                nurse = db.get_user_by_id(h['nurse_id'])
                if nurse:
                    h['nurse_name'] = nurse.get('full_name', h.get('nurse_name', 'Unknown'))
        
        return jsonify({'success': True, 'handoffs': handoffs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/handoffs/<handoff_id>', methods=['GET'])
@jwt_required()
def get_handoff_details_nurse(handoff_id):
    """Get specific handoff."""
    try:
        handoff = db.get_handoff(handoff_id)
        if handoff:
            if 'timestamp' in handoff and hasattr(handoff['timestamp'], 'isoformat'):
                handoff['timestamp'] = handoff['timestamp'].isoformat()
            # Enrich with live names
            if 'patient_id' in handoff:
                p = db.get_patient(handoff['patient_id'])
                if p:
                    handoff['patient_name'] = p.get('patient_name', handoff.get('patient_name', 'Unknown'))
            if 'nurse_id' in handoff:
                nurse = db.get_user_by_id(handoff['nurse_id'])
                if nurse:
                    handoff['nurse_name'] = nurse.get('full_name', handoff.get('nurse_name', 'Unknown'))
            return jsonify({'success': True, 'handoff': handoff})
        return jsonify({'success': False, 'error': 'Handoff not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/transcribe-audio', methods=['POST'])
@jwt_required()
def transcribe_audio():
    """Transcribe uploaded audio file."""
    try:
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
            
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': 'No selected file'}), 400

        # Save temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            audio_file.save(tmp.name)
            tmp_path = tmp.name

        try:
            recorder = SpeechToTextRecorder()
            transcript = recorder.transcribe_audio_file(tmp_path)
            return jsonify({'success': True, 'transcript': transcript})
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@nurse_bp.route('/handoffs', methods=['POST'])
@jwt_required()
def create_handoff():
    """Create a new handoff report from transcript."""
    try:
        data = request.json
        nurse_id = get_jwt_identity()
        user_data = get_current_user() # Need full name
        nurse_name = user_data.get('full_name', 'Unknown Nurse') if user_data else 'Unknown Nurse'
        
        patient_id = data.get('patient_id')
        shift = data.get('shift')
        transcript = data.get('transcript')

        if not all([patient_id, shift, transcript]):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400

        # Generate Structured Report using Groq AI
        try:
            from ai_service import AIService
            ai_service = AIService()
            structured_report = ai_service.structure_handoff_text(transcript)
            logger.debug(f"RAW AI REPORT: {structured_report}")
            
            # Normalize keys to lowercase to avoid frontend issues
            if isinstance(structured_report, dict):
                structured_report = {k.lower(): v for k, v in structured_report.items()}
                logger.debug(f"Normalized Report: {structured_report}")
        except Exception as e:
            logger.error(f"Failed to generate structured report: {e}")
            # Fallback
            structured_report = {
                "vitals": "Processing failed",
                "observation": transcript,
                "recommendation": "Check raw transcript"
            }
        
        handoff_data = {
            'patient_id': patient_id,
            'nurse_id': nurse_id,
            'nurse_name': nurse_name,
            'shift': shift,
            'transcript': transcript,
            'structured_report': structured_report,
            'timestamp': datetime.utcnow()
        }
        
        result = db.add_handoff(handoff_data)
        if result:
            return jsonify({'success': True, 'handoff_id': str(result), 'structured_report': structured_report})
        return jsonify({'success': False, 'error': 'Failed to save handoff'}), 500

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ TASK REJECTION & FILTERING ============

@nurse_bp.route('/tasks/<task_id>/reject', methods=['POST'])
@jwt_required()
def reject_task(task_id):
    """
    Reject a task with reason. Triggers automatic reassignment to another nurse.
    Expected JSON: { "reason": "Patient unavailable" }
    """
    try:
        from services.scheduler import assign_task_after_rejection
        
        nurse_id = get_jwt_identity()
        data = request.json or {}
        reason = data.get('reason', 'No reason provided')
        
        # Get nurse name for logging
        user = db.get_user_by_id(nurse_id)
        nurse_name = user.get('full_name', 'Unknown') if user else 'Unknown'
        
        # 1. Mark task as rejected (logs event automatically)
        reject_success = db.reject_task(task_id, nurse_id, nurse_name, reason)
        
        if not reject_success:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        
        # 2. Trigger reassignment to another nurse
        reassign_success, new_nurse_name = assign_task_after_rejection(
            task_id, nurse_id, db, reason
        )
        
        response = {
            'success': True,
            'message': 'Task rejected',
            'reassigned': reassign_success and new_nurse_name is not None
        }
        
        if new_nurse_name:
            response['new_nurse'] = new_nurse_name
            response['message'] = f'Task rejected and reassigned to {new_nurse_name}'
        elif reassign_success:
            response['message'] = 'Task rejected. No available nurse for reassignment.'
            response['warning'] = True
        
        # Real-time: Notify doctors about task rejection
        try:
            task = db.db.tasks.find_one({'task_id': task_id}, {'_id': 0})
            if task:
                notify_task_rejected(task.get('doctor_id', ''), {
                    'task_id': task_id,
                    'nurse_name': nurse_name,
                    'reason': reason,
                    'patient_name': task.get('patient_name', '')
                })
        except Exception:
            pass
        
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error rejecting task: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@nurse_bp.route('/tasks/filter/<filter_type>', methods=['GET'])
@jwt_required()
def get_filtered_tasks(filter_type):
    """
    Get nurse tasks filtered by: today, upcoming, rejected, or all.
    """
    try:
        nurse_id = get_jwt_identity()
        
        valid_filters = ['today', 'upcoming', 'rejected', 'all']
        if filter_type not in valid_filters:
            return jsonify({
                'success': False, 
                'error': f'Invalid filter. Use one of: {valid_filters}'
            }), 400
        
        tasks = db.get_nurse_tasks_by_date(nurse_id, filter_type)
        
        # Format timestamps
        for task in tasks:
            if 'scheduled_time' in task and hasattr(task['scheduled_time'], 'isoformat'):
                task['scheduled_time'] = task['scheduled_time'].isoformat()
            if 'created_at' in task and hasattr(task['created_at'], 'isoformat'):
                task['created_at'] = task['created_at'].isoformat()
            if 'due_at' in task and hasattr(task['due_at'], 'isoformat'):
                task['due_at'] = task['due_at'].isoformat()
        
        return jsonify({
            'success': True,
            'tasks': tasks,
            'filter': filter_type,
            'count': len(tasks)
        })
    except Exception as e:
        logger.error(f"Error getting filtered tasks: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@nurse_bp.route('/tasks/new-since/<timestamp>', methods=['GET'])
@jwt_required()
def get_new_tasks_since(timestamp):
    """
    Get tasks assigned to nurse since a given timestamp (for notifications).
    Used by polling to detect new task assignments.
    """
    try:
        nurse_id = get_jwt_identity()
        
        # Parse timestamp
        try:
            since = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except ValueError:
            # Try unix timestamp
            try:
                since = datetime.fromtimestamp(float(timestamp))
            except:
                since = datetime.now()
        
        # Get all tasks and filter by created_at > since
        all_tasks = db.get_nurse_tasks(nurse_id)
        
        new_tasks = []
        for task in all_tasks:
            created_at = task.get('created_at')
            # Handle both datetime and reassignment (check updated_at too)
            task_time = created_at or task.get('updated_at')
            
            if task_time:
                if isinstance(task_time, str):
                    try:
                        task_time = datetime.fromisoformat(task_time.replace('Z', '+00:00'))
                    except:
                        continue
                
                if task_time > since:
                    # Format for JSON
                    if 'scheduled_time' in task and hasattr(task['scheduled_time'], 'isoformat'):
                        task['scheduled_time'] = task['scheduled_time'].isoformat()
                    if 'created_at' in task and hasattr(task['created_at'], 'isoformat'):
                        task['created_at'] = task['created_at'].isoformat()
                    new_tasks.append(task)
        
        return jsonify({
            'success': True,
            'tasks': new_tasks,
            'count': len(new_tasks),
            'since': timestamp
        })
    except Exception as e:
        logger.error(f"Error getting new tasks: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ NURSE APPOINTMENT BOOKING (ON BEHALF OF PATIENT) ============

@nurse_bp.route('/doctors', methods=['GET'])
@jwt_required()
def get_doctors_for_nurse():
    """Get all active doctors with their specializations (for nurse to book appointments)."""
    try:
        doctors = list(db.doctors.find({'is_active': True}))
        
        doctor_list = []
        for doc in doctors:
            schedules = list(db.doctor_schedules.find({
                'doctor_id': doc['user_id'],
                'is_available': True
            }))
            
            doctor_list.append({
                'user_id': doc['user_id'],
                'full_name': doc.get('full_name', ''),
                'specialization': doc.get('specialization', 'General'),
                'department': doc.get('department', ''),
                'phone': doc.get('phone', ''),
                'email': doc.get('email', ''),
                'has_schedule': len(schedules) > 0,
                'available_days': [s['day_of_week'] for s in schedules]
            })
        
        return jsonify({
            'success': True,
            'doctors': doctor_list
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@nurse_bp.route('/doctors/<doctor_id>/availability', methods=['GET'])
@jwt_required()
def get_doctor_availability_for_nurse(doctor_id):
    """Get available time slots for a doctor on a specific date."""
    try:
        date_str = request.args.get('date')
        if not date_str:
            return jsonify({'success': False, 'error': 'Date parameter is required'}), 400
        
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            day_of_week = calendar.day_name[date_obj.weekday()]
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        if date_obj.date() < datetime.now().date():
            return jsonify({'success': False, 'error': 'Cannot book appointments in the past'}), 400
        
        schedule = db.doctor_schedules.find_one({
            'doctor_id': doctor_id,
            'day_of_week': day_of_week,
            'is_available': True
        })
        
        if not schedule:
            return jsonify({
                'success': True,
                'available': False,
                'message': f'Doctor is not available on {day_of_week}',
                'slots': []
            }), 200
        
        all_slots = DoctorSchedule.generate_time_slots(
            schedule['start_time'],
            schedule['end_time'],
            schedule.get('slot_duration', 30)
        )
        
        existing_appointments = list(db.appointments.find({
            'doctor_id': doctor_id,
            'date': date_str,
            'status': {'$in': ['pending', 'approved']}
        }))
        
        booked_times = [(apt['start_time'], apt['end_time']) for apt in existing_appointments]
        
        available_slots = []
        for slot in all_slots:
            is_booked = any(
                slot['start'] == bt[0] and slot['end'] == bt[1]
                for bt in booked_times
            )
            
            if date_obj.date() == datetime.now().date():
                slot_hour, slot_min = map(int, slot['start'].split(':'))
                slot_time = datetime.now().replace(hour=slot_hour, minute=slot_min, second=0)
                if slot_time <= datetime.now():
                    continue
            
            available_slots.append({
                'start': slot['start'],
                'end': slot['end'],
                'is_booked': is_booked
            })
        
        return jsonify({
            'success': True,
            'available': True,
            'date': date_str,
            'day_of_week': day_of_week,
            'slots': available_slots
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@nurse_bp.route('/appointments', methods=['POST'])
@jwt_required()
def book_appointment_for_patient():
    """
    Book an appointment on behalf of a patient.
    Expected JSON: {
        "patient_id": "P-001",
        "doctor_id": "D-001",
        "date": "2026-02-10",
        "start_time": "10:00",
        "end_time": "10:30",
        "notes": "General checkup"
    }
    """
    try:
        nurse_id = get_jwt_identity()
        data = request.get_json()
        
        required = ['patient_id', 'doctor_id', 'date', 'start_time', 'end_time']
        for field in required:
            if field not in data:
                return jsonify({'success': False, 'error': f'{field} is required'}), 400
        
        patient = db.get_patient(data['patient_id'])
        if not patient:
            return jsonify({'success': False, 'error': 'Patient not found'}), 404
        
        doctor = db.doctors.find_one({'user_id': data['doctor_id'], 'is_active': True})
        if not doctor:
            return jsonify({'success': False, 'error': 'Doctor not found'}), 404
        
        existing = db.appointments.find_one({
            'doctor_id': data['doctor_id'],
            'date': data['date'],
            'start_time': data['start_time'],
            'status': {'$in': ['pending', 'approved']}
        })
        
        if existing:
            return jsonify({'success': False, 'error': 'This time slot is already booked'}), 409
        
        appointment_data = Appointment.create({
            'patient_id': data['patient_id'],
            'doctor_id': data['doctor_id'],
            'date': data['date'],
            'start_time': data['start_time'],
            'end_time': data['end_time'],
            'notes': data.get('notes', ''),
            'created_by': 'nurse',
            'created_by_id': nurse_id
        })
        
        db.appointments.insert_one(appointment_data)
        
        # Real-time: Notify the doctor about the new appointment
        try:
            notify_new_appointment(data['doctor_id'], {
                'appointment_id': appointment_data.get('appointment_id', ''),
                'patient_name': patient.get('patient_name', ''),
                'date': data['date'],
                'start_time': data['start_time']
            })
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Appointment booked successfully on behalf of patient.',
            'appointment': Appointment.to_dict(appointment_data)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
