# appointment_service.py — Schedule-Driven Appointment Service with Shifts

from datetime import datetime, timedelta
import calendar
from mongodb_config import MongoDatabase
from models.appointment_models import Appointment, DoctorSchedule, AppointmentLog
from logger_config import logger


class AppointmentService:
    def __init__(self):
        self.mongo = MongoDatabase()          # singleton – has .doctors, .patients, etc. (healthcare_db)
        self.db    = self.mongo.db             # nurse_handoff_db – appointments, schedules, services, logs

    # ═══════════════════════════════════════════
    #  SERVICES
    # ═══════════════════════════════════════════

    def get_dynamic_specializations(self):
        """Builds a map of dynamic service_id -> specialization from active doctors."""
        doctors = list(self.mongo.doctors.find({'is_active': True}, {'_id': 0, 'specialization': 1}))
        specs = {}
        for doc in doctors:
            spec = doc.get('specialization', '').strip()
            if not spec:
                spec = 'General'
            safe_id = f"dyn_{spec.lower().replace(' ', '_').replace('&', 'and')}"
            if safe_id not in specs:
                specs[safe_id] = spec
        return specs

    def get_services(self):
        """Get all available services dynamically based on active doctors."""
        specs = self.get_dynamic_specializations()
        services = []
        for safe_id, spec_name in sorted(specs.items(), key=lambda x: x[1]):
            services.append({
                'service_id': safe_id,
                'service_name': spec_name,
                'category': 'Consultation'
            })
        return services

    def get_service_by_id(self, service_id):
        """Get a single service by ID, supporting dynamic doctor-derived IDs."""
        if service_id and str(service_id).startswith('dyn_'):
            specs = self.get_dynamic_specializations()
            if service_id in specs:
                return {
                    'service_id': service_id,
                    'service_name': specs[service_id],
                    'category': 'Consultation'
                }
        return self.db.services.find_one({'service_id': service_id}, {'_id': 0})

    # ═══════════════════════════════════════════
    #  DOCTORS
    # ═══════════════════════════════════════════

    def get_active_doctors(self, specialization=None):
        """Get list of active doctors, optionally filtered by specialization (case-insensitive)."""
        import re as _re
        query = {'is_active': True}
        if specialization:
            # Case-insensitive match, also tolerates leading/trailing whitespace in DB
            safe = _re.escape(specialization.strip())
            query['specialization'] = {'$regex': f'^\\s*{safe}\\s*$', '$options': 'i'}
            
        doctors = list(self.mongo.doctors.find(query, {'_id': 0, 'password': 0}))
        
        # Enrich with schedule availability flag
        for doc in doctors:
            schedules = list(self.db.doctor_schedules.find({
                'doctor_id': doc['user_id'],
                'is_available': True
            }))
            doc['has_schedule'] = len(schedules) > 0
            doc['available_days'] = [s['day_of_week'] for s in schedules]
            
        return doctors

    def get_doctors_by_service(self, service_id):
        """
        Get active doctors linked to a specific service.
        Prioritizes SPECIALIZATION matching to ensure doctors appear in the correct category.
        """
        # 1. Resolve service name dynamically or from DB
        service_name = ''
        if service_id and str(service_id).startswith('dyn_'):
            specs = self.get_dynamic_specializations()
            service_name = specs.get(service_id, '')
        else:
            service = self.db.services.find_one({'service_id': service_id})
            if service:
                service_name = service.get('service_name', '')

        if not service_name:
            return []
        
        # 2. Find doctors where specialization matches the service name (case-insensitive)
        import re as _re
        safe_name = _re.escape(service_name.strip())
        query = {
            'is_active': True,
            '$or': [
                {'specialization': {'$regex': f'^\\s*{safe_name}\\s*$', '$options': 'i'}},
                {'service_id': service_id}
            ]
        }
        
        return list(self.mongo.doctors.find(query, {'_id': 0, 'password': 0}))

    def get_doctor_by_id(self, doctor_id):
        """Get specific doctor details."""
        return self.mongo.doctors.find_one(
            {'user_id': doctor_id}, 
            {'_id': 0, 'password': 0}
        )

    # ═══════════════════════════════════════════
    #  AVAILABILITY (purely schedule-driven)
    # ═══════════════════════════════════════════
    # No hardcoded day closures or holiday blocks.
    # Availability is determined entirely by doctor schedules.

    # ═══════════════════════════════════════════
    #  AVAILABLE DATES
    # ═══════════════════════════════════════════

    def get_doctor_available_dates(self, doctor_id, num_dates=7):
        """
        Get the next N available dates for a doctor.
        Purely schedule-driven — only excludes days the doctor has no schedule.
        Also includes shift info for each available date.
        """
        import calendar as cal

        # Get doctor's scheduled working days
        schedules = list(self.db.doctor_schedules.find({
            'doctor_id': doctor_id,
            'is_available': True
        }))

        if not schedules:
            return []

        # Build a map of day_of_week -> list of schedule entries
        working_days = set(s['day_of_week'] for s in schedules)
        day_schedules = {}
        for s in schedules:
            day_schedules.setdefault(s['day_of_week'], []).append(s)

        available_dates = []
        check_date = datetime.now().date() + timedelta(days=1)
        max_lookahead = 365

        for _ in range(max_lookahead):
            date_str = check_date.strftime('%Y-%m-%d')
            day_name = cal.day_name[check_date.weekday()]

            if day_name in working_days:
                # Collect shift names for this day
                shifts = []
                for sched in day_schedules.get(day_name, []):
                    shift_name = self._classify_shift(sched['start_time'])
                    shifts.append(shift_name)

                available_dates.append({
                    'date': date_str,
                    'day_name': day_name,
                    'display': check_date.strftime('%a, %b %d'),
                    'shifts': shifts
                })

            if len(available_dates) >= num_dates:
                break
            check_date += timedelta(days=1)

        return available_dates

    # ═══════════════════════════════════════════
    #  SHIFTS
    # ═══════════════════════════════════════════

    def get_available_shifts(self, doctor_id, date_str):
        """
        Get shifts that have at least one free slot on the given date.
        Returns list of dicts: [{'shift_name': 'Morning', 'start': '09:00', 'end': '12:00', 'free_slots': N}, ...]

        Uses get_shift_slots() for the free count so the number always
        matches the actual slots the user will be offered.
        """
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            day_of_week = calendar.day_name[date_obj.weekday()]
        except ValueError:
            return []

        # Get all schedules for this doctor on this day
        schedules = list(self.db.doctor_schedules.find({
            'doctor_id': doctor_id,
            'day_of_week': day_of_week,
            'is_available': True
        }))

        if not schedules:
            return []

        available_shifts = []
        for schedule in schedules:
            start_time = schedule['start_time']
            end_time = schedule['end_time']

            # Determine shift name from time range
            shift_name = self._classify_shift(start_time)

            # Use the SAME function that later lists individual slots
            # so the count is always consistent with what the user sees.
            free_slots = self.get_shift_slots(doctor_id, date_str, start_time, end_time)
            free_count = len(free_slots)

            if free_count > 0:
                available_shifts.append({
                    'shift_name': shift_name,
                    'start': start_time,
                    'end': end_time,
                    'free_slots': free_count
                })

        return available_shifts

    def _classify_shift(self, start_time):
        """Classify a shift based on start time."""
        hour = int(start_time.split(':')[0])
        if 7 <= hour < 12:
            return "Morning"
        elif 12 <= hour < 17:
            return "Afternoon"
        elif 17 <= hour < 22:
            return "Evening"
        else:
            return "Night"

    @staticmethod
    def format_time_ampm(time_str):
        """Convert 24h time string like '09:00' to '9:00 AM', '22:00' to '10:00 PM'."""
        try:
            h, m = map(int, time_str.split(':'))
            period = 'AM' if h < 12 else 'PM'
            h12 = h if h == 0 else (h if h <= 12 else h - 12)
            if h == 0:
                h12 = 12
            if m > 0:
                return f"{h12}:{m:02d} {period}"
            return f"{h12}:00 {period}"
        except Exception:
            return time_str

    # ═══════════════════════════════════════════
    #  SLOT AVAILABILITY
    # ═══════════════════════════════════════════

    def get_shift_slots(self, doctor_id, date_str, shift_start, shift_end):
        """
        Get available time slots for a specific doctor, date, and shift.
        Only returns FREE slots (not booked, not passed).
        """
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            return []

        # Find the matching schedule
        day_of_week = calendar.day_name[date_obj.weekday()]
        schedule = self.db.doctor_schedules.find_one({
            'doctor_id': doctor_id,
            'day_of_week': day_of_week,
            'start_time': shift_start,
            'end_time': shift_end,
            'is_available': True
        })

        if not schedule:
            return []

        slot_duration = schedule.get('slot_duration', 30)
        all_slots = DoctorSchedule.generate_time_slots(shift_start, shift_end, slot_duration)

        # Get booked slots
        booked = list(self.db.appointments.find({
            'doctor_id': doctor_id,
            'date': date_str,
            'status': {'$in': ['pending', 'approved', 'pending_doctor_approval', 'confirmed']}
        }))
        booked_times = {(apt['start_time'], apt['end_time']) for apt in booked}

        now = datetime.now()
        is_today = date_obj.date() == now.date()

        free_slots = []
        for slot in all_slots:
            is_booked = (slot['start'], slot['end']) in booked_times
            is_passed = False
            if is_today:
                slot_h, slot_m = map(int, slot['start'].split(':'))
                if now.replace(hour=slot_h, minute=slot_m, second=0) <= now:
                    is_passed = True
            if not is_booked and not is_passed:
                free_slots.append(slot)

        return free_slots

    def get_all_date_slots(self, doctor_id, date_str):
        """
        Get ALL available time slots for a doctor on a date across all schedule blocks.
        Collects free slots from every schedule entry and returns them sorted.
        """
        shifts = self.get_available_shifts(doctor_id, date_str)
        all_slots = []
        for s in shifts:
            block_slots = self.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
            all_slots.extend(block_slots)
        return all_slots

    def get_doctor_availability(self, doctor_id, date_str):
        """
        Get available time slots for a doctor on a specific date.
        Returns: { 'available': bool, 'slots': [], 'message': str }
        Slots include shift name and only free (unbooked + future) slots.
        """
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            day_of_week = calendar.day_name[date_obj.weekday()]
        except ValueError:
            return {'available': False, 'message': 'Invalid date format'}

        if date_obj.date() < datetime.now().date():
            return {'available': False, 'message': 'Cannot check availability in the past'}

        # Get schedules
        schedules = list(self.db.doctor_schedules.find({
            'doctor_id': doctor_id,
            'day_of_week': day_of_week,
            'is_available': True
        }))

        if not schedules:
            return {'available': False, 'message': f'Doctor not available on {day_of_week}', 'slots': []}

        # Generate slots with shift info
        all_slots = []
        for schedule in schedules:
            shift_name = self._classify_shift(schedule['start_time'])
            shift_slots = DoctorSchedule.generate_time_slots(
                schedule['start_time'],
                schedule['end_time'],
                schedule.get('slot_duration', 30)
            )
            for slot in shift_slots:
                slot['shift'] = shift_name
                slot['shift_start'] = schedule['start_time']
                slot['shift_end'] = schedule['end_time']
            all_slots.extend(shift_slots)

        # Deduplicate by start-end key, keeping shift info
        unique_map = {}
        for s in all_slots:
            key = f"{s['start']}-{s['end']}"
            if key not in unique_map:
                unique_map[key] = s

        # Chronology-aware sorting: for overnight shifts, post-midnight hours
        # (< 12) sort after pre-midnight hours (>= 18) instead of before them
        has_evening_or_night = any(int(s['start'].split(':')[0]) >= 18 for s in unique_map.values())
        def _chrono_sort_key(slot):
            h = int(slot['start'].split(':')[0])
            m = int(slot['start'].split(':')[1])
            if has_evening_or_night and h < 12:
                return (h + 24) * 60 + m
            return h * 60 + m
        all_slots = sorted(list(unique_map.values()), key=_chrono_sort_key)

        # Filter booked slots — any active status blocks the slot
        booked = list(self.db.appointments.find({
            'doctor_id': doctor_id,
            'date': date_str,
            'status': {'$in': ['pending', 'approved', 'pending_doctor_approval', 'confirmed']}
        }))
        booked_times = {(apt['start_time'], apt['end_time']) for apt in booked}

        final_slots = []
        now = datetime.now()
        is_today = date_obj.date() == now.date()

        for slot in all_slots:
            is_booked = (slot['start'], slot['end']) in booked_times
            is_passed = False
            if is_today:
                slot_h, slot_m = map(int, slot['start'].split(':'))
                slot_time = now.replace(hour=slot_h, minute=slot_m, second=0)
                if slot_time <= now:
                    is_passed = True

            final_slots.append({
                'start': slot['start'],
                'end': slot['end'],
                'shift': slot.get('shift', ''),
                'is_booked': is_booked,
                'is_passed': is_passed,
                'available': not is_booked and not is_passed
            })

        return {
            'available': True,
            'date': date_str,
            'day_of_week': day_of_week,
            'slots': final_slots
        }

    # ═══════════════════════════════════════════
    #  BOOKING
    # ═══════════════════════════════════════════

    def book_appointment(self, appointment_data):
        """
        Book an appointment.
        Expected keys: patient_id, doctor_id, date, start_time, end_time, created_by
        Validates: (1) time falls within doctor's schedule, (2) slot not already booked.
        """
        doctor_id = appointment_data['doctor_id']
        date_str = appointment_data['date']
        start_time = appointment_data['start_time']

        # ── Validate: time must be within a valid schedule slot ──
        shifts = self.get_available_shifts(doctor_id, date_str)
        if not shifts:
            raise ValueError(f"Doctor has no available shifts on {date_str}")

        # Check if start_time falls within ANY shift's actual slots
        valid_slot = False
        slot_end_time = None
        for s in shifts:
            slots = self.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
            for slot in slots:
                if slot['start'] == start_time:
                    valid_slot = True
                    slot_end_time = slot['end']
                    break
            if valid_slot:
                break

        if not valid_slot:
            all_free = []
            for s in shifts:
                slots = self.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                all_free.extend(slot['start'] for slot in slots)
            raise ValueError(
                f"Time {start_time} is not within the doctor's schedule on {date_str}. "
                f"Available times: {', '.join(all_free[:8])}"
            )

        # Auto-fix end_time if missing or incorrect
        if not appointment_data.get('end_time') and slot_end_time:
            appointment_data['end_time'] = slot_end_time

        # ── Double check availability (concurrency) — block ALL active statuses ──
        existing = self.db.appointments.find_one({
            'doctor_id': appointment_data['doctor_id'],
            'date': appointment_data['date'],
            'start_time': appointment_data['start_time'],
            'status': {'$in': ['pending', 'approved', 'pending_doctor_approval', 'confirmed']}
        })

        if existing:
            raise ValueError("Time slot already booked")

        # Set default status
        if 'status' not in appointment_data:
            appointment_data['status'] = 'pending_doctor_approval'

        # Create model
        new_appt = Appointment.create(appointment_data)
        result = self.db.appointments.insert_one(new_appt)
        new_appt.pop('_id', None)  # Remove MongoDB ObjectId (not JSON serializable)
        
        # Create Log
        self.log_action(
            new_appt['appointment_id'], 
            'booked_pending_approval', 
            appointment_data['created_by_id'],
            appointment_data['created_by'],
            f"Booked via {appointment_data['created_by']}, waiting for approval"
        )
        
        return new_appt

    def approve_appointment(self, appointment_id, approved_by_id):
        """Approve an appointment."""
        result = self.db.appointments.update_one(
            {'appointment_id': appointment_id},
            {
                '$set': {
                    'status': 'confirmed',
                    'updated_at': datetime.now()
                }
            }
        )
        
        if result.modified_count > 0:
            self.log_action(appointment_id, 'approved', approved_by_id, 'doctor', 'Appointment confirmed')
            return True
        return False

    def reject_appointment(self, appointment_id, rejected_by_id, reason=""):
        """Reject an appointment."""
        result = self.db.appointments.update_one(
            {'appointment_id': appointment_id},
            {
                '$set': {
                    'status': 'rejected',
                    'updated_at': datetime.now(),
                    'rejection_reason': reason
                }
            }
        )
        
        if result.modified_count > 0:
            self.log_action(appointment_id, 'rejected', rejected_by_id, 'doctor', f'Rejected: {reason}')
            return True
        return False

    def cancel_appointment(self, appointment_id, user_id, role, reason="User requested cancellation"):
        """Cancel an appointment."""
        appt = self.db.appointments.find_one({'appointment_id': appointment_id})
        if not appt:
            raise ValueError("Appointment not found")

        # Allow cancellation for pending, approved, confirmed types
        if appt['status'] not in ['pending', 'approved', 'pending_doctor_approval', 'confirmed']:
            raise ValueError(f"Cannot cancel appointment with status {appt['status']}")

        self.db.appointments.update_one(
            {'appointment_id': appointment_id},
            {'$set': {'status': 'cancelled', 'updated_at': datetime.now(), 'rejection_reason': reason}}
        )

        self.log_action(appointment_id, 'cancelled', user_id, role, reason)
        
        # Notify doctor dashboard in real-time
        from services.socket_service import notify_appointment_status_update
        try:
            notify_appointment_status_update(appt['doctor_id'], appointment_id, 'cancelled')
        except Exception as e:
            from logger_config import logger
            logger.warning(f"Socket cancellation notify failed (non-critical): {e}")
            
        return True

    def get_patient_appointments(self, patient_id):
        """Get history for a patient — future appointments only."""
        today = datetime.now().strftime('%Y-%m-%d')
        appts = list(self.db.appointments.find({
            'patient_id': patient_id,
            'date': {'$gte': today}
        }).sort('date', 1))
        
        # Enrich with doctor info from doctors collection (healthcare_db)
        for apt in appts:
            doc = self.mongo.doctors.find_one({'user_id': apt['doctor_id']})
            if doc:
                apt['doctor_name'] = doc.get('full_name', '')
                apt['doctor_specialization'] = doc.get('specialization', '')
                
        return [Appointment.to_dict(a) for a in appts]

    # ═══════════════════════════════════════════
    #  SPOKEN FORMATS (for voice/Sarvam integration)
    # ═══════════════════════════════════════════

    @staticmethod
    def _time_to_spoken(time_str):
        """Convert 24h time string like '09:00' to spoken form like '9 AM'."""
        try:
            h, m = map(int, time_str.split(':'))
            period = 'AM' if h < 12 else 'PM'
            spoken_h = h if h <= 12 else h - 12
            if spoken_h == 0:
                spoken_h = 12
            if m > 0:
                return f"{spoken_h}:{m:02d} {period}"
            return f"{spoken_h} {period}"
        except Exception:
            return time_str

    def get_spoken_shifts(self, doctor_id, date_str):
        """
        Get shift data formatted as natural spoken text.
        Returns (spoken_string, raw_shifts_list) tuple.
        E.g. "Doctor Sharma is available on Monday. He has a morning shift from 9 AM to 1 PM..."
        """
        shifts = self.get_available_shifts(doctor_id, date_str)
        if not shifts:
            return None, []

        doctor = self.get_doctor_by_id(doctor_id)
        doc_name = doctor.get('full_name', 'the doctor') if doctor else 'the doctor'

        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            day_name = date_obj.strftime('%A')
        except ValueError:
            day_name = date_str

        shift_parts = []
        for s in shifts:
            name = s.get('shift_name', '').lower()
            start = self._time_to_spoken(s.get('start', ''))
            end = self._time_to_spoken(s.get('end', ''))
            slots = s.get('free_slots', 0)
            shift_parts.append(
                f"{name} shift from {start} to {end} with {slots} available slots"
            )

        if len(shift_parts) == 1:
            shifts_text = f"a {shift_parts[0]}"
        elif len(shift_parts) == 2:
            shifts_text = f"a {shift_parts[0]}, and a {shift_parts[1]}"
        else:
            shifts_text = 'shifts: ' + ', '.join(shift_parts[:-1]) + f", and {shift_parts[-1]}"

        spoken = f"Doctor {doc_name} is available on {day_name}. There is {shifts_text}. Which shift would you prefer?"
        return spoken, shifts

    def get_spoken_slots(self, doctor_id, date_str, shift_start, shift_end, shift_name=''):
        """
        Get time slots formatted as natural spoken text.
        Returns (spoken_string, raw_slots_list) tuple.
        E.g. "In the morning shift, slots are at 9, 9:30, 10, and 10:30 AM."
        """
        slots = self.get_shift_slots(doctor_id, date_str, shift_start, shift_end)
        if not slots:
            return "There are no available slots in this shift right now.", []

        slot_times = []
        for s in slots[:8]:  # Limit for speech
            h, m = map(int, s['start'].split(':'))
            if m > 0:
                slot_times.append(f"{h if h <= 12 else h - 12}:{m:02d}")
            else:
                slot_times.append(f"{h if h <= 12 else h - 12}")

        # Determine AM/PM
        first_h = int(slots[0]['start'].split(':')[0])
        period = 'AM' if first_h < 12 else 'PM'

        if len(slot_times) == 1:
            times_str = slot_times[0]
        elif len(slot_times) == 2:
            times_str = f"{slot_times[0]} and {slot_times[1]}"
        else:
            times_str = ', '.join(slot_times[:-1]) + f", and {slot_times[-1]}"

        prefix = f"In the {shift_name.lower()} shift, " if shift_name else ""
        spoken = f"{prefix}available slots are at {times_str} {period}. What time works for you?"
        return spoken, slots

    def log_action(self, appt_id, action, user_id, role, details):
        """Helper to log appointment actions."""
        try:
            log_entry = AppointmentLog.create({
                'appointment_id': appt_id,
                'action': action,
                'performed_by': user_id,
                'performed_by_role': role,
                'details': details
            })
            self.db.appointment_logs.insert_one(log_entry)
        except Exception as e:
            logger.error(f"Failed to log appointment action: {e}")
