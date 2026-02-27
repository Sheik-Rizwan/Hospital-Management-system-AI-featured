# procurement_routes.py - Procurement API Routes (Admin/Staff)

from flask import Blueprint, request, jsonify
from datetime import datetime

from auth import (token_required, admin_required, get_current_user)
from models.vendor_models import (Vendor, InventoryItem, PurchaseRequest, 
                                   Quotation, DepartmentBudget, PurchaseOrder)
from services.socket_service import (notify_new_rfq, notify_purchase_order_created,
                                      notify_low_stock, notify_restock_request,
                                      notify_inventory_updated, notify_procurement_updated)

procurement_bp = Blueprint('procurement', __name__)


# ============ INVENTORY MANAGEMENT ============

@procurement_bp.route('/inventory', methods=['GET'])
@token_required
def get_inventory():
    """Get all inventory items. Supports filtering by category and low_stock."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        category = request.args.get('category')
        low_stock = request.args.get('low_stock', '').lower() == 'true'
        
        query = {'is_deleted': {'$ne': True}}
        if category:
            query['category'] = category
        
        items = list(db.inventory.find(query, {'_id': 0}).sort('name', 1))
        
        # Filter low stock if requested
        if low_stock:
            items = [i for i in items if i.get('quantity', 0) <= i.get('reorder_level', 10)]
        
        # Convert to dict format
        items = [InventoryItem.to_dict(i) for i in items]
        
        return jsonify({
            'success': True,
            'items': items,
            'count': len(items)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/inventory', methods=['POST'])
@token_required
def add_inventory_item():
    """Add a new inventory item (Doctor/Nurse/Admin)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Validate required fields
        required = ['name', 'category']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing)}'
            }), 400
        
        # Check for duplicate name in same category
        existing = db.inventory.find_one({
            'name': data['name'],
            'category': data['category'],
            'is_deleted': {'$ne': True}
        })
        if existing:
            return jsonify({
                'success': False,
                'error': 'Item with same name already exists in this category'
            }), 400
        
        data['created_by'] = current_user['user_id']
        item = InventoryItem.create(data)
        db.inventory.insert_one(item)
        
        # Real-time: Broadcast inventory change to all dashboards
        try:
            notify_inventory_updated({'item_id': item.get('item_id', ''), 'name': data['name'], 'quantity': data.get('quantity', 0)}, action='added')
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Inventory item added',
            'item': InventoryItem.to_dict(item)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/inventory/<item_id>', methods=['PUT'])
