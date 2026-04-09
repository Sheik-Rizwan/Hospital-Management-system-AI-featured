# voice_routes.py — Twilio Voice Bot Routes
# Handles incoming calls, outbound call triggers, and TwiML generation

import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
from twilio.rest import Client as TwilioClient
from dotenv import load_dotenv
from logger_config import logger

load_dotenv()

TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN', '')
TWILIO_PHONE_NUMBER = os.getenv('TWILIO_PHONE_NUMBER', '')
PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', '')

voice_bp = Blueprint('voice', __name__)


# ═══════════════════════════════════════════
#  INCOMING CALL WEBHOOK
# ═══════════════════════════════════════════

@voice_bp.route('/incoming', methods=['POST'])
def handle_incoming_call():
    """
    Twilio webhook for inbound calls.
    Returns TwiML with <Connect><Stream> to pipe audio into our WebSocket.
    Configure this URL in your Twilio Phone Number webhook settings.
    """
    caller = request.form.get('From', 'Unknown')
    call_sid = request.form.get('CallSid', '')
    logger.info(f"Incoming call from {caller}, CallSid={call_sid}")

    # Resolve patient ID from phone number if registered
    patient_id = _resolve_patient_by_phone(caller)

    # Build WebSocket URL
    ws_url = _get_ws_url('/api/voice/stream')

    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=ws_url)
    stream.parameter(name='callType', value='inbound')
    stream.parameter(name='patientId', value=patient_id)
    connect.append(stream)
    response.append(connect)

    logger.info(f"Streaming inbound call to WebSocket: {ws_url}")
    return str(response), 200, {'Content-Type': 'text/xml'}


# ═══════════════════════════════════════════
#  OUTBOUND CALL TRIGGER (called after approval)
# ═══════════════════════════════════════════

@voice_bp.route('/outbound', methods=['POST'])
def trigger_outbound_call():
    """
    Internal API to trigger an outbound Twilio call to a patient.
    Called after a doctor approves an appointment.

    Expected JSON: {
        "phone": "+91XXXXXXXXXX",
        "patient_name": "John",
        "doctor_name": "Dr. Sharma",
        "date": "2026-04-10",
        "time": "10:00 AM",
        "appointment_id": "APT-xxx"
    }
    """
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        logger.warning("Twilio credentials not configured — skipping outbound call")
        return jsonify({'success': False, 'error': 'Twilio not configured'}), 503

    data = request.get_json()
    phone = data.get('phone', '')
    if not phone:
        return jsonify({'success': False, 'error': 'Phone number required'}), 400

    try:
        client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        # Build the outbound connect webhook URL with appointment context
        connect_url = f"{PUBLIC_BASE_URL}/api/voice/outbound-connect"

        call = client.calls.create(
            to=phone,
            from_=TWILIO_PHONE_NUMBER,
            url=connect_url,
            method='POST',
            status_callback=f"{PUBLIC_BASE_URL}/api/voice/status",
            status_callback_method='POST',
            # Pass appointment context as query params to the TwiML webhook
            url_params={
                'patientName': data.get('patient_name', ''),
                'doctorName': data.get('doctor_name', ''),
                'appointmentDate': data.get('date', ''),
                'appointmentTime': data.get('time', ''),
                'appointmentId': data.get('appointment_id', ''),
            }
        )

        logger.info(f"Outbound call initiated: SID={call.sid} to {phone}")
        return jsonify({
            'success': True,
            'call_sid': call.sid,
            'message': f'Calling {phone}...'
        }), 200

    except Exception as e:
        logger.error(f"Outbound call failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ═══════════════════════════════════════════
#  OUTBOUND CALL CONNECT (TwiML for answered outbound call)
# ═══════════════════════════════════════════

@voice_bp.route('/outbound-connect', methods=['POST'])
def handle_outbound_connect():
    """
    TwiML endpoint for outbound call leg.
    When the patient answers, connect them to our WebSocket with appointment context.
    """
    call_sid = request.form.get('CallSid', '')
    logger.info(f"Outbound call answered, CallSid={call_sid}")

    # Extract appointment context from request args
    patient_name = request.args.get('patientName', '')
    doctor_name = request.args.get('doctorName', '')
    appt_date = request.args.get('appointmentDate', '')
    appt_time = request.args.get('appointmentTime', '')

    ws_url = _get_ws_url('/api/voice/stream')

    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=ws_url)
    stream.parameter(name='callType', value='outbound')
    stream.parameter(name='patientName', value=patient_name)
    stream.parameter(name='doctorName', value=doctor_name)
    stream.parameter(name='appointmentDate', value=appt_date)
    stream.parameter(name='appointmentTime', value=appt_time)
    connect.append(stream)
    response.append(connect)

    return str(response), 200, {'Content-Type': 'text/xml'}


# ═══════════════════════════════════════════
#  CALL STATUS CALLBACK
# ═══════════════════════════════════════════

@voice_bp.route('/status', methods=['POST'])
def handle_call_status():
    """Twilio status callback — logs call status updates."""
    call_sid = request.form.get('CallSid', '')
    status = request.form.get('CallStatus', '')
    logger.info(f"Call status update: SID={call_sid}, status={status}")
    return '', 204


# ═══════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════

def _get_ws_url(path):
    """Build the WebSocket URL from the public base URL."""
    base = PUBLIC_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')
    return f"{base}{path}"


def _resolve_patient_by_phone(phone):
    """Look up patient_id from the phone number in the database."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        # Try patients collection
        patient = db.patients.find_one(
            {'phone': phone},
            {'patient_id': 1, '_id': 0}
        )
        if patient:
            return patient.get('patient_id', '')

        # Try wa_users collection (WhatsApp registered users)
        wa_user = db.db.wa_users.find_one(
            {'phone': phone},
            {'patient_id': 1, '_id': 0}
        )
        if wa_user:
            return wa_user.get('patient_id', '')

    except Exception as e:
        logger.warning(f"Could not resolve patient by phone {phone}: {e}")

    return ''
