# auth_controller.py - Authentication business logic

import uuid
import logging
from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity, get_jwt
)

logger = logging.getLogger(__name__)

from mongodb_config import MongoDatabase
from models.user_models import User, Doctor, Nurse, Patient, SuperAdmin
from models.vendor_models import Vendor
from auth import (
    validate_doctor_credentials,
    validate_nurse_credentials,
    validate_patient_credentials,
    validate_admin_credentials,
    validate_vendor_credentials
)

db = MongoDatabase()


def _build_token(identity, claims):
    """Create JWT access token with role claims."""
    return create_access_token(identity=identity, additional_claims=claims)


# ── Login Controllers ──

def doctor_login():
    """Doctor login."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password required'}), 400

        doctor = validate_doctor_credentials(email, password, db)
        if not doctor:
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

        token = _build_token(doctor['user_id'], {
            'role': 'doctor',
            'email': doctor['email'],
            'full_name': doctor.get('full_name', ''),
            'specialization': doctor.get('specialization', '')
        })

        return jsonify({
            'success': True,
            'access_token': token,
            'user': {
                'user_id': doctor['user_id'],
                'email': doctor['email'],
                'full_name': doctor.get('full_name', ''),
                'role': 'doctor',
                'specialization': doctor.get('specialization', ''),
                'phone': doctor.get('phone', '')
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def nurse_login():
    """Nurse login."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password required'}), 400

        nurse = validate_nurse_credentials(email, password, db)
        if not nurse:
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

        token = _build_token(nurse['user_id'], {
            'role': 'nurse',
            'email': nurse['email'],
            'full_name': nurse.get('full_name', '')
        })

        return jsonify({
            'success': True,
            'access_token': token,
            'user': {
                'user_id': nurse['user_id'],
                'email': nurse['email'],
                'full_name': nurse.get('full_name', ''),
                'role': 'nurse',
                'department': nurse.get('department', ''),
                'phone': nurse.get('phone', ''),
                'shift': nurse.get('shift', 'Day')
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def patient_login():
    """Patient login."""
    try:
        data = request.get_json()
        user_id = data.get('patient_id', data.get('user_id', '')).strip()
        password = data.get('password', '').strip()

        if not user_id or not password:
            return jsonify({'success': False, 'error': 'User ID and password required'}), 400

        patient = validate_patient_credentials(user_id, password, db)
        if not patient:
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

        token = _build_token(patient['user_id'], {
            'role': 'patient',
            'patient_id': patient.get('patient_id', ''),
            'patient_name': patient.get('patient_name', '')
        })

        return jsonify({
            'success': True,
            'access_token': token,
            'user': {
                'user_id': patient['user_id'],
                'patient_id': patient.get('patient_id', ''),
                'patient_name': patient.get('patient_name', ''),
                'role': 'patient',
                'email': patient.get('email', ''),
                'phone': patient.get('phone', '')
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def patient_whatsapp_login():
    """Login for WhatsApp users using their phone number."""
    try:
        data = request.get_json()
        phone = data.get('phone', '').strip()

        if not phone:
            return jsonify({'success': False, 'error': 'Phone number is required'}), 400

        phone_clean = ''.join(c for c in phone if c.isdigit())

        patient = db.patients.find_one({'phone': phone_clean, 'is_active': True})
        if not patient:
            patient = db.patients.find_one({'patient_id': f'wa_{phone_clean}', 'is_active': True})
        if not patient:
            if not phone_clean.startswith('91'):
                patient = db.patients.find_one({'phone': f'91{phone_clean}', 'is_active': True})
                if not patient:
                    patient = db.patients.find_one({'patient_id': f'wa_91{phone_clean}', 'is_active': True})

        if not patient:
            return jsonify({
                'success': False,
                'error': 'No WhatsApp patient found with this phone number. Please book an appointment via WhatsApp first.'
            }), 404

        token = _build_token(patient['user_id'], {
            'role': 'patient',
            'patient_id': patient.get('patient_id', ''),
            'patient_name': patient.get('patient_name', '')
        })

        return jsonify({
            'success': True,
            'access_token': token,
            'user': {
                'user_id': patient['user_id'],
                'patient_id': patient.get('patient_id', ''),
                'patient_name': patient.get('patient_name', ''),
                'role': 'patient',
                'email': patient.get('email', ''),
                'phone': patient.get('phone', '')
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def admin_login():
    """Super Admin login."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password required'}), 400

        admin = validate_admin_credentials(email, password, db)
        if not admin:
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

        token = _build_token(admin['user_id'], {
            'role': 'super_admin',
            'email': admin['email'],
            'full_name': admin.get('full_name', '')
        })

        return jsonify({
            'success': True,
            'access_token': token,
            'user': {
                'user_id': admin['user_id'],
                'email': admin['email'],
                'full_name': admin.get('full_name', ''),
                'role': 'super_admin',
                'phone': admin.get('phone', '')
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Signup Controllers ──

def doctor_signup():
    """Doctor self-registration."""
    try:
        data = request.get_json()

        required = ['full_name', 'email', 'password', 'specialization', 'license_number']
        for field in required:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} is required'}), 400

        existing = db.doctors.find_one({'email': data['email'].lower()})
        if existing:
            return jsonify({'success': False, 'error': 'Email already registered'}), 409

        existing_license = db.doctors.find_one({'license_number': data.get('license_number', '').strip()})
        if existing_license:
            return jsonify({'success': False, 'error': 'Medical License Number already registered'}), 409

        user_id = f"doctor_{uuid.uuid4().hex[:8]}"

        doctor_data = {
            'user_id': user_id,
            'email': data['email'].strip(),
            'password': data['password'],
            'full_name': data['full_name'].strip(),
            'specialization': data['specialization'].strip(),
            'license_number': data.get('license_number', '').strip(),
            'phone': data.get('phone', '').strip(),
            'is_approved': True,
        }

        doctor_doc = Doctor.create(doctor_data)
        db.create_doctor(doctor_doc)

        return jsonify({
            'success': True,
            'message': 'Doctor account created successfully.',
            'user_id': user_id
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def nurse_signup():
    """Nurse self-registration."""
    try:
        data = request.get_json()

        required = ['full_name', 'email', 'password', 'employee_id']
        for field in required:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} is required'}), 400

        existing = db.nurses.find_one({'email': data['email'].lower()})
        if existing:
            return jsonify({'success': False, 'error': 'Email already registered'}), 409

        existing_emp = db.nurses.find_one({'employee_id': data['employee_id']})
        if existing_emp:
            return jsonify({'success': False, 'error': 'Employee ID already registered'}), 409

        user_id = f"nurse_{uuid.uuid4().hex[:8]}"

        nurse_data = {
            'user_id': user_id,
            'email': data['email'],
            'password': data['password'],
            'full_name': data['full_name'],
            'employee_id': data['employee_id'],
            'department': data.get('department', ''),
            'phone': data.get('phone', ''),
            'shift': data.get('shift', 'Day'),
        }

        nurse_doc = Nurse.create(nurse_data)
        db.nurses.insert_one(nurse_doc)

        return jsonify({
            'success': True,
            'message': 'Nurse account created successfully.',
            'user_id': user_id
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def vendor_signup():
    """Vendor signup. Requires admin approval."""
    try:
        data = request.get_json()

        required = ['email', 'password', 'company_name', 'category']
        for field in required:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} is required'}), 400

        existing = db.vendors.find_one({'email': data['email'].lower()})
        if existing:
            return jsonify({'success': False, 'error': 'Email already registered'}), 409

        user_id = f"vendor_{uuid.uuid4().hex[:8]}"

        vendor_data = {
            'user_id': user_id,
            'email': data['email'],
            'password': data['password'],
            'company_name': data['company_name'],
            'category': data['category'],
            'contact_person': data.get('contact_person', ''),
            'phone': data.get('phone', ''),
            'address': data.get('address', ''),
            'gst_number': data.get('gst_number', ''),
            'is_approved': False,
            'is_active': False
        }

        vendor_user = Vendor.create(vendor_data)
        db.create_vendor(vendor_user)

        return jsonify({
            'success': True,
            'message': 'Vendor account created successfully. Awaiting admin approval.',
            'user_id': user_id
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def patient_signup():
    """Patient self-registration."""
    try:
        data = request.get_json()

        required = ['patient_name', 'date_of_birth', 'gender', 'password']
        for field in required:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} is required'}), 400

        patient_id = f"PAT-{uuid.uuid4().hex[:8].upper()}"
        user_id = f"patient_{uuid.uuid4().hex[:8]}"

        patient_data = {
            'user_id': user_id,
            'patient_id': patient_id,
            'patient_name': data['patient_name'],
            'date_of_birth': data['date_of_birth'],
            'gender': data['gender'],
            'password': data['password'],
            'email': data.get('email', ''),
            'phone': data.get('phone', ''),
            'bed_number': data.get('bed_number', ''),
            'assigned_doctor': data.get('assigned_doctor', None)
        }

        patient_user = Patient.create(patient_data)
        db.create_patient(patient_user)

        return jsonify({
            'success': True,
            'message': 'Patient account created successfully.',
            'user_id': user_id,
            'patient_id': patient_id
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Profile Controllers ──

def get_user_profile():
    """Get current user profile."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role', '')

        collection_map = {
            'doctor': db.doctors,
            'nurse': db.nurses,
            'patient': db.patients,
            'super_admin': db.admins,
            'vendor': db.vendors
        }

        collection = collection_map.get(role)
        if collection is None:
            return jsonify({'success': False, 'error': 'Invalid role'}), 400

        user = collection.find_one({'user_id': user_id}, {'_id': 0, 'password': 0})
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        for key in ['created_at', 'updated_at']:
            if key in user and user[key]:
                user[key] = user[key].isoformat() if hasattr(user[key], 'isoformat') else str(user[key])

        return jsonify({'success': True, 'user': user}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def update_user_profile():
    """Update current user profile."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role', '')
        data = request.get_json()

        allowed_fields = [
            'full_name', 'phone', 'email', 'patient_name', 'company_name',
            'contact_person', 'address', 'specialization'
        ]
        update_data = {}
        for field in allowed_fields:
            if field in data:
                val = data[field]
                update_data[field] = val.strip() if isinstance(val, str) else val

        collection_map = {
            'doctor': db.doctors,
            'nurse': db.nurses,
            'patient': db.patients,
            'super_admin': db.admins,
            'vendor': db.vendors
        }
        collection = collection_map.get(role)
        if collection is None:
            return jsonify({'success': False, 'error': 'Invalid role'}), 400

        # Handle password change
        if data.get('new_password') and data.get('current_password'):
            user = collection.find_one({'user_id': user_id})
            if user and User.check_password(user['password'], data['current_password']):
                update_data['password'] = User.hash_password(data['new_password'])
            else:
                return jsonify({'success': False, 'error': 'Current password is incorrect'}), 400

        if not update_data:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400

        update_data['updated_at'] = datetime.now()

        result = collection.update_one({'user_id': user_id}, {'$set': update_data})

        if result.modified_count > 0:
            # ── Propagate name changes to denormalized copies ──
            try:
                if role == 'patient' and 'patient_name' in update_data:
                    new_name = update_data['patient_name']
                    # Update patient_name in appointments
                    db.db.appointments.update_many(
                        {'patient_id': user_id},
                        {'$set': {'patient_name': new_name}}
                    )
                    # Update patient_name in tasks
                    db.db.tasks.update_many(
                        {'patient_id': user_id},
                        {'$set': {'patient_name': new_name}}
                    )
                    # Update patient_name in meals
                    db.healthcare_db['patient_meals'].update_many(
                        {'patient_id': user_id},
                        {'$set': {'patient_name': new_name}}
                    )
                    # Update in wa_users (WhatsApp)
                    db.db.wa_users.update_many(
                        {'patient_id': user_id},
                        {'$set': {'name': new_name}}
                    )
                elif role == 'nurse' and 'full_name' in update_data:
                    new_name = update_data['full_name']
                    # Update nurse_name in handoffs
                    db.handoffs.update_many(
                        {'nurse_id': user_id},
                        {'$set': {'nurse_name': new_name}}
                    )
                    # Update assigned_nurse_name in tasks
                    db.db.tasks.update_many(
                        {'assigned_nurse_id': user_id},
                        {'$set': {'assigned_nurse_name': new_name}}
                    )
                elif role == 'doctor' and 'full_name' in update_data:
                    new_name = update_data['full_name']
                    # Update doctor_name in care plans
                    db.healthcare_db['doctor_care_plans'].update_many(
                        {'doctor_id': user_id},
                        {'$set': {'doctor_name': new_name}}
                    )
            except Exception as prop_err:
                logger.warning(f"Name propagation partial failure: {prop_err}")

            updated_user = collection.find_one({'user_id': user_id}, {'_id': 0, 'password': 0})
            for key in ['created_at', 'updated_at']:
                if key in updated_user and updated_user[key]:
                    updated_user[key] = updated_user[key].isoformat() if hasattr(updated_user[key], 'isoformat') else str(updated_user[key])
            return jsonify({'success': True, 'message': 'Profile updated', 'user': updated_user}), 200
        else:
            return jsonify({'success': True, 'message': 'No changes made'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
