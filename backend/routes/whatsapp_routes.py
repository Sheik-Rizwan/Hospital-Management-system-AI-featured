# whatsapp_routes.py - WhatsApp Webhook Handler with Service Layer

from flask import Blueprint, request, jsonify
import json
import os
from datetime import datetime
from threading import Thread, Lock
from services.whatsapp_service import WhatsAppService
import logging

whatsapp_bp = Blueprint('whatsapp_bp', __name__)
whatsapp_service = WhatsAppService()
VERIFY_TOKEN = os.getenv('VERIFY_TOKEN', 'my_verify_token')
WHATSAPP_WEBHOOK_DEDUP_TTL_SECONDS = int(
    os.getenv('WHATSAPP_WEBHOOK_DEDUP_TTL_SECONDS', str(60 * 60 * 24 * 2))
)
WHATSAPP_WEBHOOK_SYNC_MODE = os.getenv('WHATSAPP_WEBHOOK_SYNC_MODE', 'false').lower() == 'true'

# Serialize message processing per sender to avoid state races when users send
# multiple messages quickly (async threads can otherwise process out of order).
_sender_locks = {}
_sender_locks_guard = Lock()

# Configure Webhook Logging
from logger_config import logger as webhook_logger


def _get_sender_lock(sender_id):
    with _sender_locks_guard:
        sender_lock = _sender_locks.get(sender_id)
        if sender_lock is None:
            sender_lock = Lock()
            _sender_locks[sender_id] = sender_lock
        return sender_lock


def _ensure_message_dedup_indexes():
    """Create indexes used for webhook idempotency and TTL cleanup."""
    try:
        coll = whatsapp_service.db.whatsapp_processed_messages
        coll.create_index('message_id', unique=True)
        coll.create_index('created_at', expireAfterSeconds=WHATSAPP_WEBHOOK_DEDUP_TTL_SECONDS)
    except Exception as e:
        webhook_logger.warning(f"DEDUP_INDEX_SETUP_FAILED: {e}")


def _mark_message_if_new(message_id, sender_id, msg_type, media_id=None):
    """
    Return True if this message_id has not been seen before, else False.
    Uses atomic upsert for idempotency against webhook retries.
    """
    if not message_id:
        # Fail-open if provider omitted message ID
        return True

    try:
        coll = whatsapp_service.db.whatsapp_processed_messages
        result = coll.update_one(
            {'message_id': message_id},
            {
                '$setOnInsert': {
                    'message_id': message_id,
                    'sender_id': sender_id,
                    'msg_type': msg_type,
                    'media_id': media_id,
                    'created_at': datetime.utcnow(),
                }
            },
            upsert=True
        )
        return result.upserted_id is not None
    except Exception as e:
        webhook_logger.warning(f"DEDUP_CHECK_FAILED for {message_id}: {e}")
        # Fail-open so valid traffic is not blocked
        return True


def _extract_message_payload(message, msg_type):
    """Normalize content/media extraction across WhatsApp inbound message types."""
    content = None
    media_id = None

    if msg_type == 'text':
        content = (message.get('text') or {}).get('body')

    elif msg_type == 'audio':
        media_id = (message.get('audio') or {}).get('id')

    elif msg_type == 'interactive':
        interactive = message.get('interactive') or {}
        interactive_type = interactive.get('type')

        if interactive_type == 'button_reply':
            button_reply = interactive.get('button_reply') or {}
            content = button_reply.get('id') or button_reply.get('title')
        elif interactive_type == 'list_reply':
            list_reply = interactive.get('list_reply') or {}
            content = list_reply.get('id') or list_reply.get('title')
        elif interactive_type == 'nfm_reply':
            # WhatsApp Flow reply payload (JSON) — preserve it as text for
            # downstream handling/logging instead of dropping silently.
            nfm_reply = interactive.get('nfm_reply') or {}
            response_json = nfm_reply.get('response_json')
            if isinstance(response_json, (dict, list)):
                content = json.dumps(response_json, ensure_ascii=False)
            elif isinstance(response_json, str):
                content = response_json
            else:
                content = nfm_reply.get('name')
        else:
            webhook_logger.info(
                f"UNSUPPORTED_INTERACTIVE_TYPE: type={interactive_type}, msg_id={message.get('id')}"
            )

    elif msg_type == 'button':
        # Template quick-reply buttons arrive as type=button.
        button = message.get('button') or {}
        content = button.get('payload') or button.get('text')

    else:
        webhook_logger.info(f"UNSUPPORTED_MESSAGE_TYPE: type={msg_type}, msg_id={message.get('id')}")

    return content, media_id


