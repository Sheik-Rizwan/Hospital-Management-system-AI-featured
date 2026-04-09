# patient_routes.py - Patient Dashboard & Appointment Routes

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from mongodb_config import MongoDatabase
from services.appointment_service import AppointmentService
from datetime import datetime
import json
import os
import tempfile
import uuid

try:
    from services.chatbot import ask_nurse_assistant
except Exception:
    ask_nurse_assistant = None

try:
    from services.voice_booking_service import VoiceBookingService
    voice_booking_service = VoiceBookingService()
except Exception as _vbs_err:
    import logging
    logging.getLogger(__name__).warning(f"VoiceBookingService unavailable: {_vbs_err}")
    voice_booking_service = None

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


# ============ VOICE BOOKING ============

@patient_bp.route('/voice/booking/languages', methods=['GET'])
@jwt_required()
def voice_booking_languages():
    """Return supported language options for voice booking UI."""
    if not voice_booking_service:
        return jsonify({'success': False, 'error': 'Voice booking service unavailable'}), 503
    return jsonify({
        'success': True,
        'languages': voice_booking_service.get_supported_languages()
    }), 200


@patient_bp.route('/voice/booking/stt', methods=['POST'])
@jwt_required()
def voice_booking_stt():
    """
    Convert patient's spoken audio to text.
    Accepts multipart/form-data:  audio (file) + language_code (str, default 'en')
    Returns: { transcript, language_code }
    """
    if not voice_booking_service:
        return jsonify({'success': False, 'error': 'Voice booking service unavailable'}), 503

    audio_file = request.files.get('audio')
    if not audio_file:
        return jsonify({'success': False, 'error': 'No audio file provided'}), 400

    language_code = request.form.get('language_code', 'en')
    if language_code not in ('en', 'hi', 'te', 'kn', 'ur'):
        language_code = 'en'

    # Save upload to a temp file
    suffix = os.path.splitext(audio_file.filename or 'audio.webm')[1] or '.webm'
    tmp_path = os.path.join(tempfile.gettempdir(), f"voice_stt_{uuid.uuid4().hex}{suffix}")
    try:
        audio_file.save(tmp_path)
        result = voice_booking_service.transcribe_audio(tmp_path, language_code)
    except Exception as e:
        return jsonify({'success': False, 'error': f'Transcription error: {str(e)}'}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not result.get('transcript'):
        return jsonify({'success': False, 'error': result.get('error', 'Transcription failed')}), 422

    return jsonify({
        'success': True,
        'transcript': result['transcript'],
        'language_code': result.get('language_code', language_code)
    }), 200


@patient_bp.route('/voice/booking/turn', methods=['POST'])
@jwt_required()
def voice_booking_turn():
    """
    Process one conversation turn with the AI booking assistant.
    Body: { messages: [{role, content}], language_code: 'en'|'hi'|'te'|'kn' }
    Returns: { reply_text, booking_confirmed, appointment_data? }
    """
    if not voice_booking_service:
        return jsonify({'success': False, 'error': 'Voice booking service unavailable'}), 503

    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        messages = data.get('messages', [])
        language_code = data.get('language_code', 'en')

        if not messages:
            return jsonify({'success': False, 'error': 'messages array is required'}), 400

        result = voice_booking_service.process_turn(
            messages=messages,
            language_code=language_code,
            patient_id=user_id
        )

        return jsonify({
            'success': True,
            'reply_text': result['reply_text'],
            'booking_confirmed': result['booking_confirmed'],
            'appointment_data': result.get('appointment_data')
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@patient_bp.route('/voice/booking/tts', methods=['POST'])
@jwt_required()
def voice_booking_tts():
    """
    Convert AI reply text to speech audio.
    Body: { text: str, language_code: 'en'|'hi'|'te'|'kn' }
    Returns: audio/wav file stream
    """
    if not voice_booking_service:
        return jsonify({'success': False, 'error': 'Voice booking service unavailable'}), 503

    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        language_code = data.get('language_code', 'en')

        if not text:
            return jsonify({'success': False, 'error': 'text is required'}), 400

        audio_path = voice_booking_service.synthesize_speech(text, language_code)

        if not audio_path or not os.path.exists(audio_path):
            return jsonify({'success': False, 'error': 'TTS generation failed'}), 500

        return send_file(
            audio_path,
            mimetype='audio/wav',
            as_attachment=False,
            download_name=f"reply_{language_code}.wav"
        )

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
