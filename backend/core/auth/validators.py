# core/auth/validators.py — MongoDB credential validators (legacy)
# Re-exported from the original auth.py for backward compatibility.

from auth import (  # noqa: F401
    validate_admin_credentials,
    validate_doctor_credentials,
    validate_nurse_credentials,
    validate_patient_credentials,
    validate_vendor_credentials,
)

__all__ = [
    'validate_admin_credentials',
    'validate_doctor_credentials',
    'validate_nurse_credentials',
    'validate_patient_credentials',
    'validate_vendor_credentials',
]
