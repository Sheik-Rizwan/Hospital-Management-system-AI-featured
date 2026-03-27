"""
setup_admin.py - Create default Super Admin and test Doctor accounts
Run this once to initialize admin accounts in the database.
"""

from mongodb_config import MongoDatabase
from models.user_models import SuperAdmin, Doctor
import sys

def setup_default_accounts():
    """Create default Super Admin and Doctor accounts."""
    try:
        db = MongoDatabase()
        print(" Connected to database")
        
        # Default Super Admin credentials
        admin_email = "admin@hospital.com"
        admin_password = "admin123"
        
        # Check if admin already exists
        existing_admin = db.admins.find_one({'email': admin_email})
        if existing_admin:
            print(f"️ Super Admin already exists: {admin_email}")
        else:
            admin_data = {
                'user_id': 'admin_001',
                'email': admin_email,
                'password': admin_password,
                'full_name': 'System Administrator',
                'phone': ''
            }
            admin = SuperAdmin.create(admin_data)
            db.create_user(admin)
            print(f" Super Admin created: {admin_email} / {admin_password}")
        
        # Default Doctor credentials
        doctor_email = "doctor@hospital.com"
        doctor_password = "doctor123"
        
        # Check if doctor already exists
        existing_doctor = db.doctors.find_one({'email': doctor_email})
        if existing_doctor:
            print(f"️ Doctor already exists: {doctor_email}")
        else:
            doctor_data = {
                'user_id': 'doctor_001',
                'email': doctor_email,
                'password': doctor_password,
                'full_name': 'Dr. John Smith',
                'specialization': 'General Medicine',
                'license_number': 'MD12345',
                'department': 'Internal Medicine',
                'phone': ''
            }
            doctor = Doctor.create(doctor_data)
            db.create_user(doctor)
            print(f" Doctor created: {doctor_email} / {doctor_password}")
        
        print("\n" + "="*50)
        print("DEFAULT CREDENTIALS:")
        print("="*50)
        print(f"Super Admin: {admin_email} / {admin_password}")
        print(f"Doctor:      {doctor_email} / {doctor_password}")
        print("="*50)
        
        return True
        
    except Exception as e:
        print(f" Error: {e}")
        return False


if __name__ == '__main__':
    success = setup_default_accounts()
    sys.exit(0 if success else 1)
