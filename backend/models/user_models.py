# models.py - User Models

from datetime import datetime, timedelta
from typing import Optional, Dict
import bcrypt

class User:
    """Base user model with password hashing"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password for storing."""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    @staticmethod
    def check_password(hashed_password: str, password: str) -> bool:
        """Check hashed password against plain password."""
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))


class SuperAdmin:
    """Super Admin user model - full system access"""
    
    @staticmethod
    def create(admin_data: Dict) -> Dict:
        """Create a new super admin user."""
        return {
            'user_id': admin_data['user_id'],
            'email': admin_data['email'].lower(),
            'password': User.hash_password(admin_data['password']),
            'full_name': admin_data['full_name'],
            'role': 'super_admin',
            'phone': admin_data.get('phone', ''),
            'created_at': datetime.now(),
            'is_active': True
        }
    
    @staticmethod
    def to_dict(admin_data: Dict) -> Dict:
        """Convert admin data to dict without password."""
        return {
            'user_id': admin_data['user_id'],
            'email': admin_data['email'],
            'full_name': admin_data['full_name'],
            'role': admin_data['role'],
            'phone': admin_data.get('phone', ''),
            'is_active': admin_data.get('is_active', True),
            'created_at': admin_data.get('created_at', None)
        }


class Doctor:
    """Doctor user model - can create care plans and assign tasks"""
    
    @staticmethod
    def create(doctor_data: Dict) -> Dict:
        """Create a new doctor user."""
        return {
            'user_id': doctor_data['user_id'],
            'email': doctor_data['email'].lower(),
            'password': User.hash_password(doctor_data['password']),
            'full_name': doctor_data['full_name'],
            'role': 'doctor',
            'specialization': doctor_data.get('specialization', ''),
            'license_number': doctor_data.get('license_number', ''),
            'department': doctor_data.get('department', ''),
            'phone': doctor_data.get('phone', ''),
            'created_at': datetime.now(),
            'is_active': True
        }
    
    @staticmethod
    def to_dict(doctor_data: Dict) -> Dict:
        """Convert doctor data to dict without password."""
        return {
            'user_id': doctor_data['user_id'],
            'email': doctor_data['email'],
            'full_name': doctor_data['full_name'],
            'role': doctor_data['role'],
            'specialization': doctor_data.get('specialization', ''),
            'license_number': doctor_data.get('license_number', ''),
            'department': doctor_data.get('department', ''),
            'phone': doctor_data.get('phone', ''),
            'is_active': doctor_data.get('is_active', True),
            'created_at': doctor_data.get('created_at', None)
        }


class Nurse:
    """Nurse user model"""
    
    @staticmethod
    def create(nurse_data: Dict) -> Dict:
        """Create a new nurse user."""
        return {
            'user_id': nurse_data['user_id'],
            'email': nurse_data['email'].lower(),
            'password': User.hash_password(nurse_data['password']),
            'full_name': nurse_data['full_name'],
            'role': 'nurse',
            'department': nurse_data.get('department', ''),
            'employee_id': nurse_data.get('employee_id', ''),
            'phone': nurse_data.get('phone', ''),
            'shift': nurse_data.get('shift', 'Day'),  # Day, Evening, Night
            'status': nurse_data.get('status', 'online'), # online, offline, emergency
            'is_available': True,  # For task assignment
            'current_workload': 0,  # Number of active tasks
            'assigned_beds': nurse_data.get('assigned_beds', []),
            'created_at': datetime.now(),
            'is_active': True
        }
    
    @staticmethod
    def to_dict(nurse_data: Dict) -> Dict:
        """Convert nurse data to dict without password."""
        return {
            'user_id': nurse_data['user_id'],
            'email': nurse_data['email'],
            'full_name': nurse_data['full_name'],
            'role': nurse_data['role'],
            'department': nurse_data.get('department', ''),
            'employee_id': nurse_data.get('employee_id', ''),
            'phone': nurse_data.get('phone', ''),
            'shift': nurse_data.get('shift', 'Day'),
            'status': nurse_data.get('status', 'online'),
            'is_available': nurse_data.get('is_available', True),
            'current_workload': nurse_data.get('current_workload', 0),
            'assigned_beds': nurse_data.get('assigned_beds', []),
            'is_active': nurse_data.get('is_active', True),
            'created_at': nurse_data.get('created_at', None)
        }


