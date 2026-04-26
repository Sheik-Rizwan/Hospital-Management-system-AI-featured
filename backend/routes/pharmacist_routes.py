# routes/pharmacist_routes.py — Pharmacist API

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import date

from auth import pharmacist_required, role_required
from db import get_session_factory
from db.models.prescription import Prescription
from db.models.inventory import InventoryItem

pharmacist_bp = Blueprint('pharmacist', __name__)


# ── Prescriptions ──

@pharmacist_bp.route('/prescriptions', methods=['GET'])
@role_required('pharmacist', 'doctor', 'system_admin')
def get_prescriptions():
    """Active prescriptions queue."""
    session = get_session_factory()()
    try:
        status = request.args.get('status', 'active')
        prescriptions = (
            session.query(Prescription)
            .filter(Prescription.status == status)
            .order_by(Prescription.created_at.desc())
            .limit(100)
            .all()
        )
        return jsonify({'success': True, 'prescriptions': [p.to_dict() for p in prescriptions]}), 200
    finally:
        session.close()


@pharmacist_bp.route('/prescriptions/<prescription_id>/dispense', methods=['PUT'])
@pharmacist_required
def dispense_prescription(prescription_id):
    """Mark a prescription as dispensed."""
    session = get_session_factory()()
    try:
        prescription = session.query(Prescription).filter(Prescription.id == prescription_id).first()
        if not prescription:
            return jsonify({'success': False, 'error': 'Prescription not found'}), 404

        prescription.status = 'dispensed'
        prescription.dispensed_by = get_jwt_identity()
        prescription.dispensed_at = date.today()
        session.commit()

        return jsonify({'success': True, 'message': 'Prescription dispensed', 'prescription': prescription.to_dict()}), 200
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()


# ── Inventory ──

@pharmacist_bp.route('/inventory', methods=['GET'])
@pharmacist_required
def get_inventory():
    """List medication inventory."""
    session = get_session_factory()()
    try:
        items = session.query(InventoryItem).order_by(InventoryItem.name).all()
        return jsonify({'success': True, 'inventory': [i.to_dict() for i in items]}), 200
    finally:
        session.close()


@pharmacist_bp.route('/inventory', methods=['POST'])
@pharmacist_required
def add_inventory_item():
    """Add new inventory item."""
    session = get_session_factory()()
    try:
        data = request.get_json()
        if not data.get('name'):
            return jsonify({'success': False, 'error': 'Item name is required'}), 400

        item = InventoryItem(
            name=data['name'].strip(),
            category=data.get('category', '').strip() or None,
            sku=data.get('sku', '').strip() or None,
            quantity=int(data.get('quantity', 0)),
            unit=data.get('unit', '').strip() or None,
            unit_price=float(data.get('unit_price', 0)),
            reorder_level=int(data.get('reorder_level', 10)),
            supplier=data.get('supplier', '').strip() or None,
            description=data.get('description', '').strip() or None,
        )
        session.add(item)
        session.commit()
        return jsonify({'success': True, 'message': 'Item added', 'item': item.to_dict()}), 201
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()


@pharmacist_bp.route('/inventory/<item_id>', methods=['PUT'])
@pharmacist_required
def update_inventory_item(item_id):
    """Update inventory item quantity or details."""
    session = get_session_factory()()
    try:
        data = request.get_json()
        item = session.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'}), 404

        for field in ['name', 'category', 'sku', 'unit', 'supplier', 'description']:
            if field in data:
                setattr(item, field, data[field].strip() if isinstance(data[field], str) else data[field])
        for field in ['quantity', 'reorder_level']:
            if field in data:
                setattr(item, field, int(data[field]))
        if 'unit_price' in data:
            item.unit_price = float(data['unit_price'])

        session.commit()
        return jsonify({'success': True, 'message': 'Item updated', 'item': item.to_dict()}), 200
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()
