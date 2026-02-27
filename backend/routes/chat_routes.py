# chat_routes.py - Chat & Vendor Communication Routes

import logging

from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid
import os
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)

from auth import (token_required, vendor_required, doctor_required,
                  admin_required, get_current_user)

chat_bp = Blueprint('chat', __name__)


# ============ VENDOR CONNECTION REQUESTS ============

@chat_bp.route('/request', methods=['POST'])
@token_required
def send_connection_request():
    """Send a connection request to a Doctor or Admin (from vendor only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Only vendors can send connection requests
        sender_role = current_user.get('role', 'vendor')
        if sender_role != 'vendor':
            return jsonify({'success': False, 'error': 'Only vendors can send connection requests'}), 403
        
        target_id = data.get('target_id')
        target_role = data.get('target_role', 'doctor')  # 'doctor' or 'super_admin'
        message = data.get('message', '')
        
        if not target_id:
            return jsonify({'success': False, 'error': 'target_id is required'}), 400
        
        if target_role not in ['doctor', 'super_admin']:
            return jsonify({'success': False, 'error': 'target_role must be doctor or super_admin'}), 400
        
        # Check target exists - look in the right collection based on role
        if target_role == 'doctor':
            target_user = db.doctors.find_one({'user_id': target_id})
        elif target_role == 'super_admin':
            target_user = db.admins.find_one({'user_id': target_id})
        else:
            target_user = None
        if not target_user:
            return jsonify({'success': False, 'error': 'Target user not found'}), 404
        
        # Check for existing pending request
        existing = db.vendor_requests.find_one({
            'vendor_id': current_user['user_id'],
            'target_id': target_id,
            'status': 'pending'
        })
        if existing:
            return jsonify({'success': False, 'error': 'A pending request already exists'}), 400
        
        request_doc = {
            'request_id': f"vreq_{uuid.uuid4().hex[:12]}",
            'vendor_id': current_user['user_id'],
            'vendor_name': current_user.get('full_name', '') or current_user.get('company_name', ''),
            'vendor_role': sender_role,
            'target_id': target_id,
            'target_name': target_user.get('full_name', ''),
            'target_role': target_role,
            'message': message,
            'status': 'pending',  # pending | accepted | rejected
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
        
        # Store participant info for chat creation
        request_doc['sender_role_actual'] = sender_role
        
        db.vendor_requests.insert_one(request_doc)
        request_doc.pop('_id', None)
        
        return jsonify({
            'success': True,
            'message': 'Connection request sent',
            'request': request_doc
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@chat_bp.route('/request/<request_id>', methods=['PUT'])
@token_required
def respond_to_request(request_id):
    """Doctor/Admin accepts or rejects a vendor connection request."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        logger.info(f"[CHAT] Respond to request: id={request_id}, user={current_user.get('user_id')}, data={data}")
        
        if not data:
            return jsonify({'success': False, 'error': 'No JSON body received'}), 400
        
        action = data.get('action')  # 'accept' or 'reject'
        
        if action not in ['accept', 'reject']:
            return jsonify({'success': False, 'error': 'action must be accept or reject'}), 400
        
        # Find the request
        req = db.vendor_requests.find_one({'request_id': request_id})
        if not req:
            logger.warning(f"[CHAT] Request not found: {request_id}")
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        
        logger.info(f"[CHAT] Request found: target_id={req['target_id']}, vendor_id={req['vendor_id']}, status={req['status']}")
        
        # Only the target can respond
        if req['target_id'] != current_user['user_id']:
            logger.warning(f"[CHAT] Auth mismatch: req.target_id={req['target_id']} != user_id={current_user['user_id']}")
            return jsonify({'success': False, 'error': 'Not authorized to respond to this request'}), 403
        
        if req['status'] != 'pending':
            return jsonify({'success': False, 'error': f"Request already {req['status']}"}), 400
        
        new_status = 'accepted' if action == 'accept' else 'rejected'
        
        db.vendor_requests.update_one(
            {'request_id': request_id},
            {'$set': {'status': new_status, 'updated_at': datetime.now()}}
        )
        
        chat_id = None
        
        # If accepted, create a chat conversation
        if action == 'accept':
            chat_id = f"chat_{uuid.uuid4().hex[:12]}"
            chat_doc = {
                'chat_id': chat_id,
                'participant_ids': [req['vendor_id'], req['target_id']],
                'participants': [
                    {'user_id': req['vendor_id'], 'name': req.get('vendor_name', ''), 'role': req.get('vendor_role', req.get('sender_role_actual', 'vendor'))},
                    {'user_id': req['target_id'], 'name': req.get('target_name', ''), 'role': req.get('target_role', 'doctor')}
                ],
                'request_id': request_id,
                'created_at': datetime.now(),
                'last_message_at': datetime.now(),
                'is_active': True
            }
            db.chats.insert_one(chat_doc)
            
            # Link chat to request
            db.vendor_requests.update_one(
                {'request_id': request_id},
                {'$set': {'chat_id': chat_id}}
            )
        
        return jsonify({
            'success': True,
            'message': f'Request {new_status}',
            'chat_id': chat_id
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ GET REQUESTS ============

@chat_bp.route('/requests', methods=['GET'])
@token_required
def get_my_requests():
    """Get connection requests for the current user (sent or received)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        status_filter = request.args.get('status')
        direction = request.args.get('direction', 'received')  # 'sent' or 'received'
        
        if direction == 'sent':
            query = {'vendor_id': current_user['user_id']}
        else:
            query = {'target_id': current_user['user_id']}
            # Only show requests from actual vendors (filter out non-vendor senders)
            query['vendor_role'] = 'vendor'
        
        if status_filter:
            query['status'] = status_filter
        
        requests_list = list(db.vendor_requests.find(query, {'_id': 0}).sort('created_at', -1))
        
        return jsonify({
            'success': True,
            'requests': requests_list,
            'count': len(requests_list)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ DIRECT CHAT (no connection request needed) ============

@chat_bp.route('/direct', methods=['POST'])
@token_required
def start_direct_chat():
    """Start a direct chat with another user (no connection request needed)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json or {}
        target_id = data.get('target_id')
        target_role = data.get('target_role', 'doctor')
        
        if not target_id:
            return jsonify({'success': False, 'error': 'target_id is required'}), 400
        
        # Check if chat already exists between these two users
        existing_chat = db.chats.find_one({
            'participant_ids': {'$all': [current_user['user_id'], target_id]},
            'is_active': True
        })
        if existing_chat:
            existing_chat.pop('_id', None)
            # Add other_participant info
            other = [p for p in existing_chat.get('participants', []) if p['user_id'] != current_user['user_id']]
            existing_chat['other_participant'] = other[0] if other else {}
            return jsonify({'success': True, 'chat': existing_chat, 'existing': True}), 200
        
        # Look up target user
        if target_role == 'doctor':
            target_user = db.doctors.find_one({'user_id': target_id})
        elif target_role == 'vendor':
            target_user = db.vendors.find_one({'user_id': target_id})
        elif target_role == 'super_admin':
            target_user = db.admins.find_one({'user_id': target_id})
        else:
            target_user = None
        
        if not target_user:
            return jsonify({'success': False, 'error': 'Target user not found'}), 404
        
        # Create new chat
        chat_id = f"chat_{uuid.uuid4().hex[:12]}"
        chat_doc = {
            'chat_id': chat_id,
            'participant_ids': [current_user['user_id'], target_id],
            'participants': [
                {'user_id': current_user['user_id'], 'name': current_user.get('full_name', '') or current_user.get('company_name', ''), 'role': current_user.get('role', 'doctor')},
                {'user_id': target_id, 'name': target_user.get('full_name', '') or target_user.get('company_name', ''), 'role': target_role}
            ],
            'created_at': datetime.now(),
            'last_message_at': datetime.now(),
            'is_active': True
        }
        db.chats.insert_one(chat_doc)
        chat_doc.pop('_id', None)
        chat_doc['other_participant'] = {'user_id': target_id, 'name': target_user.get('full_name', '') or target_user.get('company_name', ''), 'role': target_role}
        
        return jsonify({'success': True, 'chat': chat_doc, 'existing': False}), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ CONVERSATIONS ============

@chat_bp.route('/conversations', methods=['GET'])
@token_required
def get_conversations():
    """Get all active chat conversations for the current user."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        chats = list(db.chats.find(
            {'participant_ids': current_user['user_id'], 'is_active': True},
            {'_id': 0}
        ).sort('last_message_at', -1))
        
        # Enrich with last message preview and live participant data
        for chat in chats:
            last_msg = db.messages.find_one(
                {'chat_id': chat['chat_id']},
                {'_id': 0},
                sort=[('timestamp', -1)]
            )
            chat['last_message'] = last_msg
            
            # Identify the "other" participant and enrich with live DB data
            for p in chat.get('participants', []):
                if p['user_id'] != current_user['user_id']:
                    other_id = p['user_id']
                    
                    # Search all collections to find the user and their real role
                    live_user = db.vendors.find_one({'user_id': other_id}, {'_id': 0, 'password': 0})
                    if live_user:
                        real_role = 'vendor'
                    else:
                        live_user = db.doctors.find_one({'user_id': other_id}, {'_id': 0, 'password': 0})
                        if live_user:
                            real_role = 'doctor'
                        else:
                            live_user = db.admins.find_one({'user_id': other_id}, {'_id': 0, 'password': 0})
                            real_role = 'super_admin' if live_user else p.get('role', 'unknown')
                    
                    enriched = {
                        'user_id': other_id,
                        'role': real_role,
                        'name': (live_user.get('full_name', '') or live_user.get('company_name', '') or p.get('name', 'Unknown')) if live_user else p.get('name', 'Unknown'),
                        'phone': live_user.get('phone', '') if live_user else '',
                        'email': live_user.get('email', '') if live_user else ''
                    }
                    chat['other_participant'] = enriched
                    break
        
        return jsonify({
            'success': True,
            'conversations': chats,
            'count': len(chats)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ MESSAGES ============

@chat_bp.route('/<chat_id>/messages', methods=['GET'])
@token_required
def get_messages(chat_id):
    """Get message history for a chat."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        # Verify the user is a participant
        chat = db.chats.find_one({'chat_id': chat_id})
        if not chat:
            return jsonify({'success': False, 'error': 'Chat not found'}), 404
        
        if current_user['user_id'] not in chat.get('participant_ids', []):
            return jsonify({'success': False, 'error': 'Not a participant in this chat'}), 403
        
        # Pagination
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        skip = (page - 1) * limit
        
        messages = list(db.messages.find(
            {'chat_id': chat_id},
            {'_id': 0}
        ).sort('timestamp', 1).skip(skip).limit(limit))
        
        total = db.messages.count_documents({'chat_id': chat_id})
        
        return jsonify({
            'success': True,
            'messages': messages,
            'total': total,
            'page': page,
            'pages': (total + limit - 1) // limit
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@chat_bp.route('/<chat_id>/messages', methods=['POST'])
@token_required
def send_message(chat_id):
    """Send a message in a chat (text or file URL)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Verify chat and participation
        chat = db.chats.find_one({'chat_id': chat_id})
        if not chat:
            return jsonify({'success': False, 'error': 'Chat not found'}), 404
        
        if current_user['user_id'] not in chat.get('participant_ids', []):
            return jsonify({'success': False, 'error': 'Not a participant in this chat'}), 403
        
        content = data.get('content', '').strip()
        message_type = data.get('type', 'text')  # 'text', 'file', 'image'
        file_url = data.get('file_url', '')
        file_name = data.get('file_name', '')
        
        if not content and not file_url:
            return jsonify({'success': False, 'error': 'Message content or file is required'}), 400
        
        message_doc = {
            'message_id': f"msg_{uuid.uuid4().hex[:12]}",
            'chat_id': chat_id,
            'sender_id': current_user['user_id'],
            'sender_name': current_user.get('full_name', ''),
            'sender_role': current_user.get('role', ''),
            'content': content,
            'type': message_type,
            'file_url': file_url,
            'file_name': file_name,
            'timestamp': datetime.now(),
            'is_read': False
        }
        
        db.messages.insert_one(message_doc)
        message_doc.pop('_id', None)
        
        # Update chat's last_message_at
        db.chats.update_one(
            {'chat_id': chat_id},
            {'$set': {'last_message_at': datetime.now()}}
        )
        
        return jsonify({
            'success': True,
            'message': message_doc
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ SEARCH DOCTORS (for Vendors) ============

@chat_bp.route('/doctors', methods=['GET'])
@token_required
def search_doctors():
    """Search for doctors (available to vendors and doctors)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        search = request.args.get('q', '')
        
        # Include doctors with is_active=True or without the field (legacy records)
        active_filter = {'$or': [{'is_active': True}, {'is_active': {'$exists': False}}]}
        
        if search:
            search_filter = {'$or': [
                {'full_name': {'$regex': search, '$options': 'i'}},
                {'specialization': {'$regex': search, '$options': 'i'}},
                {'department': {'$regex': search, '$options': 'i'}}
            ]}
            query = {'$and': [active_filter, search_filter]}
        else:
            query = active_filter
        
        doctors = list(db.doctors.find(query, {
            '_id': 0, 'password': 0
        }).sort('full_name', 1))
        
        # Exclude self if the requester is a doctor
        if current_user.get('role') == 'doctor':
            doctors = [d for d in doctors if d.get('user_id') != current_user['user_id']]
        
        return jsonify({
            'success': True,
            'doctors': doctors,
            'count': len(doctors)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ FILE UPLOAD ============

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@chat_bp.route('/upload', methods=['POST'])
@token_required
def upload_file():
    """Upload a file for chat."""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file part'}), 400
            
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No selected file'}), 400
            
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            # Make unique
            unique_filename = f"{uuid.uuid4().hex[:8]}_{filename}"
            
            # Ensure uploads directory exists
            upload_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)
                
            file.save(os.path.join(upload_folder, unique_filename))
            
            # Return URL
            # Assumes app serves /uploads/<filename>
            file_url = f"/uploads/{unique_filename}"
            
            return jsonify({
                'success': True,
                'file_url': file_url,
                'file_name': filename
            }), 201
            
        return jsonify({'success': False, 'error': 'File type not allowed'}), 400
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
