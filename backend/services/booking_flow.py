# booking_flow.py — Smart WhatsApp Booking Engine
# Deterministic state machine with zero LLM hallucination for appointments.
#
# Architecture:
#   1. Intent Classifier   (regex/keyword — no LLM)
#   2. Entity Extractor    (date, doctor, specialty, timeslot — regex + fuzzy)
#   3. State Machine       (IDLE → … → BOOKED)
#   4. Query Handlers      (doctor list, shift info, slot info — read-only)
#
# All appointment data comes from the database. LLM is only used
# for general conversation (greetings, FAQs) — never for booking data.

import re
from datetime import datetime, timedelta
from logger_config import logger

# ═══════════════════════════════════════════
#  CONSTANTS
# ═══════════════════════════════════════════

# Booking flow states (stored in session under 'booking_state')
BK_IDLE             = 'BK_IDLE'
BK_COLLECT_DOCTOR   = 'BK_COLLECT_DOCTOR'      # waiting for doctor choice
BK_COLLECT_DATE     = 'BK_COLLECT_DATE'         # waiting for date
BK_COLLECT_SHIFT    = 'BK_COLLECT_SHIFT'        # waiting for shift (if >1)
BK_SHOW_SLOTS       = 'BK_SHOW_SLOTS'           # showing slots, waiting for pick
BK_COLLECT_NAME     = 'BK_COLLECT_NAME'         # asking patient name (new or other)


# ── Intent Detection ──────────────────────

INTENT_BOOK         = 'BOOK_APPOINTMENT'
INTENT_QUERY_SLOTS  = 'QUERY_SLOTS'
INTENT_QUERY_DOCS   = 'QUERY_DOCTORS'
INTENT_QUERY_SHIFT  = 'QUERY_DOCTOR_SHIFT'
INTENT_NONE         = 'NONE'

# Keyword patterns for intent detection
_BOOK_KEYWORDS = [
    r'\bbook\b', r'\bappointment\b', r'\bschedule\b', r'\bfix\s+appointment\b',
    r'\bneed\s+(a\s+)?doctor\b', r'\bwant\s+(to\s+)?see\b', r'\bconsult\b',
]
_SLOT_KEYWORDS = [
    r'\bslots?\b', r'\bavailab', r'\btimings?\b', r'\bfree\s+slots?\b',
    r'\bhow\s+many\s+slots?\b', r'\bwhat\s+time\b',
]
_DOC_KEYWORDS = [
    r'\bwhich\s+doctors?\b', r'\bdoctors?\s+available\b', r'\bwho\s+is\s+available\b',
    r'\blist\s+doctors?\b', r'\bdoctors?\s+in\b', r'\bshow\s+(me\s+)?doctors?\b',
]
_SHIFT_KEYWORDS = [
    r'\bshift\b', r'\bwhen\s+is\s+dr\b', r'\bdoctor\s+timing\b',
    r'\bmorning\s+shift\b', r'\bevening\s+shift\b', r'\bwork(ing)?\s+hours?\b',
    r'\bwhat\s+time\s+does\b.*\bwork\b',
]

# Specialty aliases — maps common words to canonical specialty names
SPECIALTY_ALIASES = {
    # Cardiology
    'cardiology': 'Cardiology', 'cardiologist': 'Cardiology', 'heart': 'Cardiology',
    'cardiac': 'Cardiology',
    # Orthopedics
    'orthopedics': 'Orthopedics', 'orthopaedics': 'Orthopedics', 'ortho': 'Orthopedics',
    'bone': 'Orthopedics', 'joint': 'Orthopedics', 'fracture': 'Orthopedics',
    # Dermatology
    'dermatology': 'Dermatology', 'dermatologist': 'Dermatology', 'skin': 'Dermatology',
    # Neurology
    'neurology': 'Neurology', 'neurologist': 'Neurology', 'brain': 'Neurology',
    'nerve': 'Neurology',
    # Pediatrics
    'pediatrics': 'Pediatrics', 'paediatrics': 'Pediatrics', 'pediatrician': 'Pediatrics',
    'child': 'Pediatrics', 'kids': 'Pediatrics', 'baby': 'Pediatrics',
    # ENT
    'ent': 'ENT', 'ear': 'ENT', 'nose': 'ENT', 'throat': 'ENT',
    # Dentistry
    'dentistry': 'Dentistry', 'dentist': 'Dentistry', 'dental': 'Dentistry',
    'teeth': 'Dentistry', 'tooth': 'Dentistry',
    # General Medicine
    'general medicine': 'General Medicine',
    'gp': 'General Medicine', 'fever': 'General Medicine', 'cold': 'General Medicine',
    # General Consultation
    'general': 'General Consultation', 'general consultation': 'General Consultation',
    'general consultancy': 'General Consultation', 'consultation': 'General Consultation',
    # Gynecology
    'gynecology': 'Gynecology', 'gynaecology': 'Gynecology', 'gynecologist': 'Gynecology',
    # Ophthalmology
    'ophthalmology': 'Ophthalmology', 'eye': 'Ophthalmology', 'eyes': 'Ophthalmology',
    'vision': 'Ophthalmology',
    # Urology
    'urology': 'Urology', 'urologist': 'Urology',
    # Psychiatry
    'psychiatry': 'Psychiatry', 'mental': 'Psychiatry', 'psychology': 'Psychiatry',
}


# ═══════════════════════════════════════════
#  SMART BOOKING ENGINE
# ═══════════════════════════════════════════

