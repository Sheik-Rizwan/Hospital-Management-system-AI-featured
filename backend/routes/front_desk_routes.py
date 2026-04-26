# routes/front_desk_routes.py — Front Desk Officer API (registration + billing)

import uuid as uuid_mod
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from auth import front_desk_required, role_required
from db import get_session_factory
from db.models.user import User
from db.models.role import Role
from db.models.patient import PatientProfile
from db.models.appointment import Appointment
from db.models.invoice import Invoice, Payment

front_desk_bp = Blueprint('front_desk', __name__)


# ── Patient Registration ──

@front_desk_bp.route('/patients', methods=['GET'])
@role_required('front_desk', 'nurse', 'system_admin')
def list_patients():
    """List patients (demographics only, no clinical data)."""
    session = get_session_factory()()
    try:
        patients = (
            session.query(User)
            .join(Role)
            .filter(Role.key == 'patient', User.is_active == True)
            .all()
        )
        result = []
        for p in patients:
            entry = {'id': str(p.id), 'name': p.full_name, 'email': p.email or '', 'phone': p.phone or ''}
            if p.patient_profile:
                entry.update({
                    'patient_id': p.patient_profile.patient_id,
                    'gender': p.patient_profile.gender or '',
                    'insurance_id': p.patient_profile.insurance_id or '',
                })
            result.append(entry)
        return jsonify({'success': True, 'patients': result}), 200
    finally:
        session.close()


@front_desk_bp.route('/patients', methods=['POST'])
@role_required('front_desk', 'nurse', 'system_admin')
def register_patient():
    """Register a new patient (front desk or nurse)."""
    session = get_session_factory()()
    try:
        data = request.get_json()
        if not data.get('full_name'):
            return jsonify({'success': False, 'error': 'Patient name is required'}), 400

        role = session.query(Role).filter(Role.key == 'patient').first()
        if not role:
            return jsonify({'success': False, 'error': 'Patient role not configured'}), 500

        user = User(
            email=data.get('email', '').strip().lower() or None,
            full_name=data['full_name'].strip(),
            phone=data.get('phone', '').strip() or None,
            role_id=role.id,
        )
        user.set_password(data.get('password', 'patient123'))
        session.add(user)
        session.flush()

        profile = PatientProfile(
            user_id=user.id,
            patient_id=f"PAT-{uuid_mod.uuid4().hex[:8].upper()}",
            date_of_birth=data.get('date_of_birth') or None,
            gender=data.get('gender', '').strip() or None,
            blood_group=data.get('blood_group', '').strip() or None,
            insurance_id=data.get('insurance_id', '').strip() or None,
            emergency_contact=data.get('emergency_contact', '').strip() or None,
        )
        session.add(profile)
        session.commit()

        return jsonify({
            'success': True,
            'message': 'Patient registered',
            'patient': {**user.to_dict(), **profile.to_dict()}
        }), 201
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()


@front_desk_bp.route('/patients/<patient_id>', methods=['PUT'])
@role_required('front_desk', 'system_admin')
def update_patient_demographics(patient_id):
    """Update patient demographics (no clinical data)."""
    session = get_session_factory()()
    try:
        data = request.get_json()
        user = session.query(User).filter(User.id == patient_id).first()
        if not user:
            return jsonify({'success': False, 'error': 'Patient not found'}), 404

        for field in ['full_name', 'phone']:
            if field in data:
                setattr(user, field, data[field].strip())
        if user.patient_profile:
            for field in ['gender', 'blood_group', 'insurance_id', 'emergency_contact']:
                if field in data:
                    setattr(user.patient_profile, field, data[field].strip())

        session.commit()
        result = user.to_dict()
        if user.patient_profile:
            result.update(user.patient_profile.to_dict())
        return jsonify({'success': True, 'message': 'Patient updated', 'patient': result}), 200
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()


# ── Appointments ──

@front_desk_bp.route('/appointments', methods=['GET'])
@role_required('front_desk', 'system_admin')
def list_appointments():
    """List appointments."""
    session = get_session_factory()()
    try:
        appointments = (
            session.query(Appointment)
            .filter(Appointment.is_active == True)
            .order_by(Appointment.date.desc(), Appointment.start_time.desc())
            .limit(100)
            .all()
        )
        return jsonify({'success': True, 'appointments': [a.to_dict() for a in appointments]}), 200
    finally:
        session.close()


# ── Invoices ──

@front_desk_bp.route('/invoices', methods=['GET'])
@role_required('front_desk', 'hospital_manager', 'system_admin')
def list_invoices():
    """List invoices."""
    session = get_session_factory()()
    try:
        invoices = (
            session.query(Invoice)
            .order_by(Invoice.created_at.desc())
            .limit(100)
            .all()
        )
        return jsonify({'success': True, 'invoices': [i.to_dict() for i in invoices]}), 200
    finally:
        session.close()


@front_desk_bp.route('/invoices', methods=['POST'])
@front_desk_required
def create_invoice():
    """Create a new invoice."""
    session = get_session_factory()()
    try:
        data = request.get_json()
        if not data.get('patient_id') or not data.get('amount'):
            return jsonify({'success': False, 'error': 'patient_id and amount required'}), 400

        invoice = Invoice(
            patient_id=data['patient_id'],
            created_by=get_jwt_identity(),
            invoice_number=f"INV-{uuid_mod.uuid4().hex[:8].upper()}",
            service_code=data.get('service_code', '').strip() or None,
            description=data.get('description', '').strip() or None,
            amount=float(data['amount']),
            tax=float(data.get('tax', 0)),
            total=float(data['amount']) + float(data.get('tax', 0)),
            due_date=data.get('due_date') or None,
        )
        session.add(invoice)
        session.commit()

        return jsonify({'success': True, 'message': 'Invoice created', 'invoice': invoice.to_dict()}), 201
    except Exception as e:
        session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        session.close()


@front_desk_bp.route('/payments', methods=['GET'])
@role_required('front_desk', 'hospital_manager', 'system_admin')
def list_payments():
    """Payment history."""
    session = get_session_factory()()
    try:
        payments = session.query(Payment).order_by(Payment.created_at.desc()).limit(100).all()
        return jsonify({'success': True, 'payments': [p.to_dict() for p in payments]}), 200
    finally:
        session.close()
