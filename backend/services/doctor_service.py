
from mongodb_config import MongoDatabase

class DoctorService:
    """Handles Doctor-related database operations."""
    
    def __init__(self):
        self.db = MongoDatabase()

    def get_active_doctors(self):
        """Return list of all active doctors."""
        doctors = list(self.db.doctors.find({'is_active': True}, {'_id': 0, 'password': 0}))
        return [{
            'id': doc['user_id'],
            'name': doc['full_name'],
            'specialization': doc.get('specialization', 'General'),
            'department': doc.get('department', '')
        } for doc in doctors]

    def get_doctor_by_id(self, doctor_id):
        """Get specific doctor details."""
        return self.db.get_user_by_id(doctor_id)

    def get_doctor_phone(self, doctor_id):
        """Get doctor's phone number for notifications."""
        doc = self.get_doctor_by_id(doctor_id)
        return doc.get('phone') if doc else None