class SmartBookingEngine:
    """
    Deterministic booking engine for WhatsApp.

    Usage from whatsapp_service.py:
        engine = SmartBookingEngine(appt_service, patient_service, notifier)
        handled = engine.try_handle(sender_id, message_text, session)
        if handled:
            return  # engine handled it (booking or query)
        # else: fall through to LLM / menu
    """

    def __init__(self, appt_service, patient_service, notifier, session_manager):
        """
        Args:
            appt_service:    AppointmentService instance
            patient_service: PatientService instance
            notifier:        NotificationService instance
            session_manager: object with get_session(sid) and transition_to(sid, state, data) methods
        """
        self.appt = appt_service
        self.patient = patient_service
        self.notify = notifier
        self.sm = session_manager  # session manager (wraps _get_session / _transition_to)

    # ───────────────────────────────────────
    #  PUBLIC API
    # ───────────────────────────────────────

    def try_handle(self, sender_id, text, session):
        """
        Attempt to handle the message through the booking engine.
        Returns True if handled, False if it should fall through to LLM/menu.
        """
        data = session.get('data', {})
        bk_state = data.get('booking_state', BK_IDLE)

        # ── If already in a booking flow, continue it ──
        if bk_state != BK_IDLE:
            self._continue_flow(sender_id, text, data, bk_state)
            return True

        # ── Detect intent from fresh message ──
        intent = self._classify_intent(text)
        entities = self._extract_entities(text)

        if intent == INTENT_BOOK:
            self._start_booking(sender_id, text, entities, data)
            return True
        elif intent == INTENT_QUERY_DOCS:
            self._handle_query_doctors(sender_id, text, entities)
            return True
        elif intent == INTENT_QUERY_SLOTS:
            self._handle_query_slots(sender_id, text, entities)
            return True
        elif intent == INTENT_QUERY_SHIFT:
            self._handle_query_shift(sender_id, text, entities)
            return True

        return False  # Not a booking/query — let LLM handle

    # ───────────────────────────────────────
    #  INTENT CLASSIFIER
    # ───────────────────────────────────────

    def _classify_intent(self, text):
        """Classify user intent using keyword patterns. No LLM."""
        t = text.lower()

        # Check booking first (highest priority)
        if any(re.search(p, t) for p in _BOOK_KEYWORDS):
            return INTENT_BOOK

        # Check doctor queries BEFORE slot queries
        # ("doctors available" should be QUERY_DOCTORS, not QUERY_SLOTS)
        if any(re.search(p, t) for p in _DOC_KEYWORDS):
            return INTENT_QUERY_DOCS

        # Check shift queries
        if any(re.search(p, t) for p in _SHIFT_KEYWORDS):
            return INTENT_QUERY_SHIFT

        # Check slot queries last
        if any(re.search(p, t) for p in _SLOT_KEYWORDS):
            return INTENT_QUERY_SLOTS

        return INTENT_NONE

    # ───────────────────────────────────────
    #  ENTITY EXTRACTOR
    # ───────────────────────────────────────

    def _extract_entities(self, text):
        """
        Extract structured entities from natural language.
        Returns dict: { doctor_name, specialty, date, time_slot }
        All values are None if not found.
        """
        t = text.lower()
        entities = {
            'doctor_name': None,
            'specialty': None,
            'date': None,
            'time_slot': None,
        }

        # ── Doctor name ──
        # Pattern: "Dr. <Name>", "Doctor <Name>", capture only name words (not prepositions)
        doc_match = re.search(
            r'(?:dr\.?\s*|doctor\s+)([a-zA-Z]+)',
            t, re.IGNORECASE
        )
        if not doc_match:
            # "with <Name>" — only capture one word to avoid grabbing prepositions
            doc_match = re.search(
                r'\bwith\s+([a-zA-Z]+)',
                t, re.IGNORECASE
            )
        if doc_match:
            name_candidate = doc_match.group(1).strip()
            # Exclude common non-name words, prepositions, and specialties
            stop_words = {'the', 'a', 'an', 'my', 'on', 'in', 'for', 'at', 'to', 'me',
                          'dentist', 'cardiologist', 'neurologist', 'specialist',
                          'orthodontist', 'surgeon', 'pediatrician', 'gynaecologist'}
            # Also exclude if it's a known specialty alias
            if (name_candidate.lower() not in stop_words
                    and name_candidate.lower() not in SPECIALTY_ALIASES):
                entities['doctor_name'] = name_candidate

        # ── Specialty ──
        for alias, canonical in SPECIALTY_ALIASES.items():
            if re.search(r'\b' + re.escape(alias) + r'\b', t):
                entities['specialty'] = canonical
                break

        # ── Date ──
        entities['date'] = _parse_date(text)

        # ── Time slot ──
        entities['time_slot'] = _parse_time(text)

        return entities

    # ───────────────────────────────────────
    #  BOOKING FLOW — START
    # ───────────────────────────────────────

    def _start_booking(self, sender_id, text, entities, current_data):
        """
        Start a booking flow. Identify what we already have and ask only for what's missing.
        Order of collection: doctor → date → shift → slot → patient_name → book.
        """
        bk = {
            'booking_state': BK_IDLE,
            'doctor_id': None,
            'doctor_name': None,
            'specialty': None,
            'date': None,
            'shift_start': None,
            'shift_end': None,
            'shift_name': None,
            'time_slot': None,
            'end_time': None,
            'patient_name': current_data.get('patient_name'),
            'booked_for': current_data.get('booked_for'),
            'service_id': current_data.get('service_id'),
            'service_name': current_data.get('service_name'),
        }

        # ── Resolve doctor from entities ──
        if entities.get('doctor_name'):
            matched = self._fuzzy_match_doctor(entities['doctor_name'])
            if matched:
                bk['doctor_id'] = matched['user_id']
                bk['doctor_name'] = matched['full_name']
                bk['specialty'] = matched.get('specialization', '')
        elif entities.get('specialty'):
            bk['specialty'] = entities['specialty']

        # ── Resolve date ──
        if entities.get('date'):
            bk['date'] = entities['date']

        # ── Resolve time ──
        if entities.get('time_slot'):
            bk['time_slot'] = entities['time_slot']

        # ── Now advance to the first missing step ──
        self._advance_booking(sender_id, bk)

    # ───────────────────────────────────────
    #  BOOKING FLOW — CONTINUE
    # ───────────────────────────────────────

    def _continue_flow(self, sender_id, text, data, bk_state):
        """Handle user input within an active booking flow."""

        if bk_state == BK_COLLECT_DOCTOR:
            self._handle_doctor_input(sender_id, text, data)

        elif bk_state == BK_COLLECT_DATE:
            self._handle_date_input(sender_id, text, data)

        elif bk_state == BK_COLLECT_SHIFT:
            self._handle_shift_input(sender_id, text, data)

        elif bk_state == BK_SHOW_SLOTS:
            self._handle_slot_input(sender_id, text, data)

        elif bk_state == BK_COLLECT_NAME:
            self._handle_name_input(sender_id, text, data)

        else:
            # Unknown state, reset
            data['booking_state'] = BK_IDLE
            self.sm.transition_to(sender_id, data)
            self.notify.send_whatsapp_text(sender_id, "Something went wrong. Let's start over.")

    # ───────────────────────────────────────
    #  ADVANCE — decides what to ask next
    # ───────────────────────────────────────

    def _advance_booking(self, sender_id, bk):
        """
        Check what info is still missing and transition to that state.
        If everything is ready → book directly.
        """
        # ── Step 1: Need a doctor? ──
        if not bk.get('doctor_id'):
            if bk.get('specialty'):
                # Show doctors in that specialty
                doctors = self.appt.get_active_doctors(specialization=bk['specialty'])
                if not doctors:
                    self.notify.send_whatsapp_text(
                        sender_id,
                        f"No doctors found in *{bk['specialty']}*. Please try a different specialty."
                    )
                    bk['booking_state'] = BK_IDLE
                    self.sm.transition_to(sender_id, bk)
                    return

                if len(doctors) == 1:
                    # Auto-select single doctor
                    bk['doctor_id'] = doctors[0]['user_id']
                    bk['doctor_name'] = doctors[0]['full_name']
                    self.notify.send_whatsapp_text(
                        sender_id,
                        f"👨‍⚕️ Dr. {doctors[0]['full_name']} ({bk['specialty']})"
                    )
                    # Continue advancing
                    return self._advance_booking(sender_id, bk)
                else:
                    bk['booking_state'] = BK_COLLECT_DOCTOR
                    self.sm.transition_to(sender_id, bk)
                    self._show_doctor_list(sender_id, doctors, bk['specialty'])
                    return
            else:
                # No specialty and no doctor — show all doctors grouped by specialty
                doctors = self.appt.get_active_doctors()
                if not doctors:
                    self.notify.send_whatsapp_text(sender_id, "No doctors available at the moment.")
                    bk['booking_state'] = BK_IDLE
                    self.sm.transition_to(sender_id, bk)
                    return

                bk['booking_state'] = BK_COLLECT_DOCTOR
                self.sm.transition_to(sender_id, bk)
                self._show_doctor_list_grouped(sender_id, doctors)
                return

        # ── Step 2: Need a date? ──
        if not bk.get('date'):
            bk['booking_state'] = BK_COLLECT_DATE
            self.sm.transition_to(sender_id, bk)
            self._show_available_dates(sender_id, bk['doctor_id'], bk['doctor_name'])
            return

        # ── Step 3: Need shift? (check if multiple shifts on this date) ──
        if not bk.get('shift_start'):
            shifts = self.appt.get_available_shifts(bk['doctor_id'], bk['date'])
            if not shifts:
                self.notify.send_whatsapp_text(
                    sender_id,
                    f"Dr. {bk.get('doctor_name', '?')} has no available slots on {bk['date']}.\n"
                    f"Please choose another date."
                )
                bk['date'] = None
                bk['booking_state'] = BK_COLLECT_DATE
                self.sm.transition_to(sender_id, bk)
                self._show_available_dates(sender_id, bk['doctor_id'], bk['doctor_name'])
                return

            if len(shifts) == 1:
                # Auto-select single shift
                bk['shift_start'] = shifts[0]['start']
                bk['shift_end'] = shifts[0]['end']
                bk['shift_name'] = shifts[0]['shift_name']
                # Continue advancing
                return self._advance_booking(sender_id, bk)
            else:
                bk['booking_state'] = BK_COLLECT_SHIFT
                self.sm.transition_to(sender_id, bk)
                self._show_shifts(sender_id, shifts, bk['date'])
                return

        # ── Step 4: Need slot? ──
        if not bk.get('time_slot'):
            slots = self.appt.get_shift_slots(
                bk['doctor_id'], bk['date'], bk['shift_start'], bk['shift_end']
            )
            if not slots:
                self.notify.send_whatsapp_text(
                    sender_id,
                    f"All slots are booked for {bk.get('shift_name', '')} shift on {bk['date']}."
                )
                bk['shift_start'] = None
                bk['shift_end'] = None
                bk['shift_name'] = None
                return self._advance_booking(sender_id, bk)

            # If user already specified a time, try to match it
            if bk.get('_requested_time'):
                free_times = [s['start'] for s in slots]
                matched_time = self._match_time(bk['_requested_time'], free_times)
                if matched_time:
                    matched_slot = next((s for s in slots if s['start'] == matched_time), None)
                    bk['time_slot'] = matched_time
                    bk['end_time'] = matched_slot['end'] if matched_slot else None
                    del bk['_requested_time']
                    return self._advance_booking(sender_id, bk)
                else:
                    del bk['_requested_time']
                    # Time not available, show what is

            bk['booking_state'] = BK_SHOW_SLOTS
            bk['_available_slots'] = [s['start'] for s in slots]
            self.sm.transition_to(sender_id, bk)
            self._show_slots(sender_id, slots, bk)
            return

        # ── Step 5: Need patient name? ──
        if not bk.get('patient_name'):
            # Try to get from registered profile
            clean_phone = sender_id.replace('+', '').replace(' ', '')
            patient = self.patient.get_patient_by_phone(clean_phone)
            if patient and patient.get('patient_name'):
                bk['patient_name'] = patient['patient_name']
                bk['booked_for'] = 'self'
                # Continue
                return self._advance_booking(sender_id, bk)
            else:
                bk['booking_state'] = BK_COLLECT_NAME
                self.sm.transition_to(sender_id, bk)
                self.notify.send_whatsapp_text(sender_id, "What is the *patient's name*?")
                return

        # ── ALL READY → BOOK ──
        self._do_booking(sender_id, bk)

    # ───────────────────────────────────────
    #  INPUT HANDLERS
    # ───────────────────────────────────────

    def _handle_doctor_input(self, sender_id, text, data):
        """User is picking a doctor."""
        # Try list/button selection first (doc_<id>)
        if text.startswith('doc_'):
            doctor_id = text.replace('doc_', '', 1)
            doctor = self.appt.get_doctor_by_id(doctor_id)
            if doctor:
                data['doctor_id'] = doctor_id
                data['doctor_name'] = doctor['full_name']
                data['specialty'] = doctor.get('specialization', '')
                return self._advance_booking(sender_id, data)

        # Try specialty match first (user typed "cardiology")
        for alias, canonical in SPECIALTY_ALIASES.items():
            if re.search(r'\b' + re.escape(alias) + r'\b', text.lower()):
                data['specialty'] = canonical
                doctors = self.appt.get_active_doctors(specialization=canonical)
                if doctors:
                    if len(doctors) == 1:
                        data['doctor_id'] = doctors[0]['user_id']
                        data['doctor_name'] = doctors[0]['full_name']
                        self.notify.send_whatsapp_text(
                            sender_id, f"👨‍⚕️ Dr. {doctors[0]['full_name']} ({canonical})"
                        )
                        return self._advance_booking(sender_id, data)
                    else:
                        data['booking_state'] = BK_COLLECT_DOCTOR
                        self.sm.transition_to(sender_id, data)
                        self._show_doctor_list(sender_id, doctors, canonical)
                        return
                else:
                    self.notify.send_whatsapp_text(sender_id, f"No doctors in *{canonical}*. Try another.")
                    return

        # Fuzzy match on doctor name
        matched = self._fuzzy_match_doctor(text)
        if matched:
            data['doctor_id'] = matched['user_id']
            data['doctor_name'] = matched['full_name']
            data['specialty'] = matched.get('specialization', '')
            return self._advance_booking(sender_id, data)

        # No match
        self.notify.send_whatsapp_text(
            sender_id,
            "I couldn't find that doctor. Please pick from the list or type a name."
        )

    def _handle_date_input(self, sender_id, text, data):
        """User is picking a date."""
        # Try list selection (date_YYYY-MM-DD)
        if text.startswith('date_'):
            date_str = text.replace('date_', '', 1)
        else:
            date_str = text.strip()

        # Try YYYY-MM-DD
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
            data['date'] = date_str
            return self._advance_booking(sender_id, data)
        except ValueError:
            pass

        # Try natural language
        resolved = _parse_date(date_str)
        if resolved:
            data['date'] = resolved
            return self._advance_booking(sender_id, data)

        self.notify.send_whatsapp_text(
            sender_id,
            "I couldn't understand that date. Please pick from the list or say 'tomorrow', '28th Feb', etc."
        )

    def _handle_shift_input(self, sender_id, text, data):
        """User is picking a shift."""
        # Button/list selection
        if text.startswith('shift_'):
            parts = text.replace('shift_', '', 1).split('_')
            if len(parts) == 2:
                data['shift_start'] = parts[0]
                data['shift_end'] = parts[1]
                data['shift_name'] = self.appt._classify_shift(parts[0])
                return self._advance_booking(sender_id, data)

        # Fuzzy match shift name
        shifts = self.appt.get_available_shifts(data.get('doctor_id', ''), data.get('date', ''))
        text_clean = text.lower().strip()
        for filler in ['shift', 'slots', 'slot', 'please', 'select']:
            text_clean = text_clean.replace(filler, '').strip()

        for s in shifts:
            if s['shift_name'].lower() in text_clean or text_clean in s['shift_name'].lower():
                data['shift_start'] = s['start']
                data['shift_end'] = s['end']
                data['shift_name'] = s['shift_name']
                return self._advance_booking(sender_id, data)

        self.notify.send_whatsapp_text(sender_id, "Please pick a shift from the list.")

    def _handle_slot_input(self, sender_id, text, data):
        """User is picking a time slot."""
        available = data.get('_available_slots', [])

        # Button/list selection
        if text.startswith('time_'):
            time_str = text.replace('time_', '', 1)
            if time_str in available:
                data['time_slot'] = time_str
                data['end_time'] = self._get_end_time(data, time_str)
                return self._advance_booking(sender_id, data)

        # Slot number (1, 2, 3…)
        num_match = re.match(r'^\s*(\d{1,2})\s*$', text.strip())
        if num_match:
            idx = int(num_match.group(1)) - 1
            if 0 <= idx < len(available):
                time_str = available[idx]
                data['time_slot'] = time_str
                data['end_time'] = self._get_end_time(data, time_str)
                return self._advance_booking(sender_id, data)

        # Try time parsing (9am, 10:00, etc)
        parsed = _parse_time(text)
        if parsed:
            matched = self._match_time(parsed, available)
            if matched:
                data['time_slot'] = matched
                data['end_time'] = self._get_end_time(data, matched)
                return self._advance_booking(sender_id, data)

        # "morning" / "afternoon" / "evening" keyword → first matching slot
        period_match = self._match_period(text, available)
        if period_match:
            data['time_slot'] = period_match
            data['end_time'] = self._get_end_time(data, period_match)
            return self._advance_booking(sender_id, data)

        # Nothing matched
        self.notify.send_whatsapp_text(
            sender_id,
            "That slot isn't available. Please reply with a *slot number* or time (e.g. '9 AM')."
        )

    def _handle_name_input(self, sender_id, text, data):
        """User entered patient name."""
        name = text.strip()
        if len(name) < 2:
            self.notify.send_whatsapp_text(sender_id, "Please enter a valid name.")
            return
        data['patient_name'] = name
        data['booked_for'] = 'other'
        self._advance_booking(sender_id, data)

    # ───────────────────────────────────────
    #  DISPLAY HELPERS
    # ───────────────────────────────────────

    def _show_doctor_list(self, sender_id, doctors, specialty_label=None):
        """Send a WhatsApp list of doctors."""
        items = []
        for doc in doctors[:10]:
            name = doc['full_name'].replace('Dr.', '').replace('dr.', '').strip()
            spec = doc.get('specialization', '')
            items.append((
                f"doc_{doc['user_id']}",
                f"Dr. {name}"[:24],
                spec[:72]
            ))

        header = f"👨‍⚕️ Doctors in *{specialty_label}*:" if specialty_label else "👨‍⚕️ Choose a doctor:"
        self.notify.send_whatsapp_list(
            sender_id, header, items, title="Doctors", button_text="Choose Doctor"
        )

    def _show_doctor_list_grouped(self, sender_id, doctors):
        """Show all doctors grouped by specialty as a text message + list."""
        groups = {}
        for d in doctors:
            spec = d.get('specialization', 'Other')
            groups.setdefault(spec, []).append(d)

        msg = "👨‍⚕️ *Our Doctors:*\n\n"
        for spec, docs in sorted(groups.items()):
            msg += f"*{spec}*\n"
            for d in docs:
                msg += f"  • Dr. {d['full_name']}\n"
            msg += "\n"
        msg += "Reply with a *doctor name* or *specialty* to continue."

        self.notify.send_whatsapp_text(sender_id, msg)

        # Also send interactive list
        items = []
        for d in doctors[:10]:
            items.append((
                f"doc_{d['user_id']}",
                f"Dr. {d['full_name']}"[:24],
                d.get('specialization', '')[:72]
            ))
        self.notify.send_whatsapp_list(
            sender_id, "Select a doctor:", items, title="Doctors", button_text="Choose Doctor"
        )

    def _show_available_dates(self, sender_id, doctor_id, doctor_name):
        """Show upcoming available dates for a doctor."""
        available = self.appt.get_doctor_available_dates(doctor_id, num_dates=10)
        if not available:
            self.notify.send_whatsapp_text(
                sender_id,
                f"Dr. {doctor_name} has no upcoming available dates."
            )
            return

        items = []
        for d in available:
            shift_str = ', '.join(d.get('shifts', []))
            display = f"{d['display']} ({shift_str})" if shift_str else d['display']
            items.append((f"date_{d['date']}", display[:24], d['date']))

        self.notify.send_whatsapp_list(
            sender_id,
            f"📅 Dr. {doctor_name}\nSelect an available date:",
            items,
            title="Available Dates"
        )

    def _show_shifts(self, sender_id, shifts, date_str):
        """Show available shifts."""
        if len(shifts) <= 3:
            btn_titles = [f"{s['shift_name']} ({s['free_slots']} slots)" for s in shifts]
            btn_ids = [f"shift_{s['start']}_{s['end']}" for s in shifts]
            self.notify.send_whatsapp_buttons(
                sender_id, f"🕐 Select a shift for {date_str}:", btn_titles[:3], btn_ids[:3]
            )
        else:
            items = []
            for s in shifts:
                items.append((
                    f"shift_{s['start']}_{s['end']}",
                    s['shift_name'],
                    f"{s['start']}–{s['end']} ({s['free_slots']} slots)"
                ))
            self.notify.send_whatsapp_list(
                sender_id, f"🕐 Select a shift for {date_str}:", items, title="Shifts"
            )

    def _show_slots(self, sender_id, slots, bk):
        """Show available time slots with numbering."""
        # ── Text message with ALL slots (no limit) ──
        msg_lines = [
            f"⏰ *Available Slots ({len(slots)})*",
            f"Dr. {bk.get('doctor_name', '?')} | {bk.get('date', '?')} | {bk.get('shift_name', '')} shift\n",
        ]
        for i, slot in enumerate(slots, 1):
            msg_lines.append(f"  {i}. {slot['start']} – {slot['end']}")

        msg_lines.append("\nReply with a *number* or *time* (e.g. '9 AM').")
        self.notify.send_whatsapp_text(sender_id, '\n'.join(msg_lines))

        # ── Interactive list (WhatsApp max 10 rows) ──
        items = []
        for slot in slots[:10]:
            items.append((f"time_{slot['start']}", f"🕐 {slot['start']}", f"{slot['start']} – {slot['end']}"))

        list_header = "Select a time slot:"
        if len(slots) > 10:
            list_header = f"Tap to pick (slots 1-10). For slots 11-{len(slots)}, reply with the number above."
        self.notify.send_whatsapp_list(
            sender_id, list_header, items, title="Time Slots", button_text="Choose Slot"
        )

    # ───────────────────────────────────────
    #  DO BOOKING
    # ───────────────────────────────────────

    def _do_booking(self, sender_id, bk):
        """All info collected — book the appointment."""
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient.get_patient_by_phone(clean_phone)
        patient_id = patient['patient_id'] if patient else f"wa_{clean_phone}"

        try:
            new_appt = self.appt.book_appointment({
                'patient_id': patient_id,
                'patient_name': bk.get('patient_name', '?'),
                'doctor_id': bk['doctor_id'],
                'service_id': bk.get('service_id', ''),
                'service_name': bk.get('service_name', ''),
                'date': bk['date'],
                'shift': bk.get('shift_name', ''),
                'start_time': bk['time_slot'],
                'end_time': bk.get('end_time', ''),
                'status': 'pending_doctor_approval',
                'booked_for': bk.get('booked_for', 'self'),
                'created_by': 'whatsapp',
                'created_by_id': sender_id
            })

            appt_id = new_appt.get('appointment_id', '—')
            confirm_msg = (
                f"✅ *Appointment Booked!*\n\n"
                f"🆔 ID: {appt_id}\n"
                f"👤 Patient: {bk.get('patient_name')}\n"
                f"👨‍⚕️ Doctor: Dr. {bk.get('doctor_name')}\n"
                f"📅 Date: {bk['date']}\n"
                f"⏰ Time: {bk['time_slot']} – {bk.get('end_time', '')}\n\n"
                f"⏳ Status: Pending Doctor Approval\n"
                f"_You'll be notified once confirmed._"
            )
            self.notify.send_whatsapp_text(sender_id, confirm_msg)

            # Notify doctor dashboard in real-time
            from services.socket_service import notify_new_appointment
            try:
                notify_new_appointment(bk['doctor_id'], new_appt)
            except Exception as e:
                logger.warning(f"Socket notify failed (non-critical): {e}")

            logger.info(f"✅ Smart booking: {appt_id} for {bk.get('patient_name')} with Dr. {bk.get('doctor_name')} on {bk['date']} at {bk['time_slot']}")

        except ValueError as e:
            self.notify.send_whatsapp_text(
                sender_id,
                f"⚠️ That slot was just taken! Please try another time.\n_{str(e)}_"
            )
            # Reset slot so slots are re-shown
            bk['time_slot'] = None
            bk['end_time'] = None
            bk['_available_slots'] = None
            return self._advance_booking(sender_id, bk)

        except Exception as e:
            logger.error(f"Booking failed: {e}")
            self.notify.send_whatsapp_text(sender_id, f"❌ Booking Failed: {str(e)}")

        # Reset state
        bk['booking_state'] = BK_IDLE
        self.sm.transition_to(sender_id, bk, clear=True)

    # ───────────────────────────────────────
    #  QUERY HANDLERS (read-only)
    # ───────────────────────────────────────

    def _handle_query_doctors(self, sender_id, text, entities):
        """Handle 'which doctors are available' / 'doctors in cardiology'."""
        specialty = entities.get('specialty')
        date = entities.get('date')

        doctors = self.appt.get_active_doctors(specialization=specialty)
        if not doctors:
            label = f" in *{specialty}*" if specialty else ""
            self.notify.send_whatsapp_text(sender_id, f"No doctors found{label}.")
            return

        if date:
            # Filter to doctors with availability on that date
            available = []
            for doc in doctors:
                shifts = self.appt.get_available_shifts(doc['user_id'], date)
                if shifts:
                    total_slots = sum(s['free_slots'] for s in shifts)
                    available.append({
                        'name': doc['full_name'],
                        'specialization': doc.get('specialization', ''),
                        'user_id': doc['user_id'],
                        'shifts': [s['shift_name'] for s in shifts],
                        'total_slots': total_slots,
                    })

            if not available:
                spec_label = f" in {specialty}" if specialty else ""
                self.notify.send_whatsapp_text(sender_id, f"No doctors available{spec_label} on {date}.")
                return

            msg = f"👨‍⚕️ *Doctors available on {date}*"
            if specialty:
                msg += f" ({specialty})"
            msg += ":\n\n"
            for d in available:
                msg += f"• Dr. {d['name']} — {d['specialization']}\n"
                msg += f"  {', '.join(d['shifts'])} | {d['total_slots']} slots\n"

            msg += "\nReply with a doctor name to book."
            self.notify.send_whatsapp_text(sender_id, msg)
        else:
            # No date — group by specialty
            groups = {}
            for d in doctors:
                spec = d.get('specialization', 'Other')
                groups.setdefault(spec, []).append(d)

            msg = "👨‍⚕️ *Our Doctors*"
            if specialty:
                msg += f" — {specialty}"
            msg += ":\n\n"
            for spec, docs in sorted(groups.items()):
                msg += f"*{spec}*\n"
                for d in docs:
                    msg += f"  • Dr. {d['full_name']}\n"
                msg += "\n"
            msg += "Reply with a doctor name to book, or add a date (e.g. 'doctors available tomorrow')."
            self.notify.send_whatsapp_text(sender_id, msg)

    def _handle_query_slots(self, sender_id, text, entities):
        """Handle 'how many slots for Dr X on Y' / 'available slots in cardiology'."""
        doctor_name = entities.get('doctor_name')
        specialty = entities.get('specialty')
        date = entities.get('date')

        # Need at least a doctor or specialty
        if not doctor_name and not specialty:
            self.notify.send_whatsapp_text(
                sender_id,
                "Please specify a *doctor name* or *specialty* to check slots.\n"
                "Example: _slots for Dr. Arjun tomorrow_"
            )
            return

        # Resolve doctor
        if doctor_name:
            matched = self._fuzzy_match_doctor(doctor_name)
            if not matched:
                self.notify.send_whatsapp_text(sender_id, f"Doctor '{doctor_name}' not found.")
                return

            if not date:
                # Show next few available dates
                available = self.appt.get_doctor_available_dates(matched['user_id'], num_dates=5)
                if not available:
                    self.notify.send_whatsapp_text(sender_id, f"Dr. {matched['full_name']} has no upcoming dates.")
                    return
                msg = f"📅 *Dr. {matched['full_name']}* — upcoming availability:\n\n"
                for d in available:
                    shifts = self.appt.get_available_shifts(matched['user_id'], d['date'])
                    total = sum(s['free_slots'] for s in shifts) if shifts else 0
                    msg += f"• {d['display']} — {total} slots\n"
                self.notify.send_whatsapp_text(sender_id, msg)
                return

            # Have doctor + date — show real slots
            shifts = self.appt.get_available_shifts(matched['user_id'], date)
            if not shifts:
                self.notify.send_whatsapp_text(
                    sender_id,
                    f"Dr. {matched['full_name']} has no available slots on {date}."
                )
                return

            msg = f"⏰ *Dr. {matched['full_name']}* — {date}:\n\n"
            for s in shifts:
                slots = self.appt.get_shift_slots(matched['user_id'], date, s['start'], s['end'])
                times = ', '.join(sl['start'] for sl in slots)
                msg += f"*{s['shift_name']}* ({s['start']}–{s['end']}): {s['free_slots']} slots\n"
                if times:
                    msg += f"  {times}\n"
            msg += "\nWant to book? Just say: _book with Dr. " + matched['full_name'] + f" on {date}_"
            self.notify.send_whatsapp_text(sender_id, msg)

        elif specialty:
            # Show slot counts per doctor in that specialty
            doctors = self.appt.get_active_doctors(specialization=specialty)
            if not doctors:
                self.notify.send_whatsapp_text(sender_id, f"No {specialty} doctors found.")
                return

            if not date:
                date = datetime.now().strftime('%Y-%m-%d')  # default to today

            msg = f"⏰ *{specialty} Slots on {date}*:\n\n"
            any_available = False
            for doc in doctors:
                shifts = self.appt.get_available_shifts(doc['user_id'], date)
                if shifts:
                    total = sum(s['free_slots'] for s in shifts)
                    shift_names = ', '.join(s['shift_name'] for s in shifts)
                    msg += f"• Dr. {doc['full_name']} — {total} slots ({shift_names})\n"
                    any_available = True

            if not any_available:
                msg += "No slots available.\n"

            self.notify.send_whatsapp_text(sender_id, msg)

    def _handle_query_shift(self, sender_id, text, entities):
        """Handle 'what is Dr X's shift' / 'when does Dr X work'."""
        doctor_name = entities.get('doctor_name')
        if not doctor_name:
            self.notify.send_whatsapp_text(
                sender_id, "Which doctor? Please specify a name (e.g. _shift of Dr. Arjun_)."
            )
            return

        matched = self._fuzzy_match_doctor(doctor_name)
        if not matched:
            self.notify.send_whatsapp_text(sender_id, f"Doctor '{doctor_name}' not found.")
            return

        # Get schedule from DB
        schedules = list(self.appt.db.doctor_schedules.find({
            'doctor_id': matched['user_id'],
            'is_available': True
        }))

        if not schedules:
            self.notify.send_whatsapp_text(sender_id, f"Dr. {matched['full_name']} has no active schedule.")
            return

        msg = f"🕐 *Dr. {matched['full_name']}* — Schedule:\n\n"
        # Group by day
        by_day = {}
        for s in schedules:
            by_day.setdefault(s['day_of_week'], []).append(s)

        day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        for day in day_order:
            if day in by_day:
                shifts = by_day[day]
                shift_strs = []
                for s in shifts:
                    shift_name = self.appt._classify_shift(s['start_time'])
                    shift_strs.append(f"{shift_name} ({s['start_time']}–{s['end_time']})")
                msg += f"• *{day}*: {', '.join(shift_strs)}\n"

        self.notify.send_whatsapp_text(sender_id, msg)

    # ───────────────────────────────────────
    #  UTILITY HELPERS
    # ───────────────────────────────────────

    def _fuzzy_match_doctor(self, name_input, doctors=None):
        """Fuzzy match a doctor name against DB. Returns doctor dict or None."""
        if doctors is None:
            doctors = self.appt.get_active_doctors()

        clean = name_input.lower().replace('dr.', '').replace('doctor', '').strip()
        if not clean:
            return None

        # Exact match first
        for d in doctors:
            if clean == d['full_name'].lower():
                return d

        # Partial match
        for d in doctors:
            if clean in d['full_name'].lower() or d['full_name'].lower() in clean:
                return d

        # Word-level match (any word matches)
        clean_words = clean.split()
        for d in doctors:
            doc_words = d['full_name'].lower().split()
            if any(w in doc_words for w in clean_words):
                return d

        return None

    def _match_time(self, parsed_time, available_times):
        """Match a parsed HH:MM against available slot times. Returns matched time or None."""
        if parsed_time in available_times:
            return parsed_time
        # Try prefix match (user says "07" → "07:00")
        prefix = parsed_time[:2] + ':'
        return next((t for t in available_times if t.startswith(prefix)), None)

    def _match_period(self, text, available_times):
        """Match 'morning'/'afternoon'/'evening' to first available slot in that period."""
        t = text.lower().strip()
        if 'morning' in t:
            return next((tm for tm in available_times if int(tm.split(':')[0]) < 12), None)
        if 'afternoon' in t:
            return next((tm for tm in available_times if 12 <= int(tm.split(':')[0]) < 17), None)
        if 'evening' in t or 'night' in t:
            return next((tm for tm in available_times if int(tm.split(':')[0]) >= 17), None)
        return None

    def _get_end_time(self, data, time_str):
        """Get end time for a slot by looking it up in shift slots."""
        try:
            slots = self.appt.get_shift_slots(
                data.get('doctor_id', ''), data.get('date', ''),
                data.get('shift_start', ''), data.get('shift_end', '')
            )
            matched = next((s for s in slots if s['start'] == time_str), None)
            if matched:
                return matched['end']
        except Exception:
            pass
        # Fallback: 30 min duration
        try:
            dt = datetime.strptime(time_str, '%H:%M')
            return (dt + timedelta(minutes=30)).strftime('%H:%M')
        except Exception:
            return ''