def _process_message_async(sender_id, msg_type, content, media_id, message_id):
    """Background processor so webhook can ACK immediately."""
    try:
        sender_lock = _get_sender_lock(sender_id)
        with sender_lock:
            webhook_logger.info(
                f"PROCESSING_ASYNC: sender={sender_id}, msg_id={message_id}, type={msg_type}, "
                f"content={content}, media_id={media_id if msg_type == 'audio' else 'N/A'}"
            )
            whatsapp_service.handle_incoming_message(
                sender_id,
                msg_type,
                content,
                media_id=media_id if msg_type == 'audio' else None
            )
    except Exception as e:
        webhook_logger.error(f"SERVICE_ASYNC_ERROR: {str(e)}", exc_info=True)


_ensure_message_dedup_indexes()

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
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            webhook_logger.warning("INVALID_JSON_PAYLOAD: missing or malformed JSON body")
            return jsonify({'status': 'ignored', 'message': 'Invalid JSON payload'}), 200

        webhook_logger.info(f"RECEIVED_PAYLOAD: {json.dumps(data, ensure_ascii=False)}")
        
        if data.get('object') == 'whatsapp_business_account':
            for entry in data.get('entry', []):
                for change in entry.get('changes', []):
                    value = change.get('value', {})
                    messages = value.get('messages', [])
                    statuses = value.get('statuses', [])

                    if statuses and not messages:
                        webhook_logger.info(f"STATUS_UPDATE_RECEIVED: count={len(statuses)}")
                    
                    if messages:
                        for message in messages:
                            sender_id = message.get('from')
                            msg_type = message.get('type')
                            message_id = message.get('id')

                            if not sender_id or not msg_type:
                                webhook_logger.warning(f"SKIP_INVALID_MESSAGE: {message}")
                                continue

                            content, media_id = _extract_message_payload(message, msg_type)

                            # Skip unsupported/empty payloads instead of calling service with None,
                            # which currently results in a silent no-op.
                            if msg_type == 'audio' and not media_id:
                                webhook_logger.warning(
                                    f"SKIP_EMPTY_AUDIO: sender={sender_id}, msg_id={message_id}"
                                )
                                continue

                            if msg_type != 'audio' and content is None:
                                webhook_logger.warning(
                                    f"SKIP_EMPTY_CONTENT: sender={sender_id}, msg_id={message_id}, type={msg_type}"
                                )
                                continue
                            
                            if message_id and not _mark_message_if_new(message_id, sender_id, msg_type, media_id):
                                webhook_logger.info(
                                    f"DUPLICATE_SKIPPED: sender={sender_id}, msg_id={message_id}, type={msg_type}"
                                )
                                continue

                            if WHATSAPP_WEBHOOK_SYNC_MODE:
                                # Useful for debugging delivery/persistence issues in local setups.
                                _process_message_async(sender_id, msg_type, content, media_id, message_id)
                            else:
                                # Process asynchronously and ACK webhook immediately to avoid provider retries.
                                Thread(
                                    target=_process_message_async,
                                    args=(sender_id, msg_type, content, media_id, message_id),
                                    daemon=True
                                ).start()

        return jsonify({'status': 'success'}), 200
            
    except Exception as e:
        webhook_logger.error(f"WEBHOOK_CRASH: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