class Patient:
    """Patient user model"""
    
    @staticmethod
    def create(patient_data: Dict) -> Dict:
        """Create a new patient user."""
        # Use None for empty email so sparse unique index works
        email = patient_data.get('email', '').strip()
        email = email.lower() if email else None
        
        patient_doc = {
            'user_id': patient_data['user_id'],
            'password': User.hash_password(patient_data['password']),
            'patient_id': patient_data['patient_id'],
            'patient_name': patient_data['patient_name'],
            'role': 'patient',
            'date_of_birth': patient_data['date_of_birth'],
            'bed_number': patient_data.get('bed_number', ''),
            'gender': patient_data['gender'],
            'phone': patient_data.get('phone', ''),
            'created_at': datetime.now(),
            'is_active': True,
            'created_by_nurse': patient_data.get('created_by_nurse', None),
            'assigned_doctor': patient_data.get('assigned_doctor', None)
        }
        
        # Add email only if it exists (for sparse unique index)
        if email:
            patient_doc['email'] = email
            
        return patient_doc
    
    @staticmethod
    def to_dict(patient_data: Dict) -> Dict:
        """Convert patient data to dict without password."""
        return {
            'user_id': patient_data['user_id'],
            'email': patient_data.get('email', ''),
            'patient_id': patient_data['patient_id'],
            'patient_name': patient_data['patient_name'],
            'role': patient_data['role'],
            'date_of_birth': patient_data.get('date_of_birth', ''),
            'bed_number': patient_data.get('bed_number', ''),
            'gender': patient_data.get('gender', ''),
            'phone': patient_data.get('phone', ''),
            'is_active': patient_data.get('is_active', True),
            'created_at': patient_data.get('created_at', None),
            'assigned_doctor': patient_data.get('assigned_doctor', None)
        }


class CarePlan:
    """Care Plan model - defines patient care schedule"""
    
    @staticmethod
    def create(plan_data: Dict) -> Dict:
        """Create a new care plan."""
        return {
            'plan_id': plan_data['plan_id'],
            'patient_id': plan_data['patient_id'],
            'doctor_id': plan_data['doctor_id'],
            'doctor_name': plan_data.get('doctor_name', ''),
            'start_date': plan_data.get('start_date', datetime.now().isoformat()),
            'end_date': plan_data.get('end_date', (datetime.now() + timedelta(days=7)).isoformat()),
            'medications': plan_data.get('medications', []),  # [{name, dose, time, frequency}]
            'meals': plan_data.get('meals', {
                'morning': '',
                'afternoon': '',
                'night': ''
            }),
            'bathing': plan_data.get('bathing', {
                'time': '',
                'instructions': ''
            }),
            'vitals': plan_data.get('vitals', []),  # [{name, frequency, times}]
            'procedures': plan_data.get('procedures', []),  # [{name, scheduled_time, notes}]
            'injections': plan_data.get('injections', []),  # [{name, dose, time}]
            'special_instructions': plan_data.get('special_instructions', ''),
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'is_active': True
        }
    
    @staticmethod
    def to_dict(plan_data: Dict) -> Dict:
        """Convert care plan data to dict."""
        return {
            'plan_id': plan_data['plan_id'],
            'patient_id': plan_data['patient_id'],
            'doctor_id': plan_data['doctor_id'],
            'doctor_name': plan_data.get('doctor_name', ''),
            'start_date': plan_data.get('start_date'),
            'end_date': plan_data.get('end_date'),
            'medications': plan_data.get('medications', []),
            'meals': plan_data.get('meals', {}),
            'bathing': plan_data.get('bathing', {}),
            'vitals': plan_data.get('vitals', []),
            'procedures': plan_data.get('procedures', []),
            'injections': plan_data.get('injections', []),
            'special_instructions': plan_data.get('special_instructions', ''),
            'created_at': plan_data.get('created_at', None),
            'updated_at': plan_data.get('updated_at', None),
            'is_active': plan_data.get('is_active', True)
        }


