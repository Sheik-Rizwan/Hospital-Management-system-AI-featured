from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.user_models import CarePlan, Task
from models.appointment_models import Appointment, DoctorSchedule
from services.task_service import generate_tasks
from services.scheduler import assign_tasks_to_nurses, reassign_nurse_tasks
from mongodb_config import MongoDatabase
import datetime
from services.notification_service import NotificationService
from services.patient_service import PatientService
from services.doctor_service import DoctorService
from services.socket_service import (notify_task_assigned, notify_appointment_status,
                                      notify_new_appointment)
import logging
logger = logging.getLogger(__name__)

doctor_bp = Blueprint('doctor_bp', __name__)

# Initialize DB connection (or reuse global db from app)
db = MongoDatabase()

@doctor_bp.route('/care-plans', methods=['POST'])
@jwt_required()
def create_care_plan():
    """Create a new care plan and generate tasks."""
    try:
        doctor_id = get_jwt_identity()
        data = request.json
        
        # Validate data
        required_fields = ['patient_id', 'medications']
        missing_fields = [field for field in required_fields if not data.get(field)]
        if missing_fields:
            return jsonify({'success': False, 'error': f'Missing fields: {missing_fields}'}), 400

        # Enhance data with doctor info
        data['doctor_id'] = doctor_id
        
        # 1. Create Care Plan
        plan_id = db.add_care_plan(data)
        
        # 2. Generate Tasks from Care Plan
        # Need to fetch the full plan with ID (or just pass data if sufficient)
        # We pass data but include plan_id
        data['plan_id'] = plan_id
        tasks = generate_tasks(data)
        
        # 3. AI Assignment (Assign tasks to available nurses)
        tasks = assign_tasks_to_nurses(tasks, db)
        
        # 4. Add Tasks to DB
        if tasks:
            db.add_tasks(tasks)
        
        # Real-time: Notify nurses about their assigned tasks
        try:
            for task in tasks:
                if task.get('assigned_nurse_id'):
                    notify_task_assigned(task['assigned_nurse_id'], {
                        'task_id': task.get('task_id', ''),
                        'description': task.get('description', task.get('title', '')),
                        'patient_name': task.get('patient_name', ''),
                        'shift': task.get('shift', ''),
                        'priority': task.get('priority', 'normal')
                    })
        except Exception:
            pass
        
        return jsonify({
            'success': True, 
            'plan_id': plan_id,
            'tasks_generated': len(tasks),
            'message': 'Care Plan created and tasks assigned successfully'
        }), 201

    except Exception as e:
        logger.error(f"Error creating care plan: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/care-plans/<patient_id>', methods=['GET'])
@jwt_required()
def get_care_plan_by_patient(patient_id):
    """Get active care plan for a patient (Doctor access)."""
    try:
        plan = db.get_active_care_plan(patient_id)
        if plan:
            # Convert datetime objects to ISO strings
            if 'created_at' in plan:
                plan['created_at'] = plan['created_at'].isoformat()
            if 'updated_at' in plan:
                plan['updated_at'] = plan['updated_at'].isoformat()
            
            return jsonify({'success': True, 'plan': plan})
        else:
            return jsonify({'success': False, 'message': 'No active care plan found'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/patients', methods=['GET'])
@jwt_required()
def get_all_patients_doctor():
    """Get all patients (Doctor access)."""
    try:
        # Doctors should see all patients
        patients = db.get_all_patients()
        return jsonify({
            'success': True,
            'patients': patients,
            'count': len(patients)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/nurses', methods=['GET'])
@jwt_required()
def get_all_nurses_doctor():
    """Get all nurses (Doctor access)."""
    try:
        nurses = db.get_all_nurses()
        return jsonify({'success': True, 'nurses': nurses})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/nurses', methods=['POST'])
@jwt_required()
def create_nurse_doctor():
    """Create a new nurse (Doctor access)."""
    try:
        data = request.json
        # Reuse nurse creation logic or validate locally
        required = ['full_name', 'email', 'password', 'employee_id']
        if not all(k in data for k in required):
            return jsonify({'success': False, 'error': 'Missing fields'}), 400
            
        # Create nurse object
        from models.user_models import Nurse
        user_id = f"nurse_{data['employee_id']}"
        nurse_data = {
            'user_id': user_id,
            'email': data['email'],
            'password': data['password'],
            'full_name': data['full_name'],
            'employee_id': data['employee_id'],
            'role': 'nurse',
            'department': data.get('department', ''),
            'phone': data.get('phone', '')
        }
        
        # Check existence
        if db.get_user_by_email(data['email']):
            return jsonify({'success': False, 'error': 'Email exists'}), 400
            
        nurse = Nurse.create(nurse_data)
        db.create_nurse(nurse)
        return jsonify({'success': True, 'message': 'Nurse added', 'user_id': user_id}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/nurses/<user_id>', methods=['DELETE'])
@jwt_required()
def delete_nurse_doctor(user_id):
    """Delete a nurse (Doctor access). Reassigns pending tasks before deletion."""
    try:
        # 1. Reassign pending tasks from this nurse to other available nurses
        reassigned_count = reassign_nurse_tasks(user_id, db, reason="Nurse Deleted")
        logger.info(f"Reassigned {reassigned_count} tasks from deleted nurse {user_id}")
        
        # 2. Delete the nurse user record
        result = db.nurses.delete_one({'user_id': user_id})
        if result.deleted_count:
            return jsonify({
                'success': True, 
                'message': 'Nurse removed',
                'tasks_reassigned': reassigned_count
            })
        return jsonify({'success': False, 'error': 'Nurse not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/handoffs', methods=['GET'])
@jwt_required()
def get_handoffs_doctor():
    """Get all handoffs (Doctor access)."""
    try:
        handoffs = db.get_all_handoffs()
        # Format timestamps and enrich with patient details
        for h in handoffs:
            if 'timestamp' in h and hasattr(h['timestamp'], 'isoformat'):
                h['timestamp'] = h['timestamp'].isoformat()
            
            # Enrich
            if 'patient_id' in h:
                patient = db.get_patient(h['patient_id'])
                if patient:
                    h['patient_name'] = patient.get('patient_name', 'Unknown')
                    h['room_number'] = patient.get('room_number', 'N/A')
                else:
                    h['room_number'] = 'N/A'
                    h['patient_name'] = h.get('structured_report', {}).get('patient_name', 'Unknown')

        return jsonify({'success': True, 'handoffs': handoffs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/patients/vitals', methods=['GET'])
@jwt_required()
def get_patients_vitals_doctor():
    """Get patients with latest vitals (Doctor access)."""
    try:
        patients = db.get_patients_with_vitals()
        return jsonify({'success': True, 'patients': patients})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@doctor_bp.route('/tasks', methods=['GET'])
@jwt_required()
def get_all_tasks_doctor():
    """Get all tasks (Doctor access) to see AI assignment status."""
    try:
        # We need a method in DB to get *all* tasks or filter by doctor's patients
        # For now, let's assume we want all tasks to oversee the ward.
        # Assuming db.get_all_tasks() exists or we use raw mongo
        tasks = list(db.db.tasks.find({}, {'_id': 0}).sort('scheduled_time', 1))
        return jsonify({'success': True, 'tasks': tasks, 'count': len(tasks)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ NEW ENDPOINTS FOR DOCTOR DASHBOARD ENHANCEMENTS ============

@doctor_bp.route('/nurse-assignments', methods=['GET'])
@jwt_required()
def get_nurse_assignments():
    """Get all nurses with their tasks grouped by shift -> patient -> completed tasks."""
    try:
        assignments = db.get_nurse_assignments_grouped()
        return jsonify({
            'success': True,
            'assignments': assignments,
            'total_nurses': len(assignments)
        })
    except Exception as e:
        logger.error(f"Error getting nurse assignments: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/patients/<patient_id>/medication-history', methods=['GET'])
@jwt_required()
def get_patient_medication_history(patient_id):
    """Get medication history for a specific patient."""
    try:
        medications = db.get_patient_medication_history(patient_id)
        
        # Format timestamps for JSON serialization
        for med in medications:
            if 'prescribed_date' in med and hasattr(med['prescribed_date'], 'isoformat'):
                med['prescribed_date'] = med['prescribed_date'].isoformat()
        
        return jsonify({
            'success': True,
            'patient_id': patient_id,
            'medications': medications,
            'total': len(medications)
        })
    except Exception as e:
        logger.error(f"Error getting medication history: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/nurse-details/<nurse_id>', methods=['GET'])
@jwt_required()
def get_nurse_details(nurse_id):
    """Get detailed nurse activity: shifts worked, tasks completed, handoffs submitted."""
    try:
        details = db.get_nurse_activity_details(nurse_id)
        if not details:
            return jsonify({'success': False, 'error': 'Nurse not found'}), 404
        
        # Format timestamps for JSON serialization
        def serialize_tasks(task_list):
            for task in task_list:
                for field in ('completed_at', 'scheduled_time', 'created_at', 'updated_at'):
                    if field in task and hasattr(task[field], 'isoformat'):
                        task[field] = task[field].isoformat()

        serialize_tasks(details.get('recent_completed_tasks', []))
        serialize_tasks(details.get('recent_pending_tasks', []))
        serialize_tasks(details.get('recent_reassigned_tasks', []))
        
        for handoff in details.get('recent_handoffs', []):
            if 'timestamp' in handoff and hasattr(handoff['timestamp'], 'isoformat'):
                handoff['timestamp'] = handoff['timestamp'].isoformat()
        
        return jsonify({
            'success': True,
            'nurse': details
        })
    except Exception as e:
        logger.error(f"Error getting nurse details: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/patients/<patient_id>/care-plans-history', methods=['GET'])
@jwt_required()
def get_patient_care_plans_history(patient_id):
    """Get all care plans (active + inactive) for a patient."""
    try:
        plans = db.get_all_care_plans_for_patient(patient_id)
        
        # Format timestamps for JSON serialization
        for plan in plans:
            if 'created_at' in plan and hasattr(plan['created_at'], 'isoformat'):
                plan['created_at'] = plan['created_at'].isoformat()
            if 'updated_at' in plan and hasattr(plan['updated_at'], 'isoformat'):
                plan['updated_at'] = plan['updated_at'].isoformat()
        
        return jsonify({
            'success': True,
            'patient_id': patient_id,
            'care_plans': plans,
            'total': len(plans)
        })
    except Exception as e:
        logger.error(f"Error getting care plans history: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ SCHEDULED MEDICATION TASKS ============

@doctor_bp.route('/scheduled-medication', methods=['POST'])
@jwt_required()
def create_scheduled_medication():
    """
    Create a scheduled medication plan that expands into multiple tasks.
    One task per day per selected shift for the date range.
    
    Expected JSON:
    {
        "patient_id": "P-001",
        "medication_name": "Paracetamol 500mg",
        "shifts": ["day", "afternoon", "night"],
        "start_date": "2026-01-30",
        "end_date": "2026-02-09",
        "notes": "Take with food"
    }
    """
    try:
        from datetime import datetime, timedelta
        from bson import ObjectId
        
        doctor_id = get_jwt_identity()
        data = request.json
        
        # Validate required fields
        required = ['patient_id', 'medication_name', 'shifts', 'start_date', 'end_date']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400
        
        patient_id = data['patient_id']
        medication_name = data['medication_name']
        shifts = data['shifts']  # ['day', 'afternoon', 'night']
        start_date_str = data['start_date']
        end_date_str = data['end_date']
        notes = data.get('notes', '')
        
        # Validate shifts
        valid_shifts = ['day', 'afternoon', 'night']
        shifts = [s.lower() for s in shifts if s.lower() in valid_shifts]
        if not shifts:
            return jsonify({'success': False, 'error': 'At least one valid shift required'}), 400
        
        # Parse dates
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        if end_date < start_date:
            return jsonify({'success': False, 'error': 'End date must be after start date'}), 400
        
        # Get patient info
        patient = db.get_patient(patient_id)
        patient_name = patient.get('patient_name', '') if patient else ''
        
        # Shift times
        shift_times = {
            'day': '09:00',
            'afternoon': '14:00',
            'night': '21:00'
        }
        
        # Generate tasks: one per day per shift
        tasks = []
        current_date = start_date
        
        while current_date <= end_date:
            for shift in shifts:
                time_str = shift_times.get(shift, '09:00')
                hour, minute = map(int, time_str.split(':'))
                scheduled_time = current_date.replace(hour=hour, minute=minute)
                due_at = scheduled_time
                
                task_data = {
                    'task_id': f"task_{ObjectId()}",
                    'patient_id': patient_id,
                    'patient_name': patient_name,
                    'doctor_id': doctor_id,
                    'task_type': 'medication',
                    'title': medication_name,
                    'description': f"Give {medication_name}",
                    'scheduled_time': scheduled_time,
                    'shift': shift,
                    'schedule': {
                        'days': shifts,
                        'start_date': start_date_str,
                        'end_date': end_date_str,
                        'times': shift_times
                    },
                    'status': 'pending',
                    'priority': 'high',
                    'notes': notes,
                    'rejected': False,
                    'due_at': due_at,
                    'created_by': doctor_id
                }
                
                task = Task.create(task_data)
                tasks.append(task)
            
            current_date += timedelta(days=1)
        
        # Assign nurses
        tasks = assign_tasks_to_nurses(tasks, db)
        
        # Save to DB
        if tasks:
            db.add_tasks(tasks)
        
        # Real-time: Notify nurses about scheduled medication tasks
        try:
            notified_nurses = set()
            for task in tasks:
                nurse_id = task.get('assigned_nurse_id')
                if nurse_id and nurse_id not in notified_nurses:
                    notify_task_assigned(nurse_id, {
                        'task_id': task.get('task_id', ''),
                        'description': f"Scheduled medication: {medication_name}",
                        'patient_name': patient_name,
                        'shift': task.get('shift', ''),
                        'priority': 'high'
                    })
                    notified_nurses.add(nurse_id)
        except Exception:
            pass
        
        # Count assignments
        assigned_count = sum(1 for t in tasks if t.get('assigned_nurse_id'))
        unassigned_count = len(tasks) - assigned_count
        
        return jsonify({
            'success': True,
            'message': f'Scheduled medication created: {len(tasks)} tasks generated',
            'tasks_generated': len(tasks),
            'tasks_assigned': assigned_count,
            'tasks_unassigned': unassigned_count
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating scheduled medication: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/unassigned-tasks', methods=['GET'])
@jwt_required()
def get_unassigned_tasks():
    """Get all tasks that have no nurse assigned (doctor warning)."""
    try:
        tasks = db.get_unassigned_tasks()
        
        # Format timestamps
        for task in tasks:
            if 'scheduled_time' in task and hasattr(task['scheduled_time'], 'isoformat'):
                task['scheduled_time'] = task['scheduled_time'].isoformat()
            if 'created_at' in task and hasattr(task['created_at'], 'isoformat'):
                task['created_at'] = task['created_at'].isoformat()
        
        return jsonify({
            'success': True,
            'tasks': tasks,
            'count': len(tasks),
            'warning': len(tasks) > 0
        })
    except Exception as e:
        logger.error(f"Error getting unassigned tasks: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ MEALS ENDPOINTS ============

@doctor_bp.route('/meals', methods=['POST'])
@jwt_required()
def create_meal():
    """Create a meal entry for a patient."""
    try:
        doctor_id = get_jwt_identity()
        data = request.json
        
        required = ['patient_id', 'day', 'type', 'menu']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400
        
        # Get patient name
        patient = db.get_patient(data['patient_id'])
        patient_name = patient.get('patient_name', '') if patient else ''
        
        meal_data = {
            'patient_id': data['patient_id'],
            'patient_name': patient_name,
            'doctor_id': doctor_id,
            'day': data['day'],
            'type': data['type'],  # breakfast, lunch, dinner
            'menu': data['menu'],
            'dietary_restrictions': data.get('dietary_restrictions', []),
            'notes': data.get('notes', ''),
            'assigned_to': data.get('assigned_to'),
            'status': 'pending'
        }
        
        meal_id = db.add_meal(meal_data)
        
        return jsonify({
            'success': True,
            'meal_id': meal_id,
            'message': 'Meal created successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating meal: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/meals', methods=['GET'])
@jwt_required()
def get_meals():
    """Get meals, optionally filtered by patient_id or day."""
    try:
        patient_id = request.args.get('patient_id')
        day = request.args.get('day')
        
        meals = db.get_meals(patient_id=patient_id, day=day)
        
        # Format timestamps
        for meal in meals:
            if 'created_at' in meal and hasattr(meal['created_at'], 'isoformat'):
                meal['created_at'] = meal['created_at'].isoformat()
            if 'served_at' in meal and hasattr(meal['served_at'], 'isoformat'):
                meal['served_at'] = meal['served_at'].isoformat()
        
        return jsonify({
            'success': True,
            'meals': meals,
            'count': len(meals)
        })
    except Exception as e:
        logger.error(f"Error getting meals: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/meals/<meal_id>', methods=['PATCH'])
@jwt_required()
def update_meal(meal_id):
    """Update a meal entry (assign nurse, change status, etc.)."""
    try:
        data = request.json
        
        allowed_fields = ['assigned_to', 'assigned_nurse_name', 'status', 'notes', 'menu', 'dietary_restrictions']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        
        if not update_data:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400
        
        success = db.update_meal(meal_id, update_data)
        
        if success:
            return jsonify({'success': True, 'message': 'Meal updated'})
        else:
            return jsonify({'success': False, 'error': 'Meal not found or no changes made'}), 404
            
    except Exception as e:
        logger.error(f"Error updating meal: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ DOCTOR SCHEDULE MANAGEMENT ============

@doctor_bp.route('/schedule', methods=['POST'])
@jwt_required()
def create_or_update_schedule():
    """
    Create or update doctor's weekly schedule.
    Expected JSON: {
        "schedules": [
            {"day_of_week": "Monday", "start_time": "09:00", "end_time": "17:00", "is_available": true},
            {"day_of_week": "Tuesday", "start_time": "10:00", "end_time": "16:00", "is_available": true}
        ],
        "slot_duration": 30  // optional, default 30 minutes
    }
    """
    try:
        doctor_id = get_jwt_identity()
        data = request.get_json()
        
        schedules = data.get('schedules', [])
        slot_duration = data.get('slot_duration', 30)
        
        if not schedules:
            return jsonify({'success': False, 'error': 'At least one schedule entry required'}), 400
        
        created_schedules = []
        
        # First, remove existing schedules for the days being updated to allow clean slate for multi-shifts
        days_to_update = set(s.get('day_of_week') for s in schedules)
        for day in days_to_update:
            if day in DoctorSchedule.DAYS_OF_WEEK:
                db.doctor_schedules.delete_many({
                    'doctor_id': doctor_id,
                    'day_of_week': day
                })

        created_schedules = []
        
        for sched in schedules:
            day = sched.get('day_of_week')
            if day not in DoctorSchedule.DAYS_OF_WEEK:
                continue
            
            schedule_data = {
                'doctor_id': doctor_id,
                'day_of_week': day,
                'start_time': sched.get('start_time', '09:00'),
                'end_time': sched.get('end_time', '17:00'),
                'slot_duration': slot_duration,
                'is_available': sched.get('is_available', True)
            }
            
            # Create new schedule entry
            new_schedule = DoctorSchedule.create(schedule_data)
            db.doctor_schedules.insert_one(new_schedule)
            schedule_data['schedule_id'] = new_schedule['schedule_id']
            
            created_schedules.append(schedule_data)
        
        return jsonify({
            'success': True,
            'message': f'Schedule updated for {len(created_schedules)} days',
            'schedules': created_schedules
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating schedule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/schedule', methods=['GET'])
@jwt_required()
def get_doctor_schedule():
    """Get current doctor's weekly schedule."""
    try:
        doctor_id = get_jwt_identity()
        
        schedules = list(db.doctor_schedules.find({'doctor_id': doctor_id}))
        
        result = []
        for sched in schedules:
            result.append(DoctorSchedule.to_dict(sched))
        
        # Sort by day of week
        day_order = {day: i for i, day in enumerate(DoctorSchedule.DAYS_OF_WEEK)}
        result.sort(key=lambda x: day_order.get(x['day_of_week'], 7))
        
        return jsonify({
            'success': True,
            'schedules': result
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/schedule/<schedule_id>', methods=['DELETE'])
@jwt_required()
def delete_schedule(schedule_id):
    """Remove a schedule entry."""
    try:
        doctor_id = get_jwt_identity()
        
        result = db.doctor_schedules.delete_one({
            'schedule_id': schedule_id,
            'doctor_id': doctor_id
        })
        
        if result.deleted_count:
            return jsonify({'success': True, 'message': 'Schedule deleted'}), 200
        return jsonify({'success': False, 'error': 'Schedule not found'}), 404
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ DOCTOR APPOINTMENT MANAGEMENT ============

@doctor_bp.route('/appointments', methods=['GET'])
@jwt_required()
def get_doctor_appointments():
    """Get appointments for the logged-in doctor."""
    try:
        doctor_id = get_jwt_identity()
        
        # Get status filter
        status = request.args.get('status')  # pending, approved, rejected, completed
        
        query = {'doctor_id': doctor_id}
        if status:
            query['status'] = status
        
        appointments = list(db.appointments.find(query).sort('date', -1))
        
        # Enrich with patient info and booking source details
        result = []
        for apt in appointments:
            patient = db.get_patient(apt['patient_id'])
            apt_dict = Appointment.to_dict(apt)
            # Preserve the appointment's own patient_name (e.g. WhatsApp "booked for someone else")
            # Only fall back to DB patient name if appointment has no name stored
            apt_dict['patient_name'] = apt_dict.get('patient_name') or (
                patient.get('patient_name', '') if patient else ''
            )
            apt_dict['patient_room'] = patient.get('room_number', '') if patient else ''
            apt_dict['patient_phone'] = patient.get('phone', '') if patient else ''
            # Include WhatsApp number if booked via WhatsApp
            if apt.get('created_by') == 'whatsapp':
                apt_dict['whatsapp_number'] = apt.get('created_by_id', '')
            else:
                apt_dict['whatsapp_number'] = ''
            # Include shift info
            apt_dict['shift'] = apt.get('shift', '')
            result.append(apt_dict)
        
        # Count pending for badge (include both pending and pending_doctor_approval)
        pending_count = sum(1 for a in result if a['status'] in ['pending', 'pending_doctor_approval'])
        
        return jsonify({
            'success': True,
            'appointments': result,
            'pending_count': pending_count
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/appointments/<appointment_id>', methods=['PATCH'])
@jwt_required()
def update_appointment_status(appointment_id):
    """
    Approve, reject, or mark appointment completed.
    Expected JSON: {
        "status": "approved" | "rejected" | "completed",
        "rejection_reason": "..." // required if status is rejected
    }
    """
    try:
        doctor_id = get_jwt_identity()
        data = request.get_json()
        
        new_status = data.get('status')
        if new_status not in ['approved', 'rejected', 'completed']:
            return jsonify({'success': False, 'error': 'Invalid status. Use approved, rejected, or completed'}), 400
        
        # Find the appointment (match both 'pending' and 'pending_doctor_approval')
        appointment = db.appointments.find_one({
            'appointment_id': appointment_id,
            'doctor_id': doctor_id
        })
        
        if not appointment:
            return jsonify({'success': False, 'error': 'Appointment not found'}), 404
        
        # Map 'approved' to 'confirmed' for consistency
        db_status = 'confirmed' if new_status == 'approved' else new_status
        
        update_data = {
            'status': db_status,
            'updated_at': datetime.datetime.now()
        }
        
        if new_status == 'rejected':
            rejection_reason = data.get('rejection_reason', '')
            if not rejection_reason:
                return jsonify({'success': False, 'error': 'Rejection reason is required'}), 400
            update_data['rejection_reason'] = rejection_reason
        
        db.appointments.update_one(
            {'appointment_id': appointment_id},
            {'$set': update_data}
        )
        
        # Log the action (Audit)
        try:
            from models.appointment_models import AppointmentLog
            log_entry = AppointmentLog.create({
                'appointment_id': appointment_id,
                'action': new_status,
                'performed_by': doctor_id,
                'performed_by_role': 'doctor',
                'details': f"Appointment {new_status} by doctor. {data.get('rejection_reason', '')}"
            })
            db.appointment_logs.insert_one(log_entry)
        except Exception as log_error:
            logger.error(f"Failed to create audit log: {log_error}")

        status_messages = {
            'approved': 'Appointment approved successfully',
            'rejected': 'Appointment rejected',
            'completed': 'Appointment marked as completed'
        }

        # ── Send WhatsApp Notification ──
        try:
            # Fetch patient info — try patients collection directly
            patient = db.db.patients.find_one({'patient_id': appointment['patient_id']})
            
            # Get doctor info
            doctor = db.db.doctors.find_one({'user_id': doctor_id}, {'full_name': 1, '_id': 0})
            doctor_name = doctor.get('full_name', '') if doctor else ''
            
            if patient and patient.get('phone'):
                patient_phone = patient['phone']
                patient_name = patient.get('patient_name', 'Patient')
                
                if new_status == 'approved':
                    NotificationService.notify_appointment_approved(
                        patient_phone,
                        patient_name,
                        appointment.get('date', ''),
                        appointment.get('start_time', ''),
                        doctor_name
                    )
                    logger.info(f"WhatsApp approval sent to {patient_phone}")
                    
                elif new_status == 'rejected':
                    NotificationService.notify_appointment_rejected(
                        patient_phone,
                        patient_name,
                        appointment.get('date', ''),
                        appointment.get('start_time', ''),
                        doctor_name,
                        data.get('rejection_reason', 'Not specified')
                    )
                    logger.info(f"WhatsApp rejection sent to {patient_phone}")
            else:
                logger.warning(f"No phone found for patient {appointment['patient_id']}")
                
        except Exception as notify_error:
            logger.error(f"Failed to send WhatsApp notification: {notify_error}", exc_info=True)
        
        # Real-time: Notify the nurse/booker about appointment status
        try:
            booked_by = appointment.get('booked_by_nurse_id', appointment.get('booked_by'))
            if booked_by:
                notify_appointment_status(booked_by, {
                    'appointment_id': appointment_id,
                    'status': new_status,
                    'doctor_name': doctor_name if 'doctor_name' in dir() else '',
                    'date': appointment.get('date', ''),
                    'start_time': appointment.get('start_time', ''),
                    'rejection_reason': data.get('rejection_reason', '')
                })
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': status_messages[new_status]
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating appointment status: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@doctor_bp.route('/patients/<patient_id>', methods=['PUT'])
@jwt_required()
def update_patient_details(patient_id):
    """Update patient details (Room, Diagnosis, Notes, etc.)."""
    try:
        doctor_id = get_jwt_identity() # Verify doctor is authenticated
        data = request.json
        
        # Validation could go here (e.g. check if patient exists)
        patient = db.get_patient(patient_id)
        if not patient:
             return jsonify({'success': False, 'error': 'Patient not found'}), 404

        # Fields allowed to be updated
        update_fields = {}
        if 'patient_name' in data: update_fields['patient_name'] = data['patient_name']
        if 'room_number' in data: update_fields['room_number'] = data['room_number']
        if 'diagnosis' in data: update_fields['diagnosis'] = data['diagnosis']
        if 'age' in data: update_fields['age'] = data['age']
        if 'gender' in data: update_fields['gender'] = data['gender']
        if 'phone' in data: update_fields['phone'] = data['phone']
        if 'notes' in data: update_fields['notes'] = data['notes']
        if 'admission_date' in data: update_fields['admission_date'] = data['admission_date']
        
        update_fields['updated_at'] = datetime.datetime.now()
        update_fields['updated_by'] = doctor_id
        
        # Update in DB
        db.db.patients.update_one(
            {'patient_id': patient_id},
            {'$set': update_fields}
        )
        
        return jsonify({'success': True, 'message': 'Patient updated successfully'})

    except Exception as e:
        logger.error(f"Error updating patient: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