@admin_required
def update_inventory_item(item_id):
    """Update an inventory item (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        data = request.json
        
        # Check if item exists
        item = db.inventory.find_one({'item_id': item_id})
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'}), 404
        
        # Allowed update fields
        allowed = ['name', 'description', 'quantity', 'reorder_level', 'unit_price', 'location', 'unit']
        update_data = {k: v for k, v in data.items() if k in allowed}
        update_data['updated_at'] = datetime.now()
        
        db.inventory.update_one(
            {'item_id': item_id},
            {'$set': update_data}
        )
        
        # Real-time: Broadcast inventory change to all dashboards
        try:
            notify_inventory_updated({'item_id': item_id, 'name': item.get('name', ''), 'quantity': update_data.get('quantity', item.get('quantity', 0))}, action='updated')
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Item updated successfully'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/inventory/<item_id>', methods=['DELETE'])
@admin_required
def delete_inventory_item(item_id):
    """Soft delete an inventory item (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        # Soft delete - set is_deleted flag
        # Get item name before deleting for the notification
        item = db.inventory.find_one({'item_id': item_id})
        
        result = db.inventory.update_one(
            {'item_id': item_id},
            {'$set': {'is_deleted': True, 'updated_at': datetime.now()}}
        )
        
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Item not found'}), 404
        
        # Real-time: Broadcast inventory change to all dashboards
        try:
            notify_inventory_updated({'item_id': item_id, 'name': item.get('name', '') if item else ''}, action='deleted')
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Item deleted successfully'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ PURCHASE REQUESTS ============

@procurement_bp.route('/requests', methods=['GET'])
@token_required
def get_purchase_requests():
    """Get purchase requests. Admins see all, staff see their own."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        status = request.args.get('status')
        
        query = {'is_deleted': {'$ne': True}}
        
        # Staff can only see their own requests
        if current_user['role'] not in ['super_admin']:
            query['requested_by'] = current_user['user_id']
        
        if status:
            query['status'] = status
        
        requests = list(db.purchase_requests.find(query, {'_id': 0}).sort('created_at', -1))
        requests = [PurchaseRequest.to_dict(r) for r in requests]
        
        return jsonify({
            'success': True,
            'requests': requests,
            'count': len(requests)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/requests', methods=['POST'])
@token_required
def create_purchase_request():
    """Create a new purchase request (Staff can raise requests)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Only staff roles can create requests
        allowed_roles = ['nurse', 'doctor', 'super_admin']
        if current_user['role'] not in allowed_roles:
            return jsonify({
                'success': False,
                'error': 'Only staff members can raise purchase requests'
            }), 403
        
        # Logic to handle item_id lookup if item_name is missing
        item_name = data.get('item_name')
        item_id = data.get('item_id')
        category = data.get('category', 'general')
        unit = data.get('unit', 'pcs')
        estimated_cost = float(data.get('estimated_cost', 0))

        if not item_name and item_id:
            # Lookup item in inventory
            inventory_item = db.inventory.find_one({'item_id': item_id})
            if inventory_item:
                item_name = inventory_item['name']
                category = inventory_item.get('category', category)
                unit = inventory_item.get('unit', unit)
                if not estimated_cost:
                    estimated_cost = float(inventory_item.get('unit_price', 0)) * int(data.get('quantity', 0))
            else:
                return jsonify({'success': False, 'error': 'Invalid item_id'}), 400

        # Validate required fields
        if not item_name:
             return jsonify({'success': False, 'error': 'Missing required fields: item_name'}), 400
             
        if not data.get('quantity'):
             return jsonify({'success': False, 'error': 'Missing required fields: quantity'}), 400
        
        request_data = {
            'item_name': item_name,
            'item_id': item_id,
            'category': category,
            'quantity': int(data['quantity']),
            'unit': unit,
            'urgency': data.get('urgency', 'normal'),
            'reason': data.get('reason', ''),
            'department': current_user.get('department', data.get('department', '')),
            'requested_by': current_user['user_id'],
            'requested_by_name': current_user.get('full_name', ''),
            'requested_by_role': current_user['role'],
            'estimated_cost': estimated_cost
        }
        
        purchase_request = PurchaseRequest.create(request_data)
        db.purchase_requests.insert_one(purchase_request)
        
        return jsonify({
            'success': True,
            'message': 'Purchase request submitted',
            'request': PurchaseRequest.to_dict(purchase_request)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/requests/<request_id>/approve', methods=['PUT'])
@admin_required
def approve_purchase_request(request_id):
    """Approve a purchase request (Admin only). Optionally assign a vendor."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json or {}
        vendor_id = data.get('vendor_id')  # Optional vendor assignment
        
        # Get request
        purchase_request = db.purchase_requests.find_one({'request_id': request_id})
        if not purchase_request:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        
        if purchase_request.get('status') != 'requested':
            return jsonify({
                'success': False,
                'error': f"Cannot approve request with status: {purchase_request.get('status')}"
            }), 400
        
        # Build update fields
        update_fields = {
            'status': 'approved',
            'approved_by': current_user['user_id'],
            'approved_at': datetime.now(),
            'updated_at': datetime.now()
        }
        
        note = 'Request approved by admin'
        if vendor_id:
            update_fields['assigned_vendor_id'] = vendor_id
            # Look up vendor name for the note
            vendor = db.vendors.find_one({'user_id': vendor_id})
            vendor_name = vendor.get('company_name', vendor_id) if vendor else vendor_id
            note = f'Request approved and assigned to {vendor_name}'
        
        status_entry = {
            'status': 'approved',
            'by': current_user['user_id'],
            'at': datetime.now().isoformat(),
            'note': note
        }
        
        db.purchase_requests.update_one(
            {'request_id': request_id},
            {
                '$set': update_fields,
                '$push': {'status_history': status_entry}
            }
        )
        
        # Real-time: Notify vendors about the new RFQ
        try:
            if vendor_id:
                # Notify only the assigned vendor
                vendor_ids = [vendor_id]
            else:
                # Notify all approved vendors
                approved_vendors = list(db.vendors.find(
                    {'is_approved': True, 'is_deleted': {'$ne': True}},
                    {'user_id': 1, '_id': 0}
                ))
                vendor_ids = [v['user_id'] for v in approved_vendors]
            
            notify_new_rfq(vendor_ids, {
                'request_id': request_id,
                'item_name': purchase_request.get('item_name', ''),
                'quantity': purchase_request.get('quantity', 0),
                'urgency': purchase_request.get('urgency', 'normal')
            })
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Request approved - vendors can now submit quotations'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/requests/<request_id>/reject', methods=['PUT'])
@admin_required
def reject_purchase_request(request_id):
    """Reject a purchase request (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        rejection_reason = data.get('reason', 'No reason provided')
        
        # Get request
        purchase_request = db.purchase_requests.find_one({'request_id': request_id})
        if not purchase_request:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        
        # Update status
        status_entry = {
            'status': 'rejected',
            'by': current_user['user_id'],
            'at': datetime.now().isoformat(),
            'note': rejection_reason
        }
        
        db.purchase_requests.update_one(
            {'request_id': request_id},
            {
                '$set': {
                    'status': 'rejected',
                    'rejection_reason': rejection_reason,
                    'updated_at': datetime.now()
                },
                '$push': {'status_history': status_entry}
            }
        )
        
        return jsonify({
            'success': True,
            'message': 'Request rejected'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ VENDOR MANAGEMENT (Admin) ============

@procurement_bp.route('/vendors', methods=['GET'])
@admin_required
def get_all_vendors():
    """Get all vendors (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        category = request.args.get('category')
        approved_only = request.args.get('approved', '').lower() == 'true'
        
        query = {'is_deleted': {'$ne': True}}
        if category:
            query['category'] = category
        if approved_only:
            query['is_approved'] = True
        
        vendors = list(db.vendors.find(query, {'_id': 0, 'password': 0}).sort('company_name', 1))
        
        return jsonify({
            'success': True,
            'vendors': vendors,
            'count': len(vendors)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/vendors', methods=['POST'])
@admin_required
def create_vendor():
    """Create a new vendor account (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Validate required fields
        required = ['email', 'password', 'company_name']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing)}'
            }), 400
        
        # Check if email exists
        existing = db.get_user_by_email(data['email'].lower())
        if existing:
            return jsonify({
                'success': False,
                'error': 'Email already registered'
            }), 400
        
        data['created_by'] = current_user['user_id']
        data['is_approved'] = True  # Admin-created vendors are auto-approved
        
        vendor = Vendor.create(data)
        db.vendors.insert_one(vendor)
        
        return jsonify({
            'success': True,
            'message': 'Vendor created successfully',
            'vendor': Vendor.to_dict(vendor)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/vendors/<vendor_id>/approve', methods=['PUT'])
@admin_required
def approve_vendor(vendor_id):
    """Approve a vendor (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        result = db.vendors.update_one(
            {'user_id': vendor_id},
            {'$set': {'is_approved': True, 'is_active': True, 'updated_at': datetime.now()}}
        )
        
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Vendor not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Vendor approved'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/vendors/<vendor_id>/reject', methods=['PUT'])
@admin_required
def reject_vendor(vendor_id):
    """Reject a vendor (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        result = db.vendors.update_one(
            {'user_id': vendor_id},
            {'$set': {'is_approved': False, 'is_active': False, 'updated_at': datetime.now()}}
        )
        
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Vendor not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Vendor rejected'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ QUOTATION COMPARISON ============

@procurement_bp.route('/requests/<request_id>/quotations', methods=['GET'])
@admin_required
def get_quotations_for_request(request_id):
    """Get all quotations for a request (Admin only). Includes vendor details."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        quotations = list(db.quotations.find({
            'request_id': request_id,
            'is_deleted': {'$ne': True}
        }, {'_id': 0}).sort('total_price', 1))
        
        # Enrich each quotation with full vendor details
        enriched = []
        for q in quotations:
            q_dict = Quotation.to_dict(q)
            vendor = db.vendors.find_one({'user_id': q.get('vendor_id')}, {'_id': 0, 'password': 0})
            if vendor:
                q_dict['vendor_company'] = vendor.get('company_name', '')
                q_dict['vendor_contact'] = vendor.get('contact_person', '')
                q_dict['vendor_email'] = vendor.get('email', '')
                q_dict['vendor_phone'] = vendor.get('phone', '')
            enriched.append(q_dict)
        
        return jsonify({
            'success': True,
            'quotations': enriched,
            'count': len(enriched)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/requests/<request_id>/select-quotation', methods=['POST'])
@admin_required
def select_quotation(request_id):
    """Select a quotation and create purchase order (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        quotation_id = data.get('quotation_id')
        
        if not quotation_id:
            return jsonify({
                'success': False,
                'error': 'quotation_id is required'
            }), 400
        
        # Get the quotation
        quotation = db.quotations.find_one({'quotation_id': quotation_id})
        if not quotation or quotation['request_id'] != request_id:
            return jsonify({
                'success': False,
                'error': 'Quotation not found for this request'
            }), 404
        
        # Get the purchase request
        purchase_request = db.purchase_requests.find_one({'request_id': request_id})
        if not purchase_request:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        
        # Budget check - use admin-selected budget, or auto-find by department
        budget_id = data.get('budget_id') or purchase_request.get('budget_id')
        if not budget_id and purchase_request.get('department'):
            # Auto-find budget for this department in current fiscal year
            budget = db.department_budgets.find_one({
                'department': purchase_request['department'],
                'fiscal_year': str(datetime.now().year),
                'is_deleted': {'$ne': True}
            })
            if budget:
                budget_id = budget['budget_id']
        
        # Link budget to the purchase request
        if budget_id:
            db.purchase_requests.update_one(
                {'request_id': request_id},
                {'$set': {'budget_id': budget_id}}
            )
        
        if budget_id:
            budget = db.department_budgets.find_one({'budget_id': budget_id})
            if budget:
                available = budget['total_budget'] - budget.get('used_budget', 0) - budget.get('reserved_budget', 0)
                if quotation['total_price'] > available:
                    return jsonify({
                        'success': False,
                        'error': f'Insufficient budget. Available: ₹{available}, Required: ₹{quotation["total_price"]}'
                    }), 400
                
                # Reserve budget (deduct from available)
                db.department_budgets.update_one(
                    {'budget_id': budget_id},
                    {'$inc': {'reserved_budget': quotation['total_price']}}
                )
        
        # Mark quotation as selected
        db.quotations.update_one(
            {'quotation_id': quotation_id},
            {'$set': {'is_selected': True}}
        )
        
        # Update request status
        db.purchase_requests.update_one(
            {'request_id': request_id},
            {
                '$set': {
                    'status': 'ordered',
                    'selected_vendor_id': quotation['vendor_id'],
                    'selected_quotation_id': quotation_id,
                    'actual_cost': quotation['total_price'],
                    'updated_at': datetime.now()
                },
                '$push': {
                    'status_history': {
                        'status': 'ordered',
                        'by': current_user['user_id'],
                        'at': datetime.now().isoformat(),
                        'note': f'Vendor {quotation["vendor_name"]} selected'
                    }
                }
            }
        )
        
        # Create purchase order
        po_data = {
            'request_id': request_id,
            'quotation_id': quotation_id,
            'vendor_id': quotation['vendor_id'],
            'vendor_name': quotation.get('vendor_name', ''),
            'items': [{
                'item_name': purchase_request['item_name'],
                'quantity': purchase_request['quantity'],
                'unit_price': quotation['unit_price'],
                'total': quotation['total_price']
            }],
            'total_amount': quotation['total_price'],
            'expected_delivery': data.get('expected_delivery'),
            'budget_id': budget_id,
            'department': purchase_request.get('department', ''),
            'created_by': current_user['user_id']
        }
        
        po = PurchaseOrder.create(po_data)
        db.purchase_orders.insert_one(po)
        
        # Real-time: Notify the selected vendor about new PO
        try:
            notify_purchase_order_created(quotation['vendor_id'], {
                'po_number': po.get('po_number', po.get('po_id', '')),
                'total_amount': quotation['total_price']
            })
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Quotation selected and PO created',
            'po': PurchaseOrder.to_dict(po)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ BUDGET MANAGEMENT ============

@procurement_bp.route('/budgets', methods=['GET'])
@admin_required
def get_budgets():
    """Get all department budgets (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        budgets = list(db.department_budgets.find({
            'is_deleted': {'$ne': True}
        }, {'_id': 0}))
        
        budgets = [DepartmentBudget.to_dict(b) for b in budgets]
        
        return jsonify({
            'success': True,
            'budgets': budgets,
            'count': len(budgets)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/budgets', methods=['POST'])
@admin_required
def create_budget():
    """Create a new department budget (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        data = request.json
        
        # Validate required fields
        required = ['department', 'total_budget']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing)}'
            }), 400
        
        # Check for existing budget for same department and fiscal year
        fiscal_year = data.get('fiscal_year', str(datetime.now().year))
        existing = db.department_budgets.find_one({
            'department': data['department'],
            'fiscal_year': fiscal_year,
            'is_deleted': {'$ne': True}
        })
        if existing:
            return jsonify({
                'success': False,
                'error': f'Budget already exists for {data["department"]} in {fiscal_year}'
            }), 400
        
        data['created_by'] = current_user['user_id']
        data['fiscal_year'] = fiscal_year
        budget = DepartmentBudget.create(data)
        db.department_budgets.insert_one(budget)
        
        return jsonify({
            'success': True,
            'message': 'Budget created',
            'budget': DepartmentBudget.to_dict(budget)
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/budgets/<budget_id>', methods=['PUT'])
@admin_required
def update_budget(budget_id):
    """Update a department budget (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        data = request.json
        
        # Allowed update fields
        allowed = ['total_budget']
        update_data = {k: v for k, v in data.items() if k in allowed}
        update_data['updated_at'] = datetime.now()
        
        result = db.department_budgets.update_one(
            {'budget_id': budget_id},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Budget not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Budget updated'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ PURCHASE ORDERS ============

@procurement_bp.route('/orders', methods=['GET'])
@admin_required
def get_all_orders():
    """Get all purchase orders (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        status = request.args.get('status')
        
        query = {'is_deleted': {'$ne': True}}
        if status:
            query['status'] = status
        
        orders = list(db.purchase_orders.find(query, {'_id': 0}).sort('created_at', -1))
        orders = [PurchaseOrder.to_dict(o) for o in orders]
        
        return jsonify({
            'success': True,
            'orders': orders,
            'count': len(orders)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/orders/<po_id>/pdf-data', methods=['GET'])
@admin_required
def get_order_pdf_data(po_id):
    """Get PO data for admin PDF generation - includes vendor info + budget summary."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        order = db.purchase_orders.find_one({'po_id': po_id, 'is_deleted': {'$ne': True}})
        if not order:
            return jsonify({'success': False, 'error': 'Order not found'}), 404
        
        # Get vendor details
        vendor = db.vendors.find_one({'user_id': order.get('vendor_id')}, {'_id': 0, 'password': 0})
        vendor_info = {
            'company_name': vendor.get('company_name', '') if vendor else '',
            'contact_person': vendor.get('contact_person', '') if vendor else '',
            'phone': vendor.get('phone', '') if vendor else '',
            'email': vendor.get('email', '') if vendor else '',
            'address': vendor.get('address', '') if vendor else '',
            'gst_number': vendor.get('gst_number', '') if vendor else ''
        }
        
        # Get budget details
        budget_info = None
        if order.get('budget_id'):
            budget = db.department_budgets.find_one({'budget_id': order['budget_id']})
            if budget:
                total = budget.get('total_budget', 0)
                used = budget.get('used_budget', 0)
                reserved = budget.get('reserved_budget', 0)
                budget_info = {
                    'budget_id': budget['budget_id'],
                    'department': budget.get('department', ''),
                    'fiscal_year': budget.get('fiscal_year', ''),
                    'total_budget': total,
                    'consumed_amount': used,
                    'reserved_amount': reserved,
                    'remaining_amount': total - used - reserved
                }
        
        return jsonify({
            'success': True,
            'order': PurchaseOrder.to_dict(order),
            'vendor': vendor_info,
            'budget': budget_info
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/orders/<po_id>/complete', methods=['PUT'])
@admin_required
def complete_order(po_id):
    """Mark order as completed and update budget (Admin only)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        order = db.purchase_orders.find_one({'po_id': po_id})
        if not order:
            return jsonify({'success': False, 'error': 'Order not found'}), 404
        
        if order['status'] != 'delivered':
            return jsonify({
                'success': False,
                'error': 'Order must be delivered before completion'
            }), 400
        
        # Move reserved budget to used budget
        if order.get('budget_id'):
            db.department_budgets.update_one(
                {'budget_id': order['budget_id']},
                {
                    '$inc': {
                        'reserved_budget': -order['total_amount'],
                        'used_budget': order['total_amount']
                    }
                }
            )
        
        # Update inventory - add received items
        request_obj = db.purchase_requests.find_one({'request_id': order['request_id']})
        if request_obj and request_obj.get('item_id'):
            db.inventory.update_one(
                {'item_id': request_obj['item_id']},
                {'$inc': {'quantity': request_obj['quantity']}}
            )
        
        # Update order status
        status_entry = {
            'status': 'completed',
            'by': current_user['user_id'],
            'at': datetime.now().isoformat(),
            'note': 'Order completed and inventory updated'
        }
        
        db.purchase_orders.update_one(
            {'po_id': po_id},
            {
                '$set': {'status': 'completed', 'updated_at': datetime.now()},
                '$push': {'status_history': status_entry}
            }
        )
        
        # Update request status
        db.purchase_requests.update_one(
            {'request_id': order['request_id']},
            {
                '$set': {'status': 'completed', 'updated_at': datetime.now()},
                '$push': {
                    'status_history': {
                        'status': 'completed',
                        'by': current_user['user_id'],
                        'at': datetime.now().isoformat(),
                        'note': 'Delivery completed'
                    }
                }
            }
        )
        
        return jsonify({
            'success': True,
            'message': 'Order completed, budget updated, inventory updated'
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ INVENTORY CONSUMPTION (Staff) ============

@procurement_bp.route('/inventory/consume', methods=['POST'])
@token_required
def consume_inventory_item():
    """Staff (Doctor/Nurse) consumes inventory items (e.g., gloves, syringes).
    Deducts quantity and logs the transaction."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        # Only staff roles can consume
        allowed_roles = ['nurse', 'doctor', 'super_admin']
        if current_user['role'] not in allowed_roles:
            return jsonify({
                'success': False,
                'error': 'Only staff members can consume inventory items'
            }), 403
        
        data = request.json
        item_id = data.get('item_id')
        quantity = int(data.get('quantity', 0))
        reason = data.get('reason', '')
        
        if not item_id or quantity <= 0:
            return jsonify({
                'success': False,
                'error': 'item_id and a positive quantity are required'
            }), 400
        
        # Get the item
        item = db.inventory.find_one({'item_id': item_id, 'is_deleted': {'$ne': True}})
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'}), 404
        
        current_qty = item.get('quantity', 0)
        if quantity > current_qty:
            return jsonify({
                'success': False,
                'error': f'Insufficient stock. Available: {current_qty}, Requested: {quantity}'
            }), 400
        
        # Deduct quantity
        new_qty = current_qty - quantity
        db.inventory.update_one(
            {'item_id': item_id},
            {'$set': {'quantity': new_qty, 'updated_at': datetime.now()}}
        )
        
        # Log the transaction
        transaction = {
            'transaction_id': f"txn_{int(datetime.now().timestamp())}_{item_id}",
            'item_id': item_id,
            'item_name': item.get('name', ''),
            'type': 'consume',
            'quantity': quantity,
            'previous_qty': current_qty,
            'new_qty': new_qty,
            'user_id': current_user['user_id'],
            'user_name': current_user.get('full_name', ''),
            'user_role': current_user['role'],
            'reason': reason,
            'timestamp': datetime.now()
        }
        db.inventory_transactions.insert_one(transaction)
        
        # Check if low stock
        reorder_level = item.get('reorder_level', 10)
        low_stock_warning = new_qty <= reorder_level
        
        # Real-time: Broadcast inventory change to ALL dashboards
        try:
            notify_inventory_updated({
                'item_id': item_id,
                'name': item.get('name', ''),
                'quantity': new_qty
            }, action='consumed')
        except Exception:
            pass
        
        # Real-time: Alert admin if stock is low
        if low_stock_warning:
            try:
                notify_low_stock({
                    'item_id': item_id,
                    'name': item.get('name', ''),
                    'current_quantity': new_qty,
                    'reorder_level': reorder_level
                })
            except Exception:
                pass
        
        return jsonify({
            'success': True,
            'message': f'{quantity} x {item.get("name", "")} consumed',
            'new_quantity': new_qty,
            'low_stock_warning': low_stock_warning
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/inventory/restock-request', methods=['POST'])
@token_required
def create_restock_request():
    """Staff raises a restock request for low-stock items."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        
        allowed_roles = ['nurse', 'doctor', 'super_admin']
        if current_user['role'] not in allowed_roles:
            return jsonify({
                'success': False,
                'error': 'Only staff members can request restock'
            }), 403
        
        data = request.json
        items = data.get('items', [])
        
        if not items:
            return jsonify({
                'success': False,
                'error': 'items list is required (each with item_id, needed_quantity)'
            }), 400
        
        created_requests = []
        
        for entry in items:
            item_id = entry.get('item_id')
            needed_qty = int(entry.get('needed_quantity', 0))
            
            if not item_id or needed_qty <= 0:
                continue
            
            # Lookup inventory item
            inv_item = db.inventory.find_one({'item_id': item_id})
            if not inv_item:
                continue
            
            request_data = {
                'item_name': inv_item.get('name', ''),
                'item_id': item_id,
                'category': inv_item.get('category', 'general'),
                'quantity': needed_qty,
                'unit': inv_item.get('unit', 'pcs'),
                'urgency': entry.get('urgency', 'normal'),
                'reason': entry.get('reason', f'Restock request - current qty: {inv_item.get("quantity", 0)}'),
                'department': current_user.get('department', ''),
                'requested_by': current_user['user_id'],
                'requested_by_name': current_user.get('full_name', ''),
                'requested_by_role': current_user['role'],
                'estimated_cost': float(inv_item.get('unit_price', 0)) * needed_qty,
                'is_restock': True
            }
            
            purchase_request = PurchaseRequest.create(request_data)
            db.purchase_requests.insert_one(purchase_request)
            created_requests.append(PurchaseRequest.to_dict(purchase_request))
        
        return jsonify({
            'success': True,
            'message': f'{len(created_requests)} restock request(s) created',
            'requests': created_requests
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@procurement_bp.route('/inventory/transactions', methods=['GET'])
@token_required
def get_inventory_transactions():
    """Get inventory transaction history (Admin sees all, staff sees own)."""
    try:
        from mongodb_config import MongoDatabase
        db = MongoDatabase()
        
        current_user = get_current_user()
        item_id = request.args.get('item_id')
        
        query = {}
        if item_id:
            query['item_id'] = item_id
        
        # Non-admins only see their own transactions
        if current_user['role'] not in ['super_admin']:
            query['user_id'] = current_user['user_id']
        
        transactions = list(db.inventory_transactions.find(
            query, {'_id': 0}
        ).sort('timestamp', -1).limit(100))
        
        return jsonify({
            'success': True,
            'transactions': transactions,
            'count': len(transactions)
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
