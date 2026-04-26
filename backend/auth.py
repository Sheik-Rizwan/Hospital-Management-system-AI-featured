# auth.py - Authentication Logic & Decorators (PostgreSQL + MongoDB backward-compat)

import logging
from functools import wraps
from flask import request, jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
# 1. DECORATORS — Role-based & Permission-based access control
# ══════════════════════════════════════════════════════════════

def role_required(*allowed_roles):
    """
    Decorator factory for role-based access control.
    Usage:
        @role_required('doctor')
        @role_required('system_admin', 'doctor')
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


def permission_required(*required_permissions):
    """
    Decorator factory for granular permission-based access control.
    Checks the role_permissions table via the JWT role claim.
    Usage:
        @permission_required('patient.read')
        @permission_required('lab.result.write', 'lab.request.read')
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                verify_jwt_in_request()
                claims = get_jwt()
                user_perms = claims.get('permissions', [])
                
                for perm in required_permissions:
                    if not _has_permission(perm, user_perms):
                        return jsonify({
                            'success': False,
                            'error': f'Permission denied: {perm} required'
                        }), 403
                return f(*args, **kwargs)
            except Exception:
                return jsonify({
                    'success': False,
                    'error': 'Authentication failed'
                }), 401
        return decorated
    return decorator


def _has_permission(required: str, user_perms: list) -> bool:
    """Check if a required permission is satisfied by the user's permission list.
    Supports wildcards: 'patient.*' satisfies 'patient.read'."""
    for perm in user_perms:
        if perm == required:
            return True
        if perm.endswith('.*'):
            prefix = perm[:-2]
            if required.startswith(prefix):
                return True
    return False


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


# ══════════════════════════════════════════════════════
# 2. ROLE ALIASES — Convenience decorators for each role
# ══════════════════════════════════════════════════════

# Existing roles (backward-compatible aliases)
admin_required  = role_required('super_admin', 'system_admin')
doctor_required = role_required('doctor')
nurse_required  = role_required('nurse')
patient_required = role_required('patient')
vendor_required = role_required('vendor')
admin_or_doctor_required = role_required('super_admin', 'system_admin', 'doctor')
admin_or_nurse_required  = role_required('super_admin', 'system_admin', 'nurse')

# New roles
hospital_manager_required = role_required('hospital_manager')
lab_technician_required   = role_required('lab_technician')
pharmacist_required       = role_required('pharmacist')
front_desk_required       = role_required('front_desk')

# Composite groups
clinical_staff_required = role_required('doctor', 'nurse', 'lab_technician', 'pharmacist')
admin_staff_required    = role_required('super_admin', 'system_admin', 'hospital_manager')
operations_required     = role_required('front_desk')


# ══════════════════════════════════════════════════════
# 3. JWT HELPERS — Extract current user info from token
# ══════════════════════════════════════════════════════

def get_current_user():
    """Get current user information from JWT."""
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
            'department': claims.get('department', ''),
            'permissions': claims.get('permissions', []),
        }
    except:
        return None


# ══════════════════════════════════════════════════════════════════
# 4. GENERIC CREDENTIAL VALIDATOR — PostgreSQL via SQLAlchemy
# ══════════════════════════════════════════════════════════════════

def validate_credentials_pg(email: str, password: str, role_key: str = None):
    """
    Generic credential validation using PostgreSQL.
    Returns User ORM object if valid, None otherwise.
    If role_key is provided, restricts to that role.
    """
    try:
        from db import get_session_factory
        from db.models.user import User as PgUser
        from db.models.role import Role

        session = get_session_factory()()
        try:
            q = session.query(PgUser).filter(PgUser.email == email.lower())
            if role_key:
                q = q.join(Role).filter(Role.key == role_key)
            user = q.first()

            if not user:
                return None
            if not user.is_active:
                return None
            if not user.check_password(password):
                return None
            return user
        finally:
            session.close()
    except Exception as e:
        logger.error(f"PostgreSQL auth error: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════
# 5. LEGACY MONGODB VALIDATORS — Kept for backward compatibility
#    These will be removed once all services migrate to PostgreSQL
# ══════════════════════════════════════════════════════════════════════

def validate_admin_credentials(email: str, password: str, db) -> dict:
    """Validate super admin login credentials (MongoDB legacy)."""
    from models.user_models import User as MongoUser
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
        if MongoUser.check_password(stored_password, password):
            return admin
    except Exception:
        pass
    return None


def validate_doctor_credentials(email: str, password: str, db) -> dict:
    """Validate doctor login credentials (MongoDB legacy)."""
    from models.user_models import User as MongoUser
    doctor = db.doctors.find_one({'email': email.lower()})
    if not doctor:
        logger.warning(f"Doctor login failed: no doctor found with email '{email.lower()}'")
        return None
    if not doctor.get('is_active', False):
        logger.warning(f"Doctor login failed: account '{email}' is inactive")
        return None
    stored_password = doctor.get('password')
    if not stored_password or not isinstance(stored_password, str):
        return None
    if not stored_password.startswith('$2b$') and not stored_password.startswith('$2a$'):
        return None
    try:
        if MongoUser.check_password(stored_password, password):
            return doctor
        else:
            logger.warning(f"Doctor login failed: wrong password for '{email}'")
    except Exception as e:
        logger.error(f"Doctor login failed: bcrypt error for '{email}': {e}")
    return None


def validate_nurse_credentials(email: str, password: str, db) -> dict:
    """Validate nurse login credentials (MongoDB legacy)."""
    from models.user_models import User as MongoUser
    nurse = db.nurses.find_one({'email': email.lower()})
    if not nurse:
        return None
    if not nurse.get('is_active', False):
        return None
    stored_password = nurse.get('password')
    if not stored_password or not isinstance(stored_password, str):
        return None
    if not stored_password.startswith('$2b$') and not stored_password.startswith('$2a$'):
        return None
    try:
        if MongoUser.check_password(stored_password, password):
            return nurse
    except Exception as e:
        logger.error(f"Nurse login failed: bcrypt error for '{email}': {e}")
    return None


def validate_patient_credentials(identifier: str, password: str, db) -> dict:
    """Validate patient login credentials (MongoDB legacy)."""
    from models.user_models import User as MongoUser
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
        is_valid = MongoUser.check_password(stored_pw, password)
    except Exception:
        is_valid = False
    if is_valid:
        return patient
    return None


def validate_vendor_credentials(email: str, password: str, db) -> dict:
    """Validate vendor login credentials (MongoDB legacy)."""
    from models.user_models import User as MongoUser
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
        if MongoUser.check_password(stored_password, password):
            return vendor
    except Exception:
        pass
    return None