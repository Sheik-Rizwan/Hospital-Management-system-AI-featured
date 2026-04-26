# core/auth/decorators.py — Role-based & Permission-based access control decorators
# Extracted from auth.py — pure decorators, no business logic.

import logging
from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt

logger = logging.getLogger(__name__)


def role_required(*allowed_roles):
    """Decorator factory for role-based access control.
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
                    return jsonify({'success': False, 'error': f'{label} access required'}), 403
                return f(*args, **kwargs)
            except Exception:
                return jsonify({'success': False, 'error': 'Authentication failed'}), 401
        return decorated
    return decorator


def permission_required(*required_permissions):
    """Decorator factory for granular permission-based access control.
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
                        return jsonify({'success': False, 'error': f'Permission denied: {perm} required'}), 403
                return f(*args, **kwargs)
            except Exception:
                return jsonify({'success': False, 'error': 'Authentication failed'}), 401
        return decorated
    return decorator


def _has_permission(required: str, user_perms: list) -> bool:
    """Check if a required permission is satisfied. Supports wildcards: 'patient.*'."""
    for perm in user_perms:
        if perm == required:
            return True
        if perm.endswith('.*') and required.startswith(perm[:-2]):
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
            return jsonify({'success': False, 'error': 'Invalid or expired token. Please login again.'}), 401
    return decorated


# ── Convenience aliases ──
admin_required = role_required('super_admin', 'system_admin')
doctor_required = role_required('doctor')
nurse_required = role_required('nurse')
patient_required = role_required('patient')
vendor_required = role_required('vendor')
admin_or_doctor_required = role_required('super_admin', 'system_admin', 'doctor')
admin_or_nurse_required = role_required('super_admin', 'system_admin', 'nurse')

# New roles
hospital_manager_required = role_required('hospital_manager')
lab_technician_required = role_required('lab_technician')
pharmacist_required = role_required('pharmacist')
front_desk_required = role_required('front_desk')

# Composite groups
clinical_staff_required = role_required('doctor', 'nurse', 'lab_technician', 'pharmacist')
admin_staff_required = role_required('super_admin', 'system_admin', 'hospital_manager')
operations_required = role_required('front_desk')
