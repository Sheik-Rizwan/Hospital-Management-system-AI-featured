# voice_booking_service.py — Bridges Sarvam AI tool calls to AppointmentService
# Handles multilingual voice booking: STT → AI Conversation → Booking → TTS

import os
import logging
import re
from datetime import datetime, date
from services.sarvam_service import SarvamService
from services.appointment_service import AppointmentService
from services.speech_to_text import SpeechToTextRecorder
from services.stt_post_processor import post_process_stt
from services.booking_utils import resolve_date, resolve_time, resolve_ambiguous_time, validate_booking_date, get_doctor_weekly_schedule

logger = logging.getLogger(__name__)


class VoiceBookingService:
    """
    Orchestrates the full voice booking flow:
      1. STT: audio → transcript (Sarvam primary, Groq fallback)
      2. Conversation: transcript → AI reply with tool calling
      3. Tool callbacks: check_availability / book_appointment
      4. TTS: AI reply text → audio file
    """

    def __init__(self):
        self.sarvam = SarvamService()
        self.appt = AppointmentService()
        self.stt_fallback = SpeechToTextRecorder()

    def _normalize_doctor_text(self, value: str) -> str:
        text = str(value or '').lower()
        text = text.replace('dr.', ' ').replace('dr ', ' ').replace('doctor', ' ')
        text = re.sub(r"[^a-z0-9\s]", " ", text)
        return ' '.join(text.split())

    def _extract_specialization_hint(self, doctor_query: str, candidate_doctors: list[dict]) -> str | None:
        if not doctor_query or not candidate_doctors:
            return None

        query_norm = self._normalize_doctor_text(doctor_query)
        if not query_norm:
            return None
        query_tokens = set(query_norm.split())

        best_spec = None
        best_score = 0

        for doctor in candidate_doctors:
            specialization = str(doctor.get('specialization', '') or '').strip()
            spec_norm = self._normalize_doctor_text(specialization)
            if not spec_norm:
                continue

            score = 0
            if spec_norm in query_norm:
                score = 100 + len(spec_norm.split())
            else:
                spec_tokens = [tok for tok in spec_norm.split() if len(tok) >= 4]
                if spec_tokens:
                    token_hits = sum(
                        1 for tok in spec_tokens
                        if tok in query_tokens or any(
                            len(qtok) >= 4 and (
                                tok.startswith(qtok)
                                or qtok.startswith(tok)
                                or (len(tok) >= 6 and len(qtok) >= 6 and tok[:6] == qtok[:6])
                            )
                            for qtok in query_tokens
                        )
                    )
                    if token_hits:
                        score = token_hits

            if score > best_score:
                best_score = score
                best_spec = specialization

        return best_spec

    def _match_doctors_with_specialization(self, doctor_query: str, doctors: list[dict], specialization_hint: str | None = None) -> list[dict]:
        query_norm = self._normalize_doctor_text(doctor_query)
        if not query_norm or not doctors:
            return []

        query_tokens = [tok for tok in query_norm.split() if len(tok) >= 2]
        matched = []

        for doctor in doctors:
            doctor_name_norm = self._normalize_doctor_text(doctor.get('full_name', ''))
            if not doctor_name_norm:
                continue

            if len(doctor_name_norm) >= 2:
                if query_norm in doctor_name_norm or doctor_name_norm in query_norm:
                    matched.append(doctor)
                    continue
            elif doctor_name_norm in query_norm.split():
                matched.append(doctor)
                continue

            doctor_tokens = [tok for tok in doctor_name_norm.split() if len(tok) >= 2]
            if doctor_tokens and query_tokens:
                overlap = set(doctor_tokens).intersection(query_tokens)
                if overlap and len(overlap) >= min(2, len(doctor_tokens), len(query_tokens)):
                    matched.append(doctor)

        if not matched:
            return []

        effective_spec = specialization_hint or self._extract_specialization_hint(doctor_query, matched)
        if not effective_spec:
            return matched

        spec_hint_norm = self._normalize_doctor_text(effective_spec)
        if not spec_hint_norm:
            return matched

        hint_tokens = [tok for tok in spec_hint_norm.split() if len(tok) >= 4]
        narrowed = []
        for doctor in matched:
            doctor_spec_norm = self._normalize_doctor_text(doctor.get('specialization', ''))
            if doctor_spec_norm and (
                spec_hint_norm in doctor_spec_norm
                or doctor_spec_norm in spec_hint_norm
                or any(
                    tok in doctor_spec_norm
                    or doctor_spec_norm.startswith(tok)
                    or (len(tok) >= 6 and doctor_spec_norm[:6] == tok[:6])
                    for tok in hint_tokens
                )
            ):
                narrowed.append(doctor)

        return narrowed or matched

    @staticmethod
    def _format_available_doctors(doctors: list[dict], missing_doctor_name: str | None = None, limit: int = 8) -> str:
        """Build explicit not-found + doctors grouped by specialization."""
        requested_name = re.sub(
            r'^\s*dr\.?\s*',
            '',
            str(missing_doctor_name or '').strip(),
            flags=re.IGNORECASE
        )
        missing_line = (
            f"Dr. {requested_name} is not in the hospital."
            if requested_name
            else "That doctor is not in the hospital."
        )

        if not doctors:
            return f"{missing_line} There are no active doctors available right now."

        # Group doctors by specialization
        spec_groups = {}
        for doctor in doctors[:limit]:
            name = str(doctor.get('full_name', '') or '').strip()
            if not name:
                continue
            specialization = str(doctor.get('specialization', 'General Consultation') or 'General Consultation').strip()
            if not specialization:
                specialization = 'General Consultation'
            if specialization not in spec_groups:
                spec_groups[specialization] = []
            spec_groups[specialization].append(f"Dr. {name}")

        if not spec_groups:
            return f"{missing_line} There are no active doctors available right now."

        # Format as "Specialization: Dr. Name1, Dr. Name2"
        formatted_lines = []
        for spec, doc_names in spec_groups.items():
            formatted_lines.append(f"{spec}: {', '.join(doc_names)}")

        return (
            f"{missing_line}\n"
            "Here are the doctors available in our hospital:\n"
            + "\n".join(formatted_lines)
            + "\nWhich doctor would you like to book an appointment with?"
        )

    # ═══════════════════════════════════════════
    #  SPEECH-TO-TEXT
    # ═══════════════════════════════════════════

    def transcribe_audio(self, audio_file_path: str, language_code: str = 'en') -> dict:
        """
        Transcribe audio using Sarvam STT as primary.
        Falls back to Groq Whisper if Sarvam is unavailable.
        Returns: { 'transcript': str, 'language_code': str }
        """
        # Primary: Sarvam AI
        if self.sarvam.is_available():
            result = self.sarvam.speech_to_text(audio_file_path, language_code)
            if result and result.get('transcript'):
                logger.info(f"✅ Sarvam STT success: '{result['transcript'][:60]}'")
                return result

        # Fallback: Groq Whisper (in speech_to_text.py)
        logger.warning("⚠️ Sarvam STT unavailable, falling back to Groq Whisper")
        try:
            text = self.stt_fallback.transcribe_audio_file(
                audio_file_path,
                language_code=language_code
            )
            if text:
                return {'transcript': text, 'language_code': language_code}
        except Exception as e:
            logger.error(f"❌ Groq Whisper fallback failed: {e}")

        return {'transcript': '', 'language_code': language_code, 'error': 'Transcription failed'}

    # ═══════════════════════════════════════════
    #  TEXT-TO-SPEECH
    # ═══════════════════════════════════════════

    def synthesize_speech(self, text: str, language_code: str = 'en') -> str | None:
        """
        Convert text to speech using Sarvam TTS.
        Returns path to generated .wav file, or None on failure.
        """
        if not self.sarvam.is_available():
            logger.warning("Sarvam TTS unavailable — returning text only")
            return None
        return self.sarvam.text_to_speech(text, language_code=language_code)

    # ═══════════════════════════════════════════
    #  TOOL CALLBACK (called by Sarvam AI)
    # ═══════════════════════════════════════════

    def _make_tool_callback(self, patient_id: str, language_code: str = 'en'):
        """
        Returns a tool_callback function bound to the given patient_id.
        The Sarvam AI calls this with tool_name and args.
        Tool results are translated into the user's language.
        """
        def tool_callback(tool_name: str, args: dict) -> str:
            logger.info(f"🔧 Voice tool call: {tool_name}({args})")

            if tool_name == 'check_availability':
                result = self._check_availability(args)
            elif tool_name == 'book_appointment':
                result = self._book_appointment(args, patient_id)
            else:
                result = f"Unknown tool: {tool_name}"

            # Translate tool result into user's language
            if language_code != 'en' and self.sarvam:
                result = self.sarvam.translate_tool_result(result, language_code)

            return result

        return tool_callback

    def _check_availability(self, args: dict) -> str:
        """
        Resolve doctor by name, validate date, then return availability.
        Uses booking_utils for date/time parsing and ambiguous time resolution.
        """
        doctor_name = args.get('doctor_name', '').strip()
        date_input = args.get('date', '').strip()
        requested_time = args.get('time')

        if not doctor_name:
            return "I need a doctor name to check availability."

        if not date_input:
            return "I need a date to check availability."

        # Resolve natural language date + validate (reject past/today)
        date_str, date_error = resolve_date(date_input, today=date.today())
        if date_error:
            return date_error
        if not date_str:
            # Try as-is if it looks like YYYY-MM-DD
            is_valid, err = validate_booking_date(date_input, today=date.today())
            if not is_valid:
                return err or f"The date '{date_input}' could not be understood. Please say a date like 'tomorrow' or 'March 5th'."
            date_str = date_input

        # Find doctor by name (partial, case-insensitive)
        doctors = self.appt.get_active_doctors()
        specialization_hint = args.get('specialization')
        matched = self._match_doctors_with_specialization(doctor_name, doctors, specialization_hint)

        if not matched:
            return self._format_available_doctors(doctors, doctor_name)

        if len(matched) > 1:
            choices = ', '.join(
                f"Dr. {d.get('full_name', '')} ({d.get('specialization', 'General')})"
                for d in matched[:5]
            )
            return (
                f"I found multiple doctors matching '{doctor_name}': {choices}. "
                "Please tell me the full name or specialization."
            )

        doctor = matched[0]
        doctor_id = doctor['user_id']
        full_name = doctor.get('full_name', doctor_name)

        # Specific time check with smart ambiguous resolution
        if requested_time:
            resolved_time, time_err = resolve_ambiguous_time(
                requested_time, doctor_id, date_str, self.appt
            )
            if time_err and not resolved_time:
                return time_err
            if resolved_time:
                avail = self.appt.get_doctor_availability(doctor_id, date_str)
                if not avail.get('available'):
                    return f"Doctor {full_name} is not available on {date_str}."
                free_slot = next(
                    (s for s in avail.get('slots', [])
                     if s['available'] and s['start'] == resolved_time),
                    None
                )
                if free_slot:
                    return f"Yes, {resolved_time} is available with Doctor {full_name} on {date_str}."
                return f"The slot at {resolved_time} is not available. Please choose another time."

        # Return all available shifts in spoken form
        spoken, shifts = self.appt.get_spoken_shifts(doctor_id, date_str)
        if not spoken:
            weekly = get_doctor_weekly_schedule(doctor_id, self.appt)
            return (
                f"Doctor {full_name} is not available on {date_str}. "
                f"Their weekly schedule is: {weekly}"
            )
        return spoken

    def _get_patient_name_by_id(self, patient_id: str) -> str:
        """
        Look up the patient's registered name from the database using patient_id.
        Returns empty string if not found.
        """
        try:
            patient = self.appt.mongo.patients.find_one({'patient_id': patient_id})
            if patient:
                return patient.get('patient_name', '') or patient.get('full_name', '') or ''
        except Exception as e:
            logger.warning(f"⚠️ Could not fetch patient name for {patient_id}: {e}")
        return ''

    def _book_appointment(self, args: dict, patient_id: str) -> str:
        """
        Create an appointment in MongoDB from AI-collected args.
        Uses booking_utils for date/time validation and smart resolution.
        """
        doctor_name = args.get('doctor_name', '').strip()
        date_input = args.get('date', '').strip()
        time_input = args.get('time', '').strip()
        patient_name_input = args.get('patient_name', '').strip()

        if not all([doctor_name, date_input, time_input]):
            return "I need the doctor name, date, and time to complete the booking."

        # Resolve patient name: if 'self' or empty, get from patient profile
        if not patient_name_input or patient_name_input.lower() == 'self':
            patient_name = self._get_patient_name_by_id(patient_id)
        else:
            patient_name = patient_name_input

        # Resolve and validate date
        date_str, date_error = resolve_date(date_input, today=date.today())
        if date_error:
            return date_error
        if not date_str:
            is_valid, err = validate_booking_date(date_input, today=date.today())
            if not is_valid:
                return err or f"The date '{date_input}' is not valid."
            date_str = date_input

        # Resolve doctor
        doctors = self.appt.get_active_doctors()
        specialization_hint = args.get('specialization')
        matched = self._match_doctors_with_specialization(doctor_name, doctors, specialization_hint)
        if not matched:
            return self._format_available_doctors(doctors, doctor_name)

        if len(matched) > 1:
            choices = ', '.join(
                f"Dr. {d.get('full_name', '')} ({d.get('specialization', 'General')})"
                for d in matched[:5]
            )
            return (
                f"I found multiple doctors matching '{doctor_name}': {choices}. "
                "Please tell me the full name or specialization."
            )

        doctor = matched[0]
        doctor_id = doctor['user_id']
        full_name = doctor.get('full_name', doctor_name)

        # Resolve time with smart ambiguity handling
        resolved_time, time_err = resolve_ambiguous_time(
            time_input, doctor_id, date_str, self.appt
        )
        if time_err and not resolved_time:
            return time_err
        time_str = resolved_time or resolve_time(time_input)
        if not time_str:
            return f"Could not understand the time '{time_input}'. Please say a time like '10 AM' or '14:30'."

        # Verify the slot is still free
        avail = self.appt.get_doctor_availability(doctor_id, date_str)
        matching_slot = next(
            (s for s in avail.get('slots', [])
             if s['available'] and s['start'] == time_str),
            None
        )
        if not matching_slot:
            return (
                f"The slot at {time_str} is no longer available with Doctor {full_name}. "
                "Please choose another time."
            )

        # Build appointment data
        appt_data = {
            'patient_id': patient_id,
            'patient_name': patient_name,
            'doctor_id': doctor_id,
            'date': date_str,
            'start_time': time_str,
            'end_time': matching_slot['end'],
            'created_by': 'voice',
            'created_by_id': patient_id,
            'status': 'pending_doctor_approval',
            'booked_for': 'self' if (not patient_name_input or patient_name_input.lower() == 'self') else 'other',
            'notes': 'Booked via voice assistant'
        }

        try:
            new_appt = self.appt.book_appointment(appt_data)
            logger.info(f"✅ Voice booking created: {new_appt.get('appointment_id')} for {patient_name}")
            # Include patient name in confirmation if available
            name_clause = f" for {patient_name}" if patient_name else ""
            return (
                f"Your appointment{name_clause} with Doctor {full_name} on {date_str} at {time_str} "
                f"has been booked successfully! Appointment ID: {new_appt.get('appointment_id', 'N/A')}. "
                "It is pending doctor approval and you will be notified once confirmed."
            )
        except ValueError as e:
            return f"Booking failed: {str(e)}. Please choose a different time slot."
        except Exception as e:
            logger.error(f"❌ Voice booking error: {e}")
            return "Something went wrong while booking. Please try again."
    
    # ═══════════════════════════════════════════
    #  CONVERSATION TURN
    # ═══════════════════════════════════════════

    def process_turn(self, messages: list, language_code: str, patient_id: str) -> dict:
        """
        Process one conversation turn through Sarvam AI.
        Injects doctor list and patient context into the conversation.
        """
        if not self.sarvam.is_available():
            return {
                'reply_text': "Voice booking is currently unavailable. Please try the form instead.",
                'booking_confirmed': False,
                'appointment_data': None
            }

        # Provide context: active doctor list + patient name
        doctors = self.appt.get_active_doctors()
        doctor_names = [d.get('full_name', '') for d in doctors if d.get('full_name')]

        tool_callback = self._make_tool_callback(patient_id, language_code=language_code)
        booking_result = {'confirmed': False, 'data': None}

        # Wrap tool_callback to detect when booking is confirmed
        def tracked_callback(tool_name, args):
            result = tool_callback(tool_name, args)
            if tool_name == 'book_appointment' and 'booked successfully' in (result or ''):
                booking_result['confirmed'] = True
                try:
                    appointments = self.appt.get_patient_appointments(patient_id)
                    if appointments:
                        booking_result['data'] = appointments[0]
                except Exception:
                    pass
            return result

        reply_text = self.sarvam.process_conversation(
            messages=messages,
            available_doctors=doctor_names,
            tool_callback=tracked_callback,
            language_code=language_code
        )

        return {
            'reply_text': reply_text,
            'booking_confirmed': booking_result['confirmed'],
            'appointment_data': booking_result['data']
        }

    # ═══════════════════════════════════════════
    #  UTILITY
    # ═══════════════════════════════════════════

    @staticmethod
    def get_supported_languages() -> dict:
        """Return map of supported language codes to their display details."""
        return {
            'en': {'name': 'English', 'display': 'English', 'web_speech': 'en-IN'},
            'hi': {'name': 'Hindi', 'display': 'हिन्दी', 'web_speech': 'hi-IN'},
            'te': {'name': 'Telugu', 'display': 'తెలుగు', 'web_speech': 'te-IN'},
            'kn': {'name': 'Kannada', 'display': 'ಕನ್ನಡ', 'web_speech': 'kn-IN'},
            'ta': {'name': 'Tamil', 'display': 'தமிழ்', 'web_speech': 'ta-IN'},
        }
