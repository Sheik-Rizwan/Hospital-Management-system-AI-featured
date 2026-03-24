# auth.py - Authentication Logic & Decorators

import logging
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from models.user_models import User

logger = logging.getLogger(__name__)


# ── Decorator Factory ──

def role_required(*allowed_roles):
    """
    Decorator factory for role-based access control.
    Usage:
        @role_required('doctor')
        @role_required('super_admin', 'doctor')
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                verify_jwt_in_request()
                claims = get_jwt()
                user_role = claims.get('role')
                if user_role not in allowed_roles:
                    label = ' or '.join(r.replace('_', ' ').title() for r in allowed_roles)
                    return jsonify({
                        'success': False,
                        'error': f'{label} access required'
                    }), 403
                return f(*args, **kwargs)
            except Exception:
                return jsonify({
                    'success': False,
                    'error': 'Authentication failed'
                }), 401
        return decorated
    return decorator


def token_required(f):
    """Decorator to require valid JWT token (any role)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            verify_jwt_in_request()
            return f(*args, **kwargs)
        except Exception:
            return jsonify({
                'success': False,
                'error': 'Invalid or expired token. Please login again.'
            }), 401
    return decorated


# ── Convenience aliases (backward-compatible) ──

admin_required = role_required('super_admin')
doctor_required = role_required('doctor')
nurse_required = role_required('nurse')
patient_required = role_required('patient')
vendor_required = role_required('vendor')
admin_or_doctor_required = role_required('super_admin', 'doctor')
admin_or_nurse_required = role_required('super_admin', 'nurse')


def get_current_user():
    """Get current user information from JWT"""
    try:
        verify_jwt_in_request()
        claims = get_jwt()
        return {
            'user_id': get_jwt_identity(),
            'role': claims.get('role'),
            'email': claims.get('email', ''),
            'full_name': claims.get('full_name', ''),
            'patient_id': claims.get('patient_id', ''),
            'patient_name': claims.get('patient_name', ''),
            'specialization': claims.get('specialization', ''),
            'department': claims.get('department', '')
        }
    except:
        return None


def validate_admin_credentials(email: str, password: str, db) -> dict:
    """Validate super admin login credentials"""
    admin = db.admins.find_one({'email': email.lower()})
    if not admin:
        return None
    if not admin.get('is_active', False):
        return None
    stored_password = admin.get('password')
    if not stored_password or not isinstance(stored_password, str):
        return None
    if not stored_password.startswith('$2b$') and not stored_password.startswith('$2a$'):
        return None
    try:
        if User.check_password(stored_password, password):
            return admin
    except Exception:
        pass
    return None


def validate_doctor_credentials(email: str, password: str, db) -> dict:
    """Validate doctor login credentials"""
    doctor = db.doctors.find_one({'email': email.lower()})
    if not doctor:
        logger.warning(f"Doctor login failed: no doctor found with email '{email.lower()}'")
        return None
    if not doctor.get('is_active', False):
        logger.warning(f"Doctor login failed: account '{email}' is inactive (is_active={doctor.get('is_active')})")
        return None
    stored_password = doctor.get('password')
    if not stored_password or not isinstance(stored_password, str):
        logger.warning(f"Doctor login failed: no password stored for '{email}'")
        return None
    if not stored_password.startswith('$2b$') and not stored_password.startswith('$2a$'):
        logger.warning(f"Doctor login failed: invalid password hash format for '{email}' (starts with '{stored_password[:10]}')") 
        return None
    try:
        if User.check_password(stored_password, password):
            logger.info(f"Doctor login successful: '{email}'")
            return doctor
        else:
            logger.warning(f"Doctor login failed: wrong password for '{email}'")
    except Exception as e:
        logger.error(f"Doctor login failed: bcrypt error for '{email}': {e}")
    return None


def validate_nurse_credentials(email: str, password: str, db) -> dict:
    """Validate nurse login credentials"""
    nurse = db.nurses.find_one({'email': email.lower()})
    if not nurse:
        logger.warning(f"Nurse login failed: no nurse found with email '{email.lower()}'")
        return None
    if not nurse.get('is_active', False):
        logger.warning(f"Nurse login failed: account '{email}' is inactive (is_active={nurse.get('is_active')})")
        return None
    stored_password = nurse.get('password')
    if not stored_password or not isinstance(stored_password, str):
        logger.warning(f"Nurse login failed: no password stored for '{email}'")
        return None
    if not stored_password.startswith('$2b$') and not stored_password.startswith('$2a$'):
        logger.warning(f"Nurse login failed: invalid password hash format for '{email}' (starts with '{stored_password[:10]}')")
        return None
    try:
        if User.check_password(stored_password, password):
            logger.info(f"Nurse login successful: '{email}'")
            return nurse
        else:
            logger.warning(f"Nurse login failed: wrong password for '{email}'")
    except Exception as e:
        logger.error(f"Nurse login failed: bcrypt error for '{email}': {e}")
    return None


def validate_patient_credentials(identifier: str, password: str, db) -> dict:
    """Validate patient login credentials.
    Accepts user_id, patient_id, or email for lookup.
    """
    # Try finding by user_id, then patient_id, then email
    patient = db.patients.find_one({'user_id': identifier})
    if not patient:
        patient = db.patients.find_one({'patient_id': identifier})
    if not patient:
        patient = db.patients.find_one({'email': identifier.lower()})
    if not patient:
        return None

    if not patient.get('is_active', False):
        return None

    stored_pw = patient.get('password')
    if not stored_pw or not isinstance(stored_pw, str):
        return None
    if not stored_pw.startswith('$2b$') and not stored_pw.startswith('$2a$'):
        return None

    try:
        is_valid = User.check_password(stored_pw, password)
    except Exception:
        is_valid = False

    if is_valid:
        return patient
    return None


def validate_vendor_credentials(email: str, password: str, db) -> dict:
    """Validate vendor login credentials"""
    vendor = db.vendors.find_one({'email': email.lower()})
    if not vendor:
        return None
    if not vendor.get('is_active', False):
        return None
    if not vendor.get('is_approved', False):
        return None
    stored_password = vendor.get('password')
    if not stored_password or not isinstance(stored_password, str):
        return None
    if not stored_password.startswith('$2b$') and not stored_password.startswith('$2a$'):
        return None
    try:
        if User.check_password(stored_password, password):
            return vendor
    except Exception:
        pass
    return None