# vendor_routes.py - Vendor API Routes

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from datetime import datetime

from auth import (token_required, admin_required, vendor_required, 
                  get_current_user, validate_vendor_credentials)
from models.vendor_models import Vendor, Quotation, PurchaseOrder
from services.socket_service import notify_quotation_submitted, notify_order_status_update, notify_procurement_updated

vendor_bp = Blueprint('vendor', __name__)


# ============ VENDOR AUTH ============

@vendor_bp.route('/login', methods=['POST'])
def vendor_login():
    """Vendor login."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({
                'success': False,
                'error': 'Email and password required'
            }), 400
        
        vendor = validate_vendor_credentials(email, password, db)
        if not vendor:
            return jsonify({
                'success': False,
                'error': 'Invalid credentials or vendor not approved'
            }), 401
        
        additional_claims = {
            'role': 'vendor',
            'email': vendor['email'],
            'company_name': vendor.get('company_name', ''),
            'category': vendor.get('category', 'general')
        }
        access_token = create_access_token(
            identity=vendor['user_id'],
            additional_claims=additional_claims
        )
        
        return jsonify({
            'success': True,
            'access_token': access_token,
            'user': Vendor.to_dict(vendor)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ VENDOR DASHBOARD ============

@vendor_bp.route('/dashboard', methods=['GET'])
@vendor_required
def get_vendor_dashboard():
    """Get vendor dashboard data - RFQs and orders assigned to this vendor."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        vendor_id = current_user['user_id']
        
        # Get open RFQs (requests where this vendor can quote)
        open_requests = list(db.purchase_requests.find({
            'status': {'$in': ['approved', 'ordered']},
            'is_deleted': {'$ne': True}
        }, {'_id': 0}).sort('created_at', -1).limit(20))
        
        # Get my quotations
        my_quotations = list(db.quotations.find({
            'vendor_id': vendor_id,
            'is_deleted': {'$ne': True}
        }, {'_id': 0}).sort('created_at', -1).limit(20))
        
        # Get my purchase orders
        my_orders = list(db.purchase_orders.find({
            'vendor_id': vendor_id,
            'is_deleted': {'$ne': True}
        }, {'_id': 0}).sort('created_at', -1).limit(20))
        
        # Stats
        stats = {
            'total_quotations': db.quotations.count_documents({'vendor_id': vendor_id}),
            'won_orders': db.purchase_orders.count_documents({'vendor_id': vendor_id}),
            'pending_delivery': db.purchase_orders.count_documents({
                'vendor_id': vendor_id,
                'status': {'$in': ['created', 'sent', 'acknowledged', 'shipped']}
            })
        }
        
        return jsonify({
            'success': True,
            'open_requests': open_requests,
            'my_quotations': my_quotations,
            'my_orders': my_orders,
            'stats': stats
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ QUOTATIONS ============

@vendor_bp.route('/quotations', methods=['POST'])
@vendor_required
def submit_quotation():
    """Submit a quotation for a purchase request."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Validate required fields
        required = ['request_id', 'unit_price', 'total_price']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing)}'
            }), 400
        
        # Check if request exists and is open for quotation
        purchase_request = db.purchase_requests.find_one({
            'request_id': data['request_id'],
            'status': 'approved'
        })
        if not purchase_request:
            return jsonify({
                'success': False,
                'error': 'Request not found or not open for quotation'
            }), 404
        
        # Check if vendor already quoted
        existing_quote = db.quotations.find_one({
            'request_id': data['request_id'],
            'vendor_id': current_user['user_id']
        })
        if existing_quote:
            return jsonify({
                'success': False,
                'error': 'You have already submitted a quotation for this request'
            }), 400
        
        # Get vendor info
        vendor = db.vendors.find_one({'user_id': current_user['user_id']})
        
        quotation_data = {
            'request_id': data['request_id'],
            'vendor_id': current_user['user_id'],
            'vendor_name': vendor.get('company_name', '') if vendor else '',
            'unit_price': float(data['unit_price']),
            'total_price': float(data['total_price']),
            'delivery_days': data.get('delivery_days', 7),
            'validity_days': data.get('validity_days', 30),
            'terms': data.get('terms', ''),
            'notes': data.get('notes', '')
        }
        
        quotation = Quotation.create(quotation_data)
        db.quotations.insert_one(quotation)
        
        # Real-time: Notify admins about new quotation
        try:
            notify_quotation_submitted({
                'request_id': data['request_id'],
                'vendor_name': vendor.get('company_name', '') if vendor else '',
                'total_amount': float(data['total_price']),
                'quotation_id': quotation.get('quotation_id', '')
            })
        except Exception:
            pass  # Don't fail the request if notification fails
        
        return jsonify({
            'success': True,
            'message': 'Quotation submitted successfully',
            'quotation': Quotation.to_dict(quotation)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@vendor_bp.route('/quotations', methods=['GET'])
@vendor_required
def get_my_quotations():
    """Get all quotations submitted by this vendor."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        quotations = list(db.quotations.find({
            'vendor_id': current_user['user_id'],
            'is_deleted': {'$ne': True}
        }, {'_id': 0}).sort('created_at', -1))
        
        return jsonify({
            'success': True,
            'quotations': quotations,
            'count': len(quotations)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ PURCHASE ORDERS ============

@vendor_bp.route('/orders', methods=['GET'])
@vendor_required
def get_my_orders():
    """Get all purchase orders for this vendor."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        orders = list(db.purchase_orders.find({
            'vendor_id': current_user['user_id'],
            'is_deleted': {'$ne': True}
        }, {'_id': 0}).sort('created_at', -1))
        
        return jsonify({
            'success': True,
            'orders': orders,
            'count': len(orders)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@vendor_bp.route('/orders/<po_id>/pdf-data', methods=['GET'])
@vendor_required
def get_vendor_order_pdf_data(po_id):
    """Get PO data for vendor PDF - includes vendor info, NO budget data."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        order = db.purchase_orders.find_one({
            'po_id': po_id,
            'vendor_id': current_user['user_id'],
            'is_deleted': {'$ne': True}
        })
        if not order:
            return jsonify({'success': False, 'error': 'Order not found'}), 404
        
        # Get vendor details
        vendor = db.vendors.find_one({'user_id': current_user['user_id']}, {'_id': 0, 'password': 0})
        vendor_info = {
            'company_name': vendor.get('company_name', '') if vendor else '',
            'contact_person': vendor.get('contact_person', '') if vendor else '',
            'phone': vendor.get('phone', '') if vendor else '',
            'email': vendor.get('email', '') if vendor else '',
            'address': vendor.get('address', '') if vendor else '',
            'gst_number': vendor.get('gst_number', '') if vendor else ''
        }
        
        return jsonify({
            'success': True,
            'order': PurchaseOrder.to_dict(order),
            'vendor': vendor_info
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@vendor_bp.route('/orders/<po_id>/status', methods=['PUT'])
@vendor_required
def update_order_status(po_id):
    """Update order status (acknowledge, ship, etc.)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        new_status = data.get('status')
        
        # Vendor can only update to certain statuses
        allowed_statuses = ['acknowledged', 'shipped', 'delivered']
        if new_status not in allowed_statuses:
            return jsonify({
                'success': False,
                'error': f'Vendor can only update to: {", ".join(allowed_statuses)}'
            }), 400
        
        # Check if order belongs to this vendor
        order = db.purchase_orders.find_one({
            'po_id': po_id,
            'vendor_id': current_user['user_id']
        })
        if not order:
            return jsonify({
                'success': False,
                'error': 'Order not found'
            }), 404
        
        # Update status
        status_entry = {
            'status': new_status,
            'by': current_user['user_id'],
            'at': datetime.now().isoformat(),
            'note': data.get('note', f'Status updated to {new_status}')
        }
        
        update_fields = {
            'status': new_status,
            'updated_at': datetime.now()
        }
        
        if new_status == 'delivered':
            update_fields['actual_delivery'] = datetime.now()
            update_fields['delivery_notes'] = data.get('delivery_notes', '')
        
        db.purchase_orders.update_one(
            {'po_id': po_id},
            {
                '$set': update_fields,
                '$push': {'status_history': status_entry}
            }
        )
        
        # Real-time: Notify admins about order status change
        try:
            vendor = db.vendors.find_one({'user_id': current_user['user_id']})
            vendor_name = vendor.get('company_name', '') if vendor else ''
            notify_order_status_update({}, {
                'po_number': order.get('po_number', po_id),
                'status': new_status,
                'vendor_name': vendor_name
            })
            # Also trigger procurement panel refresh on admin dashboard
            notify_procurement_updated({
                'message': f"Order {order.get('po_number', po_id)}: {new_status} by {vendor_name}"
            }, action=new_status)
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': f'Order status updated to {new_status}'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ VENDOR PROFILE ============

@vendor_bp.route('/profile', methods=['GET'])
@vendor_required
def get_vendor_profile():
    """Get current vendor's profile."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        vendor = db.vendors.find_one({'user_id': current_user['user_id']}, {'_id': 0, 'password': 0})
        
        if not vendor:
            return jsonify({'success': False, 'error': 'Vendor not found'}), 404
        
        return jsonify({
            'success': True,
            'vendor': vendor
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@vendor_bp.route('/profile', methods=['PUT'])
@vendor_required
def update_vendor_profile():
    """Update vendor profile."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Allowed fields for vendor to update
        allowed = ['contact_person', 'phone', 'address', 'bank_details']
        update_data = {k: v for k, v in data.items() if k in allowed}
        
        if not update_data:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400
        
        update_data['updated_at'] = datetime.now()
        
        db.vendors.update_one(
            {'user_id': current_user['user_id']},
            {'$set': update_data}
        )
        
        return jsonify({
            'success': True,
            'message': 'Profile updated successfully'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
