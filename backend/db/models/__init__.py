# db/models/__init__.py — Import all models so Base.metadata registers them

from db.models.role import Role, Permission, role_permissions
from db.models.user import User
from db.models.doctor_profile import DoctorProfile
from db.models.nurse_profile import NurseProfile
from db.models.staff_profile import StaffProfile
from db.models.patient import PatientProfile
from db.models.appointment import Appointment
from db.models.prescription import Prescription
from db.models.lab_request import LabRequest
from db.models.vital_sign import VitalSign
from db.models.invoice import Invoice, Payment
from db.models.inventory import InventoryItem

__all__ = [
    'Role', 'Permission', 'role_permissions',
    'User',
    'DoctorProfile', 'NurseProfile', 'StaffProfile', 'PatientProfile',
    'Appointment', 'Prescription', 'LabRequest', 'VitalSign',
    'Invoice', 'Payment', 'InventoryItem',
]
