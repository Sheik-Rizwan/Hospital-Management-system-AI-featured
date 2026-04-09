# socket_service.py - Real-Time Socket.IO Event Service
#
# Provides a centralized service for emitting real-time events to connected clients.
# Each user joins a "room" based on their role (e.g., "role_super_admin", "role_vendor")
# and a personal room based on their user_id for targeted messages.

from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_jwt_extended import decode_token
from datetime import datetime

# Global SocketIO instance — initialized in app.py
socketio = None


def init_socketio(app):
    """Initialize Socket.IO with the Flask app."""
    global socketio
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode='threading',
        logger=False,
        engineio_logger=False
    )
    _register_handlers()
    return socketio


def _register_handlers():
    """Register Socket.IO connection/disconnection handlers."""

    @socketio.on('connect')
    def handle_connect():
        pass

    @socketio.on('disconnect')
    def handle_disconnect():
        pass

    @socketio.on('authenticate')
    def handle_authenticate(data):
        """
        Client sends JWT token after connection to join role-based and user-based rooms.
        Expected data: { "token": "Bearer <jwt>" }
        """
        try:
            token = data.get('token', '').replace('Bearer ', '')
            if not token:
                emit('auth_error', {'error': 'No token provided'})
                return

            decoded = decode_token(token)
            user_id = decoded.get('sub', '')
            role = decoded.get('role', '')

            # Join personal room (for targeted notifications)
            join_room(f"user_{user_id}")

            # Join role-based room (for broadcast to all users of a role)
            join_room(f"role_{role}")

            emit('authenticated', {
                'message': 'Connected to real-time notifications',
                'user_id': user_id,
                'role': role
            })

        except Exception:
            emit('auth_error', {'error': 'Invalid token'})

    @socketio.on('leave')
    def handle_leave(data):
        """Client explicitly leaves rooms on logout."""
        user_id = data.get('user_id', '')
        role = data.get('role', '')
        if user_id:
            leave_room(f"user_{user_id}")
        if role:
            leave_room(f"role_{role}")

    # ── Chat Room Events ──────────────────────────────────────

    @socketio.on('join_chat')
    def handle_join_chat(data):
        """Join a specific chat room by chat_id."""
        chat_id = data.get('chat_id')
        if chat_id:
            join_room(chat_id)
            emit('joined_chat', {'chat_id': chat_id, 'status': 'joined'})

    @socketio.on('leave_chat')
    def handle_leave_chat(data):
        """Leave a specific chat room."""
        chat_id = data.get('chat_id')
        if chat_id:
            leave_room(chat_id)

    @socketio.on('chat_message')
    def handle_chat_message(data):
        """Send a real-time chat message within a room and persist to DB."""
        try:
            from mongodb_config import MongoDatabase
            import uuid as _uuid
            _db = MongoDatabase()

            chat_id = data.get('chat_id')
            content = data.get('content', '').strip()
            sender_id = data.get('sender_id')
            sender_name = data.get('sender_name', 'Unknown')
            message_type = data.get('message_type', 'text')

            if not chat_id or not content or not sender_id:
                emit('error', {'error': 'Missing required fields'})
                return

            # Persist message to DB
            message_doc = {
                'message_id': f"msg_{_uuid.uuid4().hex[:12]}",
                'chat_id': chat_id,
                'sender_id': sender_id,
                'sender_name': sender_name,
                'sender_role': data.get('sender_role', ''),
                'content': content,
                'type': message_type,
                'file_url': '',
                'file_name': '',
                'timestamp': datetime.now(),
                'is_read': False
            }
            _db.messages.insert_one(message_doc)
            message_doc.pop('_id', None)
            message_doc['timestamp'] = message_doc['timestamp'].isoformat()

            # Update last_message_at in chat collection
            _db.chats.update_one(
                {'chat_id': chat_id},
                {'$set': {'last_message_at': datetime.now()}}
            )

            # Broadcast to all participants in the room (including sender for confirmation)
            emit('new_message', message_doc, room=chat_id)

        except Exception as e:
            emit('error', {'error': str(e)})

    @socketio.on('typing')
    def handle_typing(data):
        """Broadcast typing indicator to chat room participants."""
        chat_id = data.get('chat_id')
        if chat_id:
            emit('user_typing', {
                'sender_name': data.get('sender_name', 'Someone'),
                'sender_id': data.get('sender_id'),
                'is_typing': data.get('is_typing', True)
            }, room=chat_id, include_self=False)


