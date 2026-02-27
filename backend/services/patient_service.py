
from mongodb_config import MongoDatabase
from models.user_models import Patient
import uuid
from datetime import datetime

class PatientService:
    """
    Handles Patient-related database operations.
    """
    def __init__(self):
        self.db = MongoDatabase()

    def get_patient_by_phone(self, phone):
        """Find a patient by their phone number (WhatsApp ID)."""
        # Phone numbers in WhatsApp usually come as '919999999999'
        # WhatsApp patients are stored in healthcare_db.patient_details
        return self.db.patients.find_one({'phone': phone})

    def is_registered(self, phone):
        """Check if a phone number is registered."""
        return self.get_patient_by_phone(phone) is not None

    def create_patient_from_whatsapp(self, phone, name, age=None, gender=None):
        """
        Create a new patient record from WhatsApp registration.
        Generates a temporary ID and a random password.
        """
        import string
        import random
        # Generate a simple patient ID
        # Generate patient ID (Use wa_<phone> for WhatsApp users to ensure uniqueness & ease of lookup)
        clean_phone = phone.replace('+', '').replace(' ', '')
        patient_id = f"wa_{clean_phone}"
        
        # Create user_id
        user_id = f"patient_{patient_id}"
        
        # Generate a random 6-character password instead of hardcoded
        generated_password = ''.join(random.choices(string.ascii_letters + string.digits, k=6))
        
        # Create minimal patient data
        patient_data = {
            'user_id': user_id,
            'patient_id': patient_id,
            'patient_name': name,
            'phone': phone,
            'password': generated_password,
            'date_of_birth': self._estimate_dob(age) if age else '2000-01-01',
            'gender': gender or 'Unknown',
            'created_via': 'whatsapp'
        }
        
        # Use the Model to ensure strict validation, which securely hashes the plain text password
        db_patient = Patient.create(patient_data)
        
        self.db.add_patient(db_patient)
        
        # Return both the db patient and the generated plaintext password
        return db_patient, generated_password

    def _estimate_dob(self, age):
        """Estimate DOB from age."""
        try:
            year = datetime.now().year - int(age)
            return f"{year}-01-01"
        except:
            return "2000-01-01"
