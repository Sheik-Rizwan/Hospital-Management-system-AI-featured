# db/seeds/seed_roles.py — Seed all 9 roles and their permissions

import logging
from sqlalchemy.orm import Session
from db.models.role import Role, Permission

logger = logging.getLogger(__name__)

# ── Role definitions ──
ROLES = [
    {'key': 'system_admin',      'display': 'System Administrator', 'category': 'admin'},
    {'key': 'hospital_manager',  'display': 'Hospital Manager',     'category': 'admin'},
    {'key': 'doctor',            'display': 'Doctor',               'category': 'clinical'},
    {'key': 'nurse',             'display': 'Nurse',                'category': 'clinical'},
    {'key': 'lab_technician',    'display': 'Lab Technician',       'category': 'clinical'},
    {'key': 'pharmacist',        'display': 'Pharmacist',           'category': 'clinical'},
    {'key': 'front_desk',        'display': 'Front Desk Officer',   'category': 'operations'},
    {'key': 'patient',           'display': 'Patient',              'category': 'portal'},
    {'key': 'vendor',            'display': 'Vendor',               'category': 'supply'},
]

# ── Permission definitions ──
PERMISSIONS = [
    # System
    'user.*', 'system.*', 'audit.*', 'backup.*',
    # Dashboard
    'dashboard.read', 'financial.read', 'staff.read', 'patient.read_census',
    # Clinical
    'patient.*', 'patient.read', 'patient.write', 'patient.register', 'patient.demographics',
    'ehr.*', 'prescription.*', 'prescription.read',
    'lab.read', 'lab.request.read', 'lab.result.write', 'lab.stats.read',
    'imaging.*',
    'vital.write', 'observation.write', 'doctor_notes.read',
    'care_plan.*', 'care_plan.read',
    'task.*',
    'dispense.*', 'medication_inventory.*',
    # Appointments
    'appointment.*', 'appointment.own',
    # Billing
    'invoice.*', 'payment.*',
    # Patient portal (own data only)
    'own.history', 'own.lab_results', 'own.appointments', 'own.bills',
    # Vendor
    'own.quotations', 'own.purchase_orders', 'own.delivery',
]

# ── Role → Permission mapping ──
ROLE_PERMISSIONS = {
    'system_admin':      ['user.*', 'system.*', 'audit.*', 'backup.*'],
    'hospital_manager':  ['dashboard.read', 'financial.read', 'staff.read', 'patient.read_census'],
    'doctor':            ['patient.*', 'ehr.*', 'prescription.*', 'lab.read', 'imaging.*', 'care_plan.*', 'appointment.own'],
    'nurse':             ['vital.write', 'observation.write', 'doctor_notes.read', 'care_plan.read', 'task.*', 'patient.register'],
    'lab_technician':    ['lab.request.read', 'lab.result.write', 'lab.stats.read'],
    'pharmacist':        ['prescription.read', 'dispense.*', 'medication_inventory.*'],
    'front_desk':        ['patient.register', 'patient.demographics', 'appointment.*', 'invoice.*', 'payment.*'],
    'patient':           ['own.history', 'own.lab_results', 'own.appointments', 'own.bills'],
    'vendor':            ['own.quotations', 'own.purchase_orders', 'own.delivery'],
}


def seed_roles_and_permissions(session: Session):
    """Insert roles and permissions if they don't exist. Safe to run multiple times."""

    # 1. Create permissions
    for perm_key in PERMISSIONS:
        existing = session.query(Permission).filter(Permission.key == perm_key).first()
        if not existing:
            session.add(Permission(key=perm_key, description=perm_key))
    session.flush()

    # 2. Create roles
    for role_data in ROLES:
        existing = session.query(Role).filter(Role.key == role_data['key']).first()
        if not existing:
            role = Role(**role_data)
            session.add(role)
    session.flush()

    # 3. Assign permissions to roles
    all_perms = {p.key: p for p in session.query(Permission).all()}
    all_roles = {r.key: r for r in session.query(Role).all()}

    for role_key, perm_keys in ROLE_PERMISSIONS.items():
        role = all_roles.get(role_key)
        if not role:
            continue
        for perm_key in perm_keys:
            perm = all_perms.get(perm_key)
            if perm and perm not in role.permissions:
                role.permissions.append(perm)

    session.commit()
    logger.info(f"Seeded {len(ROLES)} roles and {len(PERMISSIONS)} permissions")
