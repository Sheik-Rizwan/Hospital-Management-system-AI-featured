# routes/manager_routes.py — Hospital Manager API (read-only analytics)

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from auth import hospital_manager_required, admin_staff_required
from db import get_session_factory
from db.models.user import User
from db.models.role import Role
from db.models.appointment import Appointment

manager_bp = Blueprint('manager', __name__)


@manager_bp.route('/dashboard', methods=['GET'])
@admin_staff_required
def get_dashboard():
    """High-level KPIs for hospital manager."""
    session = get_session_factory()()
    try:
        stats = {}
        roles = session.query(Role).all()
        for role in roles:
            count = session.query(User).filter(User.role_id == role.id, User.is_active == True).count()
            stats[f'total_{role.key}s'] = count
        stats['total_users'] = session.query(User).filter(User.is_active == True).count()
        stats['total_appointments'] = session.query(Appointment).filter(Appointment.is_active == True).count()

        return jsonify({'success': True, 'stats': stats}), 200
    finally:
        session.close()


@manager_bp.route('/staff', methods=['GET'])
@admin_staff_required
def get_staff():
    """List all staff (doctors, nurses, lab techs, pharmacists, front desk)."""
    session = get_session_factory()()
    try:
        clinical_roles = ['doctor', 'nurse', 'lab_technician', 'pharmacist', 'front_desk']
        staff = (
            session.query(User)
            .join(Role)
            .filter(Role.key.in_(clinical_roles), User.is_active == True)
            .all()
        )
        return jsonify({
            'success': True,
            'staff': [{'id': str(u.id), 'name': u.full_name, 'role': u.role_key, 'email': u.email} for u in staff]
        }), 200
    finally:
        session.close()


@manager_bp.route('/patients', methods=['GET'])
@admin_staff_required
def get_patient_census():
    """Patient census (demographics only, no clinical notes)."""
    session = get_session_factory()()
    try:
        patients = (
            session.query(User)
            .join(Role)
            .filter(Role.key == 'patient', User.is_active == True)
            .all()
        )
        census = []
        for p in patients:
            entry = {'id': str(p.id), 'name': p.full_name, 'phone': p.phone or ''}
            if p.patient_profile:
                entry.update({
                    'patient_id': p.patient_profile.patient_id,
                    'gender': p.patient_profile.gender or '',
                    'blood_group': p.patient_profile.blood_group or '',
                })
            census.append(entry)
        return jsonify({'success': True, 'patients': census}), 200
    finally:
        session.close()
