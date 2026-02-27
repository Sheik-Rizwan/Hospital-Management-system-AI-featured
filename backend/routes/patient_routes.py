# patient_routes.py - Patient Dashboard & Appointment Routes

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from mongodb_config import MongoDatabase
from services.appointment_service import AppointmentService
from datetime import datetime
import json

try:
    from services.chatbot import ask_nurse_assistant
except Exception:
    ask_nurse_assistant = None

patient_bp = Blueprint('patient_bp', __name__)
db = MongoDatabase()
appointment_service = AppointmentService()


def get_patient_id_from_jwt():
    """Get the patient_id from the JWT user_id.
    JWT stores user_id like 'patient_01', but DB uses patient_id like '01'.
    This function finds the patient record by user_id and returns the patient_id.
    """
    user_id = get_jwt_identity()
    patient = db.patients.find_one({'user_id': user_id}, {'_id': 0, 'patient_id': 1})
    if patient:
        return patient['patient_id']
    # Fallback: try stripping 'patient_' prefix
    if user_id.startswith('patient_'):
        return user_id.replace('patient_', '', 1)
    return user_id


# ============ PATIENT DATA ============

@patient_bp.route('/my-data', methods=['GET'])
@jwt_required()
def get_my_data():
    """Get the logged-in patient's profile and latest vitals."""
    try:
        patient_id = get_patient_id_from_jwt()
        status = db.get_patient_status(patient_id)

        if not status:
            return jsonify({'success': False, 'error': 'Patient data not found'}), 404

        return jsonify({'success': True, 'data': status}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@patient_bp.route('/my-handoffs', methods=['GET'])
@jwt_required()
def get_my_handoffs():
    """Get all handoff records for the logged-in patient."""
    try:
        patient_id = get_patient_id_from_jwt()
        handoffs = db.get_patient_handoffs(patient_id)

        # Format timestamps for JSON
        for h in handoffs:
            if 'timestamp' in h and hasattr(h['timestamp'], 'isoformat'):
                h['timestamp'] = h['timestamp'].isoformat()

        return jsonify({'success': True, 'handoffs': handoffs}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@patient_bp.route('/chatbot', methods=['POST'])
@jwt_required()
def patient_chatbot():
    """Answer patient questions about their own health data."""
    try:
        if not ask_nurse_assistant:
            return jsonify({'success': False, 'error': 'Chatbot service not available'}), 503

        data = request.get_json()
        question = data.get('question', '')

        if not question:
            return jsonify({'success': False, 'error': 'Question is required'}), 400

        patient_id = get_patient_id_from_jwt()
        status = db.get_patient_status(patient_id)

        if not status:
            return jsonify({'success': False, 'error': 'Patient data not found'}), 404

        # Build context from patient data
        context = json.dumps(status, indent=2, default=str)
        answer = ask_nurse_assistant(context, question)

        return jsonify({'success': True, 'answer': answer}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ DOCTOR LISTING ============

@patient_bp.route('/doctors', methods=['GET'])
@jwt_required()
def get_doctors():
    """Get all active doctors with their specializations."""
    try:
        doctors = appointment_service.get_active_doctors()
        return jsonify({'success': True, 'doctors': doctors}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@patient_bp.route('/doctors/<doctor_id>/availability', methods=['GET'])
@jwt_required()
def get_doctor_availability(doctor_id):
    """Get available time slots for a doctor."""
    try:
        date_str = request.args.get('date')
        if not date_str:
            return jsonify({'success': False, 'error': 'Date parameter is required'}), 400

        result = appointment_service.get_doctor_availability(doctor_id, date_str)
        return jsonify({
            'success': True,
            'available': result['available'],
            'date': result.get('date'),
            'slots': result.get('slots', []),
            'message': result.get('message', '')
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ APPOINTMENT BOOKING ============

@patient_bp.route('/appointments', methods=['POST'])
@jwt_required()
def book_appointment():
    """Book a new appointment."""
    try:
        user_id = get_jwt_identity()
        patient_id = get_patient_id_from_jwt()
        data = request.get_json()

        # Validate required fields
        required = ['doctor_id', 'date', 'start_time', 'end_time']
        for field in required:
            if field not in data:
                return jsonify({'success': False, 'error': f'{field} is required'}), 400

        # Get patient name for the appointment record
        patient = db.get_patient(patient_id)
        patient_name = patient.get('patient_name', 'Patient') if patient else 'Patient'

        appt_data = {
            'patient_id': patient_id,
            'patient_name': patient_name,
            'doctor_id': data['doctor_id'],
            'date': data['date'],
            'start_time': data['start_time'],
            'end_time': data['end_time'],
            'notes': data.get('notes', ''),
            'created_by': 'patient',
            'created_by_id': user_id,
            'status': 'pending'
        }

        new_appointment = appointment_service.book_appointment(appt_data)

        return jsonify({
            'success': True,
            'message': 'Appointment booked successfully. Awaiting doctor approval.',
            'appointment': new_appointment
        }), 201

    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 409
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@patient_bp.route('/appointments', methods=['GET'])
@jwt_required()
def get_patient_appointments():
    """Get patient's appointment history."""
    try:
        patient_id = get_patient_id_from_jwt()
        appointments = appointment_service.get_patient_appointments(patient_id)

        return jsonify({'success': True, 'appointments': appointments}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@patient_bp.route('/appointments/<appointment_id>/cancel', methods=['PATCH'])
@jwt_required()
def cancel_appointment(appointment_id):
    """Cancel a pending appointment."""
    try:
        user_id = get_jwt_identity()
        appointment_service.cancel_appointment(appointment_id, user_id, 'patient')

        return jsonify({
            'success': True,
            'message': 'Appointment cancelled successfully'
        }), 200

    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
