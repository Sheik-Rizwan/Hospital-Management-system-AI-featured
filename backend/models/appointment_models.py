# appointment_models.py - Appointment and Doctor Schedule Models

from datetime import datetime, timedelta
from typing import Optional, Dict, List
import uuid


class Appointment:
    """Appointment model for booking doctor consultations."""
    
    @staticmethod
    def create(appointment_data: Dict) -> Dict:
        """Create a new appointment."""
        return {
            'appointment_id': appointment_data.get('appointment_id', f"APT-{uuid.uuid4().hex[:8].upper()}"),
            'patient_id': appointment_data['patient_id'],
            'patient_name': appointment_data.get('patient_name', ''),
            'doctor_id': appointment_data['doctor_id'],
            'service_id': appointment_data.get('service_id', ''),
            'service_name': appointment_data.get('service_name', ''),
            'date': appointment_data['date'],  # YYYY-MM-DD format
            'shift': appointment_data.get('shift', ''),  # Morning, Evening, etc.
            'start_time': appointment_data['start_time'],  # HH:MM format
            'end_time': appointment_data['end_time'],  # HH:MM format
            'status': appointment_data.get('status', 'pending'),
            'booked_for': appointment_data.get('booked_for', 'self'),  # self | other
            'notes': appointment_data.get('notes', ''),
            'rejection_reason': appointment_data.get('rejection_reason', ''),
            'created_by': appointment_data.get('created_by', 'patient'),
            'created_by_id': appointment_data.get('created_by_id', ''),
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(appointment_data: Dict) -> Dict:
        """Convert appointment data to dict for API response."""
        result = {
            'appointment_id': appointment_data.get('appointment_id'),
            'patient_id': appointment_data.get('patient_id'),
            'patient_name': appointment_data.get('patient_name', ''),
            'doctor_id': appointment_data.get('doctor_id'),
            'service_id': appointment_data.get('service_id', ''),
            'service_name': appointment_data.get('service_name', ''),
            'date': appointment_data.get('date'),
            'shift': appointment_data.get('shift', ''),
            'start_time': appointment_data.get('start_time'),
            'end_time': appointment_data.get('end_time'),
            'status': appointment_data.get('status'),
            'booked_for': appointment_data.get('booked_for', 'self'),
            'notes': appointment_data.get('notes', ''),
            'rejection_reason': appointment_data.get('rejection_reason', ''),
            'created_by': appointment_data.get('created_by'),
            'created_by_id': appointment_data.get('created_by_id', ''),
            'created_at': appointment_data.get('created_at').isoformat() if hasattr(appointment_data.get('created_at', ''), 'isoformat') else str(appointment_data.get('created_at', '')),
            'updated_at': appointment_data.get('updated_at').isoformat() if hasattr(appointment_data.get('updated_at', ''), 'isoformat') else str(appointment_data.get('updated_at', ''))
        }
        
        # Populated fields (joined from other collections) - only set if they exist and are non-empty
        if appointment_data.get('doctor_name'):
            result['doctor_name'] = appointment_data.get('doctor_name')
        if appointment_data.get('doctor_specialization'):
            result['doctor_specialization'] = appointment_data.get('doctor_specialization')
            
        return result


class DoctorSchedule:
    """Doctor Schedule model for defining available working hours."""
    
    DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    
    @staticmethod
    def create(schedule_data: Dict) -> Dict:
        """Create a new schedule entry."""
        return {
            'schedule_id': schedule_data.get('schedule_id', f"SCH-{uuid.uuid4().hex[:8].upper()}"),
            'doctor_id': schedule_data['doctor_id'],
            'day_of_week': schedule_data['day_of_week'],  # Monday, Tuesday, etc.
            'start_time': schedule_data['start_time'],  # HH:MM format (e.g., "09:00")
            'end_time': schedule_data['end_time'],  # HH:MM format (e.g., "17:00")
            'slot_duration': schedule_data.get('slot_duration', 30),  # Default 30 minutes
            'is_available': schedule_data.get('is_available', True),
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
    
    @staticmethod
    def to_dict(schedule_data: Dict) -> Dict:
        """Convert schedule data to dict for API response."""
        return {
            'schedule_id': schedule_data.get('schedule_id'),
            'doctor_id': schedule_data.get('doctor_id'),
            'day_of_week': schedule_data.get('day_of_week'),
            'start_time': schedule_data.get('start_time'),
            'end_time': schedule_data.get('end_time'),
            'slot_duration': schedule_data.get('slot_duration', 30),
            'is_available': schedule_data.get('is_available', True),
            'created_at': schedule_data.get('created_at'),
            'updated_at': schedule_data.get('updated_at')
        }
    
    @staticmethod
    def generate_time_slots(start_time: str, end_time: str, slot_duration: int = 30) -> List[Dict]:
        """
        Generate available time slots between start and end time.
        Handles overnight shifts (e.g. 22:00 to 07:00).
        Tags post-midnight slots with next_day=True for display context.
        """
        slots = []
        
        # Parse times
        start_hour, start_min = map(int, start_time.split(':'))
        end_hour, end_min = map(int, end_time.split(':'))
        
        base = datetime.now().replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
        current = base
        end = datetime.now().replace(hour=end_hour, minute=end_min, second=0, microsecond=0)
        
        # Handle overnight shift (end time is 'earlier' than start time)
        is_overnight = end <= current
        if is_overnight:
            end += timedelta(days=1)
        
        while current + timedelta(minutes=slot_duration) <= end:
            slot_end = current + timedelta(minutes=slot_duration)
            slots.append({
                'start': current.strftime('%H:%M'),
                'end': slot_end.strftime('%H:%M'),
                'next_day': is_overnight and current.day != base.day
            })
            current = slot_end
        
        return slots


class AppointmentLog:
    """Audit log for appointment actions (booking, approval, rejection)."""
    
    @staticmethod
    def create(log_data: Dict) -> Dict:
        """Create a new appointment log entry."""
        return {
            'log_id': f"LOG-{uuid.uuid4().hex[:8].upper()}",
            'appointment_id': log_data['appointment_id'],
            'action': log_data['action'],  # booked, approved, rejected, completed, cancelled
            'performed_by': log_data['performed_by'],  # user_id
            'performed_by_role': log_data.get('performed_by_role', 'unknown'),
            'details': log_data.get('details', ''),
            'timestamp': datetime.now()
        }
