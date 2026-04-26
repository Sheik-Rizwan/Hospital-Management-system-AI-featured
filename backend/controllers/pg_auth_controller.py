# controllers/pg_auth_controller.py — Generic PostgreSQL-based auth for all 9 roles
# This is the NEW auth controller. The old auth_controller.py handles MongoDB legacy roles.

import logging
from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt

from db import get_session_factory
from db.models.user import User
from db.models.role import Role
from db.models.doctor_profile import DoctorProfile
from db.models.nurse_profile import NurseProfile
from db.models.staff_profile import StaffProfile
from db.models.patient import PatientProfile

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════
# Role Config — drives login/signup generically
# ══════════════════════════════════════════════════════

ROLE_CONFIG = {
    'system_admin': {
        'display': 'System Administrator',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': None,
    },
    'hospital_manager': {
        'display': 'Hospital Manager',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'staff',
        'profile_fields': ['department'],
    },
    'doctor': {
        'display': 'Doctor',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'doctor',
        'profile_fields': ['specialization', 'license_number', 'department'],
    },
    'nurse': {
        'display': 'Nurse',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'nurse',
        'profile_fields': ['employee_id', 'department', 'shift'],
    },
    'lab_technician': {
        'display': 'Lab Technician',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'staff',
        'profile_fields': ['employee_id', 'department', 'certification'],
    },
    'pharmacist': {
        'display': 'Pharmacist',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'staff',
        'profile_fields': ['employee_id', 'license_number'],
    },
    'front_desk': {
        'display': 'Front Desk Officer',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'staff',
        'profile_fields': ['employee_id', 'desk_location'],
    },
    'patient': {
        'display': 'Patient',
        'required_fields': ['email', 'password', 'full_name'],
        'profile_type': 'patient',
        'profile_fields': ['date_of_birth', 'gender', 'blood_group', 'insurance_id', 'emergency_contact'],
    },
}


# ══════════════════════════════════════════════════════
# Generic Login — works for ANY role
# ══════════════════════════════════════════════════════

