# core/auth/ — Authentication decorators, helpers, and validators
# Usage:
#   from core.auth import role_required, permission_required, token_required
#   from core.auth import get_current_user
#   from core.auth.validators import validate_doctor_credentials

from core.auth.decorators import (
    role_required, permission_required, token_required,
    admin_required, doctor_required, nurse_required, patient_required,
    vendor_required, admin_or_doctor_required, admin_or_nurse_required,
    hospital_manager_required, lab_technician_required,
    pharmacist_required, front_desk_required,
    clinical_staff_required, admin_staff_required, operations_required,
)
from core.auth.helpers import get_current_user, validate_credentials_pg

__all__ = [
    'role_required', 'permission_required', 'token_required',
    'admin_required', 'doctor_required', 'nurse_required', 'patient_required',
    'vendor_required', 'admin_or_doctor_required', 'admin_or_nurse_required',
    'hospital_manager_required', 'lab_technician_required',
    'pharmacist_required', 'front_desk_required',
    'clinical_staff_required', 'admin_staff_required', 'operations_required',
    'get_current_user', 'validate_credentials_pg',
]