# ═══════════════════════════════════════════
#  STANDALONE PARSERS
# ═══════════════════════════════════════════

def _parse_date(text):
    """
    Parse natural language date to YYYY-MM-DD.
    Handles: today, tomorrow, day after tomorrow, weekday names,
    month+day ('feb 27', '27th feb'), ordinals ('27th'), relative ('in 3 days').
    Returns None if unparseable.
    """
    t = text.lower().strip()
    today = datetime.now()

    # Already YYYY-MM-DD?
    m = re.search(r'(\d{4}-\d{2}-\d{2})', t)
    if m:
        try:
            datetime.strptime(m.group(1), '%Y-%m-%d')
            return m.group(1)
        except ValueError:
            pass

    # Relative (check multi-word first to avoid premature match)
    if re.search(r'\bday\s+after\s+tomorrow\b|\bparson\b', t):
        return (today + timedelta(days=2)).strftime('%Y-%m-%d')
    if re.search(r'\btoday\b|\baaj\b', t):
        return today.strftime('%Y-%m-%d')
    if re.search(r'\btomorrow\b|\bkal\b', t):
        return (today + timedelta(days=1)).strftime('%Y-%m-%d')

    # "in N days"
    m = re.search(r'\bin\s+(\d+)\s+days?\b', t)
    if m:
        return (today + timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d')

    # Day names
    day_names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    for i, day_name in enumerate(day_names):
        if day_name in t:
            days_ahead = (i - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return (today + timedelta(days=days_ahead)).strftime('%Y-%m-%d')

    # Month + day: "feb 27", "27 feb", "february 27th", "27th of february"
    month_map = {
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
        'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
        'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'oct': 10, 'october': 10,
        'nov': 11, 'november': 11, 'dec': 12, 'december': 12
    }
    for month_name, month_num in month_map.items():
        if month_name in t:
            # Extract day number (handles "27th", "3rd", "1st")
            day_match = re.search(r'(\d{1,2})(?:st|nd|rd|th)?', t)
            if day_match:
                day = int(day_match.group(1))
                year = today.year
                try:
                    candidate = datetime(year, month_num, day)
                    if candidate.date() < today.date():
                        candidate = datetime(year + 1, month_num, day)
                    return candidate.strftime('%Y-%m-%d')
                except ValueError:
                    pass
            break

    # Just ordinal number like "27th" or "28th" — assume current or next month
    ord_match = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)\b', t)
    if ord_match:
        day = int(ord_match.group(1))
        # Try current month first
        year, month = today.year, today.month
        try:
            candidate = datetime(year, month, day)
            if candidate.date() < today.date():
                # Try next month
                if month == 12:
                    candidate = datetime(year + 1, 1, day)
                else:
                    candidate = datetime(year, month + 1, day)
            return candidate.strftime('%Y-%m-%d')
        except ValueError:
            pass

    return None


def _parse_time(text):
    """
    Parse natural language time to HH:MM (24h).
    Handles: '9am', '9:30am', '14:00', '2pm', '9 AM', '10', 'seven', etc.
    Returns None if unparseable.
    """
    t = text.strip().lower().replace(' ', '')

    # Already HH:MM
    m = re.match(r'^(\d{1,2}):(\d{2})$', t)
    if m:
        h, mn = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mn <= 59:
            return f"{h:02d}:{mn:02d}"

    # 12h format: 9am, 9:30pm
    m = re.search(r'(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)', t)
    if m:
        h = int(m.group(1))
        mn = int(m.group(2)) if m.group(2) else 0
        period = m.group(3).replace('.', '')
        if period == 'pm' and h != 12:
            h += 12
        if period == 'am' and h == 12:
            h = 0
        return f"{h:02d}:{mn:02d}"

    # Word numbers
    word_nums = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
        'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
    }
    for word, num in word_nums.items():
        if word in t:
            h = num
            if 'pm' in t and h != 12:
                h += 12
            elif 'am' in t and h == 12:
                h = 0
            return f"{h:02d}:00"

    # Bare number: "10", "9" — treat as hour
    m = re.match(r'^(\d{1,2})$', t)
    if m:
        h = int(m.group(1))
        if 0 <= h <= 23:
            return f"{h:02d}:00"

    return None