def pg_role_login(role_key: str):
    """Generic login handler for any role using PostgreSQL."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password required'}), 400

        session = get_session_factory()()
        try:
            user = (
                session.query(User)
                .join(Role)
                .filter(User.email == email, Role.key == role_key)
                .first()
            )

            if not user:
                return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
            if not user.is_active:
                return jsonify({'success': False, 'error': 'Account is deactivated'}), 401
            if not user.check_password(password):
                return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

            # Build JWT claims with permissions
            perms = [p.key for p in user.role_rel.permissions] if user.role_rel else []
            claims = {
                'role': role_key,
                'email': user.email,
                'full_name': user.full_name,
                'permissions': perms,
            }

            # Add profile-specific claims
            if user.doctor_profile:
                claims['specialization'] = user.doctor_profile.specialization or ''
                claims['department'] = user.doctor_profile.department or ''
            elif user.nurse_profile:
                claims['department'] = user.nurse_profile.department or ''
                claims['employee_id'] = user.nurse_profile.employee_id or ''
            elif user.staff_profile:
                claims['department'] = user.staff_profile.department or ''
                claims['employee_id'] = user.staff_profile.employee_id or ''
            elif user.patient_profile:
                claims['patient_id'] = user.patient_profile.patient_id or ''

            token = create_access_token(identity=str(user.id), additional_claims=claims)

            return jsonify({
                'success': True,
                'token': token,
                'user': user.to_dict()
            }), 200

        finally:
            session.close()

    except Exception as e:
        logger.error(f"Login error ({role_key}): {e}")
        return jsonify({'success': False, 'error': 'Login failed'}), 500


# ══════════════════════════════════════════════════════
# Generic Signup — works for ANY role
# ══════════════════════════════════════════════════════

def pg_role_signup(role_key: str):
    """Generic signup handler for any role using PostgreSQL."""
    config = ROLE_CONFIG.get(role_key)
    if not config:
        return jsonify({'success': False, 'error': f'Unknown role: {role_key}'}), 400

    try:
        data = request.get_json()

        # Validate required fields
        missing = [f for f in config['required_fields'] if not data.get(f, '').strip()]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {", ".join(missing)}'}), 400

        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()

        if len(password) < 6:
            return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

        session = get_session_factory()()
        try:
            # Check duplicate email
            existing = session.query(User).filter(User.email == email).first()
            if existing:
                return jsonify({'success': False, 'error': 'Email already registered'}), 409

            # Get role
            role = session.query(Role).filter(Role.key == role_key).first()
            if not role:
                return jsonify({'success': False, 'error': f'Role not configured: {role_key}'}), 500

            # Create user
            user = User(
                email=email,
                full_name=data.get('full_name', '').strip(),
                phone=data.get('phone', '').strip() or None,
                role_id=role.id,
            )
            user.set_password(password)
            session.add(user)
            session.flush()  # Get user.id

            # Create profile extension
            profile_type = config.get('profile_type')
            if profile_type == 'doctor':
                profile = DoctorProfile(
                    user_id=user.id,
                    specialization=data.get('specialization', '').strip() or None,
                    license_number=data.get('license_number', '').strip() or None,
                    department=data.get('department', '').strip() or None,
                )
                session.add(profile)
            elif profile_type == 'nurse':
                profile = NurseProfile(
                    user_id=user.id,
                    employee_id=data.get('employee_id', '').strip() or None,
                    department=data.get('department', '').strip() or None,
                    shift=data.get('shift', 'Day').strip(),
                )
                session.add(profile)
            elif profile_type == 'staff':
                profile = StaffProfile(
                    user_id=user.id,
                    employee_id=data.get('employee_id', '').strip() or None,
                    department=data.get('department', '').strip() or None,
                    certification=data.get('certification', '').strip() or None,
                    license_number=data.get('license_number', '').strip() or None,
                    desk_location=data.get('desk_location', '').strip() or None,
                )
                session.add(profile)
            elif profile_type == 'patient':
                import uuid as uuid_mod
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

            logger.info(f"{config['display']} created: {email}")
            return jsonify({
                'success': True,
                'message': f'{config["display"]} account created successfully',
                'user': user.to_dict()
            }), 201

        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    except Exception as e:
        logger.error(f"Signup error ({role_key}): {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ══════════════════════════════════════════════════════
# Profile — Generic get/update for any role
# ══════════════════════════════════════════════════════

@jwt_required()
def pg_get_profile():
    """Get current user's profile (works for any role)."""
    try:
        user_id = get_jwt_identity()
        session = get_session_factory()()
        try:
            user = session.query(User).filter(User.id == user_id).first()
            if not user:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            profile = user.to_dict()
            # Merge profile extension data
            if user.doctor_profile:
                profile.update(user.doctor_profile.to_dict())
            elif user.nurse_profile:
                profile.update(user.nurse_profile.to_dict())
            elif user.staff_profile:
                profile.update(user.staff_profile.to_dict())
            elif user.patient_profile:
                profile.update(user.patient_profile.to_dict())

            return jsonify({'success': True, 'user': profile}), 200
        finally:
            session.close()
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@jwt_required()
def pg_update_profile():
    """Update current user's profile (works for any role)."""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        session = get_session_factory()()
        try:
            user = session.query(User).filter(User.id == user_id).first()
            if not user:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            # Update base fields
            for field in ['full_name', 'phone']:
                if field in data:
                    setattr(user, field, data[field].strip() if isinstance(data[field], str) else data[field])

            # Handle password change
            if data.get('new_password') and data.get('current_password'):
                if not user.check_password(data['current_password']):
                    return jsonify({'success': False, 'error': 'Current password is incorrect'}), 400
                user.set_password(data['new_password'])

            # Update profile extension
            profile = user.doctor_profile or user.nurse_profile or user.staff_profile or user.patient_profile
            if profile:
                profile_fields = ['specialization', 'license_number', 'department', 'employee_id',
                                  'certification', 'desk_location', 'shift', 'gender', 'blood_group',
                                  'insurance_id', 'emergency_contact']
                for field in profile_fields:
                    if field in data and hasattr(profile, field):
                        setattr(profile, field, data[field].strip() if isinstance(data[field], str) else data[field])

            session.commit()

            result = user.to_dict()
            if profile:
                result.update(profile.to_dict())

            return jsonify({'success': True, 'message': 'Profile updated', 'user': result}), 200

        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ══════════════════════════════════════════════════════
# Route Factory — Generates login/signup endpoints
# ══════════════════════════════════════════════════════

def make_login(role_key):
    """Create a login view function for a specific role."""
    def login_view():
        return pg_role_login(role_key)
    login_view.__name__ = f'{role_key}_login'
    return login_view


def make_signup(role_key):
    """Create a signup view function for a specific role."""
    def signup_view():
        return pg_role_signup(role_key)
    signup_view.__name__ = f'{role_key}_signup'
    return signup_view
