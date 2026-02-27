# whatsapp_routes.py - WhatsApp Webhook Handler with Service Layer

from flask import Blueprint, request, jsonify
import json
import os
from services.whatsapp_service import WhatsAppService
import logging

whatsapp_bp = Blueprint('whatsapp_bp', __name__)
whatsapp_service = WhatsAppService()
VERIFY_TOKEN = os.getenv('VERIFY_TOKEN', 'my_verify_token')

# Configure Webhook Logging
from logger_config import logger as webhook_logger

@whatsapp_bp.route('/webhook', methods=['GET'])
def verify_token():
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    webhook_logger.info(f"VERIFY TOKEN: mode={mode}, token={token}, challenge={challenge}")

    if mode and token:
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            webhook_logger.info("WEBHOOK_VERIFIED")
            return challenge, 200
        else:
            webhook_logger.error("VERIFICATION_FAILED: Token mismatch")
            return jsonify({'status': 'error', 'message': 'Verification failed'}), 403
    else:
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400

@whatsapp_bp.route('/webhook', methods=['POST'])
def handle_message():
    try:
        data = request.json
        webhook_logger.info(f"RECEIVED_PAYLOAD: {json.dumps(data)}")
        
        if data.get('object') == 'whatsapp_business_account':
            for entry in data.get('entry', []):
                for change in entry.get('changes', []):
                    value = change.get('value', {})
                    messages = value.get('messages', [])
                    
                    if messages:
                        for message in messages:
                            sender_id = message['from']
                            msg_type = message['type']
                            content = None
                            media_id = None
                            
                            if msg_type == 'text':
                                content = message['text']['body']
                            elif msg_type == 'audio':
                                media_id = message.get('audio', {}).get('id')
                            elif msg_type == 'interactive':
                                if message['interactive']['type'] == 'button_reply':
                                     content = message['interactive']['button_reply']['id']
                                elif message['interactive']['type'] == 'list_reply':
                                     content = message['interactive']['list_reply']['id']
                            
                            # Delegate to Service
                            webhook_logger.info(f"PROCESSING: sender={sender_id}, type={msg_type}, content={content}, media_id={media_id if msg_type == 'audio' else 'N/A'}")
                            try:
                                whatsapp_service.handle_incoming_message(sender_id, msg_type, content, media_id=media_id if msg_type == 'audio' else None)
                            except Exception as e:
                                webhook_logger.error(f"SERVICE_ERROR: {str(e)}", exc_info=True)

        return jsonify({'status': 'success'}), 200
            
    except Exception as e:
        webhook_logger.error(f"WEBHOOK_CRASH: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