# ============ EVENT EMITTERS ============
# These are called from route handlers to push real-time events.


def emit_to_role(role, event, data):
    """Emit an event to all users with a specific role."""
    if socketio:
        data['timestamp'] = datetime.now().isoformat()
        socketio.emit(event, data, room=f"role_{role}")


def emit_to_user(user_id, event, data):
    """Emit an event to a specific user."""
    if socketio:
        data['timestamp'] = datetime.now().isoformat()
        socketio.emit(event, data, room=f"user_{user_id}")


def emit_to_chat(chat_id, event, data):
    """Emit an event to all users inside a specific chat room."""
    if socketio:
        data.setdefault('timestamp', datetime.now().isoformat())
        socketio.emit(event, data, room=chat_id)


def notify_vendor_request_update(doctor_id, vendor_id, request_data):
    """Notify doctor about a new incoming vendor connection request."""
    emit_to_user(doctor_id, 'vendor_request', {
        'message': f"New connection request from {request_data.get('vendor_name', 'a vendor')}",
        'request_id': request_data.get('request_id', ''),
        'vendor_name': request_data.get('vendor_name', ''),
        'message_text': request_data.get('message', '')
    })


# ── Vendor  Admin Events ──────────────────────────────────────

def notify_new_rfq(vendor_ids, request_data):
    """Notify vendors about a new purchase request / RFQ."""
    for vid in vendor_ids:
        emit_to_user(vid, 'new_rfq', {
            'message': f"New RFQ: {request_data.get('item_name', 'Unknown Item')}",
            'request_id': request_data.get('request_id', ''),
            'item_name': request_data.get('item_name', ''),
            'quantity': request_data.get('quantity', 0),
            'urgency': request_data.get('urgency', 'normal')
        })
    # Also broadcast to all vendors
    emit_to_role('vendor', 'new_rfq_broadcast', {
        'message': 'A new purchase request has been posted',
        'request_id': request_data.get('request_id', '')
    })


def notify_quotation_submitted(quotation_data):
    """Notify admins that a vendor submitted a quotation."""
    emit_to_role('super_admin', 'quotation_submitted', {
        'message': f"New quotation from {quotation_data.get('vendor_name', 'Vendor')}",
        'request_id': quotation_data.get('request_id', ''),
        'vendor_name': quotation_data.get('vendor_name', ''),
        'total_amount': quotation_data.get('total_amount', 0),
        'quotation_id': quotation_data.get('quotation_id', '')
    })


def notify_order_status_update(admin_data, order_data):
    """Notify admin about vendor order status change."""
    emit_to_role('super_admin', 'order_status_update', {
        'message': f"Order {order_data.get('po_number', '')} status: {order_data.get('status', '')}",
        'po_number': order_data.get('po_number', ''),
        'status': order_data.get('status', ''),
        'vendor_name': order_data.get('vendor_name', '')
    })


def notify_vendor_approved(vendor_id, vendor_name):
    """Notify vendor that their account has been approved."""
    emit_to_user(vendor_id, 'vendor_approved', {
        'message': f"Your vendor account '{vendor_name}' has been approved!",
        'vendor_id': vendor_id
    })


def notify_purchase_order_created(vendor_id, po_data):
    """Notify vendor about a new purchase order assigned to them."""
    emit_to_user(vendor_id, 'new_purchase_order', {
        'message': f"New purchase order: {po_data.get('po_number', '')}",
        'po_number': po_data.get('po_number', ''),
        'total_amount': po_data.get('total_amount', 0)
    })


# ── Doctor  Nurse Events ──────────────────────────────────────

def notify_task_assigned(nurse_id, task_data):
    """Notify nurse about a new task assignment."""
    emit_to_user(nurse_id, 'task_assigned', {
        'message': f"New task: {task_data.get('description', 'New Task')}",
        'task_id': task_data.get('task_id', ''),
        'patient_name': task_data.get('patient_name', ''),
        'shift': task_data.get('shift', ''),
        'priority': task_data.get('priority', 'normal')
    })


def notify_task_completed(doctor_id, task_data):
    """Notify doctor that a nurse completed a task."""
    emit_to_role('doctor', 'task_completed', {
        'message': f"Task completed: {task_data.get('description', '')}",
        'task_id': task_data.get('task_id', ''),
        'patient_name': task_data.get('patient_name', ''),
        'completed_by': task_data.get('completed_by', '')
    })