class Task:
    """Task model - individual care tasks for nurses"""
    
    @staticmethod
    def create(task_data: Dict) -> Dict:
        """Create a new task."""
        return {
            'task_id': task_data['task_id'],
            'patient_id': task_data['patient_id'],
            'patient_name': task_data.get('patient_name', ''),
            'doctor_id': task_data.get('doctor_id', None),
            'plan_id': task_data.get('plan_id', None),
            'task_type': task_data['task_type'],  # medication, meal, bathing, injection, observation
            'title': task_data.get('title', task_data.get('description', '')),
            'description': task_data['description'],
            'scheduled_time': task_data['scheduled_time'],
            'shift': task_data.get('shift', 'day'),  # day, afternoon, night
            # Schedule for multi-day medication tasks
            'schedule': task_data.get('schedule', {
                'days': [],  # ['day', 'afternoon', 'night']
                'start_date': None,
                'end_date': None,
                'times': {
                    'day': '09:00',
                    'afternoon': '14:00',
                    'night': '21:00'
                }
            }),
            'assigned_nurse_id': task_data.get('assigned_nurse_id', None),
            'assigned_nurse_name': task_data.get('assigned_nurse_name', None),
            'status': task_data.get('status', 'pending'),  # pending, completed, reassigned, unassigned
            'priority': task_data.get('priority', 'normal'),  # low, normal, high, urgent
            'notes': task_data.get('notes', ''),
            'rejected': task_data.get('rejected', False),  # True if nurse rejected this task
            'due_at': task_data.get('due_at', None),  # ISO date when task is due
            'completed_at': None,
            'completed_by': None,
            'reassignment_history': [],  # [{from_nurse, to_nurse, reason, timestamp}]
            'reassigned': False,
            'created_at': datetime.now(),
            'created_by': task_data.get('created_by', 'system')
        }
    
    @staticmethod
    def to_dict(task_data: Dict) -> Dict:
        """Convert task data to dict."""
        return {
            'task_id': task_data['task_id'],
            'patient_id': task_data['patient_id'],
            'patient_name': task_data.get('patient_name', ''),
            'doctor_id': task_data.get('doctor_id'),
            'plan_id': task_data.get('plan_id', None),
            'task_type': task_data['task_type'],
            'title': task_data.get('title', task_data.get('description', '')),
            'description': task_data['description'],
            'scheduled_time': task_data['scheduled_time'],
            'shift': task_data.get('shift', 'day'),
            'schedule': task_data.get('schedule', {}),
            'assigned_nurse_id': task_data.get('assigned_nurse_id'),
            'assigned_nurse_name': task_data.get('assigned_nurse_name'),
            'status': task_data.get('status', 'pending'),
            'priority': task_data.get('priority', 'normal'),
            'notes': task_data.get('notes', ''),
            'rejected': task_data.get('rejected', False),
            'due_at': task_data.get('due_at'),
            'completed_at': task_data.get('completed_at'),
            'completed_by': task_data.get('completed_by'),
            'reassignment_history': task_data.get('reassignment_history', []),
            'created_at': task_data.get('created_at', None),
            'created_by': task_data.get('created_by', 'system')
        }


class TaskEvent:
    """TaskEvent model - audit log for task actions (rejections, reassignments, completions)"""
    
    @staticmethod
    def create(event_data: Dict) -> Dict:
        """Create a new task event."""
        return {
            'event_id': event_data.get('event_id', ''),
            'task_id': event_data['task_id'],
            'event': event_data['event'],  # rejected, reassigned, completed, created
            'by': event_data['by'],  # user_id of who performed the action
            'by_name': event_data.get('by_name', ''),
            'timestamp': event_data.get('timestamp', datetime.now()),
            'reason': event_data.get('reason', ''),
            'details': event_data.get('details', {})  # Additional event-specific data
        }
    
    @staticmethod
    def to_dict(event_data: Dict) -> Dict:
        """Convert task event to dict."""
        return {
            'event_id': event_data.get('event_id', ''),
            'task_id': event_data['task_id'],
            'event': event_data['event'],
            'by': event_data['by'],
            'by_name': event_data.get('by_name', ''),
            'timestamp': event_data.get('timestamp'),
            'reason': event_data.get('reason', ''),
            'details': event_data.get('details', {})
        }


class Meal:
    """Meal model - separate from tasks for meal management"""
    
    @staticmethod
    def create(meal_data: Dict) -> Dict:
        """Create a new meal entry."""
        return {
            'meal_id': meal_data['meal_id'],
            'patient_id': meal_data['patient_id'],
            'patient_name': meal_data.get('patient_name', ''),
            'doctor_id': meal_data.get('doctor_id', None),
            'day': meal_data['day'],  # YYYY-MM-DD
            'type': meal_data['type'],  # breakfast, lunch, dinner
            'menu': meal_data.get('menu', ''),
            'dietary_restrictions': meal_data.get('dietary_restrictions', []),
            'assigned_to': meal_data.get('assigned_to', None),  # nurse_id
            'assigned_nurse_name': meal_data.get('assigned_nurse_name', None),
            'status': meal_data.get('status', 'pending'),  # pending, served, skipped
            'notes': meal_data.get('notes', ''),
            'created_at': datetime.now(),
            'served_at': None
        }
    
    @staticmethod
    def to_dict(meal_data: Dict) -> Dict:
        """Convert meal to dict."""
        return {
            'meal_id': meal_data['meal_id'],
            'patient_id': meal_data['patient_id'],
            'patient_name': meal_data.get('patient_name', ''),
            'doctor_id': meal_data.get('doctor_id'),
            'day': meal_data['day'],
            'type': meal_data['type'],
            'menu': meal_data.get('menu', ''),
            'dietary_restrictions': meal_data.get('dietary_restrictions', []),
            'assigned_to': meal_data.get('assigned_to'),
            'assigned_nurse_name': meal_data.get('assigned_nurse_name'),
            'status': meal_data.get('status', 'pending'),
            'notes': meal_data.get('notes', ''),
            'created_at': meal_data.get('created_at'),
            'served_at': meal_data.get('served_at')
        }