def notify_task_rejected(doctor_id, task_data):
    """Notify doctor that a nurse rejected a task."""
    emit_to_role('doctor', 'task_rejected', {
        'message': f"Task rejected by {task_data.get('nurse_name', '')}",
        'task_id': task_data.get('task_id', ''),
        'reason': task_data.get('reason', ''),
        'patient_name': task_data.get('patient_name', '')
    })


def notify_nurse_status_changed(nurse_data):
    """Notify doctors when a nurse goes offline/emergency/online."""
    emit_to_role('doctor', 'nurse_status_changed', {
        'message': f"Nurse {nurse_data.get('nurse_name', '')} is now {nurse_data.get('status', 'offline')}",
        'nurse_id': nurse_data.get('nurse_id', ''),
        'nurse_name': nurse_data.get('nurse_name', ''),
        'status': nurse_data.get('status', ''),
        'reassigned_tasks': nurse_data.get('reassigned_tasks', 0)
    })


# ── Appointment Events ──────────────────────────────────────

def notify_appointment_status(user_id, appointment_data):
    """Notify patient/nurse about appointment approval/rejection."""
    status = appointment_data.get('status', '')
    emit_to_user(user_id, 'appointment_status', {
        'message': f"Appointment {status}: {appointment_data.get('date', '')} at {appointment_data.get('start_time', '')}",
        'appointment_id': appointment_data.get('appointment_id', ''),
        'status': status,
        'doctor_name': appointment_data.get('doctor_name', ''),
        'rejection_reason': appointment_data.get('rejection_reason', '')
    })


def notify_new_appointment(doctor_id, appointment_data):
    """Notify doctor about a new appointment booking — includes full appointment dict."""
    # Serialize: convert datetime  ISO string, ObjectId  str
    safe = {}
    for k, v in (appointment_data or {}).items():
        if k == '_id':
            safe[k] = str(v)
        elif hasattr(v, 'isoformat'):
            safe[k] = v.isoformat()
        else:
            safe[k] = v

    emit_to_user(doctor_id, 'new_appointment', {
        'appointment': safe,
        'appointment_id': appointment_data.get('appointment_id', ''),
        'patient_name': appointment_data.get('patient_name', ''),
        'date': appointment_data.get('date', ''),
        'start_time': appointment_data.get('start_time', '')
    })


def notify_schedule_updated(doctor_id):
    """Notify all clients that a doctor's schedule was updated so UIs can refresh."""
    payload = {'doctor_id': doctor_id}
    for role in ['doctor', 'patient', 'nurse', 'super_admin']:
        emit_to_role(role, 'schedule_updated', payload)


# ── Inventory Events ──────────────────────────────────────

def notify_inventory_updated(item_data, action='updated'):
    """Broadcast inventory change to all staff roles so every open dashboard refreshes."""
    payload = {
        'message': f"Inventory {action}: {item_data.get('name', 'item')}",
        'item_id': item_data.get('item_id', ''),
        'name': item_data.get('name', ''),
        'action': action,
        'quantity': item_data.get('quantity', item_data.get('current_quantity', 0))
    }
    # Notify every staff role so open dashboards refresh
    for role in ['super_admin', 'doctor', 'nurse']:
        emit_to_role(role, 'inventory_updated', payload)


def notify_procurement_updated(data, action='updated'):
    """Broadcast procurement / order changes to admin so ProcurementPanel refreshes."""
    emit_to_role('super_admin', 'procurement_updated', {
        'message': data.get('message', f'Procurement {action}'),
        'action': action
    })


def notify_low_stock(item_data):
    """Notify admins about low inventory stock."""
    emit_to_role('super_admin', 'low_stock_alert', {
        'message': f"️ Low stock: {item_data.get('name', '')} ({item_data.get('current_quantity', 0)} remaining)",
        'item_id': item_data.get('item_id', ''),
        'name': item_data.get('name', ''),
        'current_quantity': item_data.get('current_quantity', 0),
        'reorder_level': item_data.get('reorder_level', 0)
    })


def notify_restock_request(request_data):
    """Notify admins about a restock request from staff."""
    emit_to_role('super_admin', 'restock_request', {
        'message': f"Restock requested: {request_data.get('item_name', '')}",
        'item_name': request_data.get('item_name', ''),
        'requested_by': request_data.get('requested_by', ''),
        'quantity': request_data.get('quantity', 0)
    })
