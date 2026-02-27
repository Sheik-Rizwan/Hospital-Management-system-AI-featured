# whatsapp_service.py — Production-Ready WhatsApp Booking Engine
# 13-state conversation engine with Sarvam AI voice call, language selection, and hybrid delivery

from datetime import datetime, timedelta
import requests
import os
import json
from mongodb_config import MongoDatabase
from services.appointment_service import AppointmentService
from services.patient_service import PatientService
from services.notification_service import NotificationService
from services.speech_to_text import SpeechToTextRecorder
from services.sarvam_service import SarvamService
from services.local_voice_service import LocalVoiceService
from ai_service import AIService
from logger_config import logger
from services.booking_flow import SmartBookingEngine, BK_IDLE

# Lazy import to avoid circular deps with Flask app context
def _notify_doctor_new_appointment(doctor_id, appointment_data):
    try:
        from services.socket_service import notify_new_appointment
        notify_new_appointment(doctor_id, appointment_data)
    except Exception as e:
        logger.warning(f"Socket notify failed (non-critical): {e}")

try:
    from config.settings import SARVAM_SUPPORTED_LANGUAGES
except ImportError:
    SARVAM_SUPPORTED_LANGUAGES = {}

# ═══════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════

WHATSAPP_TOKEN = os.getenv('WHATSAPP_TOKEN')
PHONE_NUMBER_ID = os.getenv('PHONE_NUMBER_ID')

# ═══════════════════════════════════════════
#  STATE CONSTANTS
# ═══════════════════════════════════════════

STATE_INIT              = 'INIT'
STATE_LANG_SELECT       = 'LANG_SELECT'       # NEW: Language selection state
STATE_REGISTER_NAME     = 'REGISTER_NAME'
STATE_REGISTER_EMAIL    = 'REGISTER_EMAIL'
STATE_MENU              = 'MENU'
STATE_BOOKING_FOR       = 'BOOKING_FOR'
STATE_GUEST_NAME        = 'GUEST_NAME'
STATE_SELECT_SERVICE    = 'SELECT_SERVICE'
STATE_SELECT_DOCTOR     = 'SELECT_DOCTOR'
STATE_SELECT_DATE       = 'SELECT_DATE'
STATE_SELECT_SHIFT      = 'SELECT_SHIFT'
STATE_SELECT_TIME       = 'SELECT_TIME'
STATE_CONFIRM           = 'CONFIRM'
STATE_CHAT              = 'CHAT'
STATE_VOICE_CHAT        = 'VOICE_CHAT'         # NEW: Sarvam voice AI chat

# Voice command mapping
VOICE_COMMANDS = {
    'hi': 'menu',
    'hello': 'menu',
    'menu': 'menu',
    'start': 'menu',
    'reset': 'menu',
}

class WhatsAppService:
    def __init__(self):
        self.db = MongoDatabase().db
        self.appt_service = AppointmentService()
        self.patient_service = PatientService()
        self.notifier = NotificationService()
        self.ai_service = AIService()

        # Sarvam AI Service
        try:
            self.sarvam = SarvamService()
            if self.sarvam.is_available():
                logger.info("✅ Sarvam AI Service initialized successfully")
            else:
                logger.warning("⚠️ Sarvam AI Service initialized but API key missing")
        except Exception as e:
            logger.warning(f"⚠️ Sarvam Service unavailable: {e}")
            self.sarvam = None

        # Local Voice Service (Whisper & MMS)
        try:
            self.local_voice = LocalVoiceService()
            logger.info("✅ Local Voice Service initialized successfully")
        except Exception as e:
            logger.warning(f"⚠️ Local Voice Service initialization failed: {e}")
            self.local_voice = None

        # Legacy STT (Groq Whisper fallback)
        try:
            self.stt = SpeechToTextRecorder()
        except Exception:
            logger.warning("STT Service unavailable — voice messages will be rejected")
            self.stt = None

        # ── Smart Booking Engine (deterministic, no LLM for bookings) ──
        self._booking_engine = SmartBookingEngine(
            appt_service=self.appt_service,
            patient_service=self.patient_service,
            notifier=self.notifier,
            session_manager=self._make_session_manager()
        )

    # ─── Session Manager Adapter for SmartBookingEngine ───
    def _make_session_manager(self):
        """Creates a lightweight adapter so SmartBookingEngine can persist
        its booking_state inside the existing whatsapp_sessions collection."""
        svc = self
        class _SM:
            def transition_to(self, sender_id, data, clear=False):
                """Merge booking data into session.data without touching session.state."""
                if clear:
                    # Clear all booking keys from data
                    svc.db.whatsapp_sessions.update_one(
                        {'sender_id': sender_id},
                        {'$set': {'data.booking_state': 'BK_IDLE', 'updated_at': datetime.now()}},
                        upsert=True
                    )
                else:
                    # Merge booking-related keys into session data
                    set_dict = {'updated_at': datetime.now()}
                    for key, val in (data or {}).items():
                        set_dict[f'data.{key}'] = val
                    svc.db.whatsapp_sessions.update_one(
                        {'sender_id': sender_id},
                        {'$set': set_dict},
                        upsert=True
                    )
        return _SM()

    # ═══════════════════════════════════════════
    #  ENTRY POINT
    # ═══════════════════════════════════════════

    def handle_incoming_message(self, sender_id, message_type, message_content, media_id=None):
        """Process every incoming WhatsApp message."""

        # ── 1. Handle Voice / Audio via Sarvam ──
        if message_type == 'audio':
            session = self._get_session(sender_id)
            current_state = session.get('state', STATE_INIT)
            lang_code = session.get('data', {}).get('language', 'en')

            # Use Sarvam for voice processing if available
            if self.sarvam and self.sarvam.is_available():
                self._handle_sarvam_voice(sender_id, media_id, session)
                return
            else:
                # Fallback to legacy Groq Whisper STT
                message_content = self._handle_voice(sender_id, media_id)
                if message_content is None:
                    return

        if message_content is None:
            return  # safety fallback (e.g. image/sticker)

        # ── 2. Get Session ──
        session = self._get_session(sender_id)
        current_state = session.get('state', STATE_INIT)

        # ── 3. Check Registration (skip if mid-registration or language selection) ──
        if current_state not in [STATE_REGISTER_NAME, STATE_REGISTER_EMAIL, STATE_LANG_SELECT]:
            clean_phone = sender_id.replace('+', '').replace(' ', '')
            if not self.patient_service.is_registered(clean_phone):
                self._transition_to(sender_id, STATE_REGISTER_NAME)
                self.notifier.send_whatsapp_text(
                    sender_id,
                    "👋 Welcome! It looks like you're new here.\n\nPlease enter your *Full Name* to register:"
                )
                return

        # ── 4. Global Reset Commands ──
        #    Only reset to menu if there is NO active booking flow.
        #    This prevents the menu from appearing mid-booking when the
        #    automation or user accidentally sends 'hi' / 'hello', etc.
        text_lower = str(message_content).lower().strip()
        booking_active = session.get('data', {}).get('booking_state', BK_IDLE) != BK_IDLE
        legacy_booking_active = current_state in (
            STATE_SELECT_SERVICE, STATE_SELECT_DOCTOR, STATE_SELECT_DATE,
            STATE_SELECT_SHIFT, STATE_SELECT_TIME, STATE_CONFIRM,
            STATE_BOOKING_FOR, STATE_GUEST_NAME,
        )

        if text_lower in ['hi', 'hello', 'menu', 'reset', 'start']:
            if booking_active or legacy_booking_active:
                # Only honour explicit 'reset' / 'menu' during a booking flow
                if text_lower in ['reset', 'menu']:
                    # Clear booking state as well
                    self.db.whatsapp_sessions.update_one(
                        {'sender_id': sender_id},
                        {'$set': {'data.booking_state': BK_IDLE}}
                    )
                    self._transition_to(sender_id, STATE_MENU, clear_data=True)
                    self._send_main_menu(sender_id)
                    return
                else:
                    # Ignore accidental 'hi'/'hello'/'start' — let the booking flow continue
                    logger.info(f"🚫 Ignoring reset command '{text_lower}' during active booking for {sender_id}")
                    return
            else:
                self._transition_to(sender_id, STATE_MENU, clear_data=True)
                self._send_main_menu(sender_id)
                return

        # ── 4b. Voice call command — trigger language selection + Sarvam voice flow ──
        if text_lower in ['call', 'voice', 'voice call', 'call me', 'phone']:
            self._start_voice_flow(sender_id)
            return

        # ── 4c. Smart Booking Engine — intercept booking/query intents ──
        # This handles: booking flow, doctor queries, slot queries, shift queries.
        # Works in ALL states — booking engine returns False if intent is NONE.
        try:
            if self._booking_engine.try_handle(sender_id, str(message_content), session):
                logger.info(f"📋 SmartBookingEngine handled message from {sender_id}")
                return
        except Exception as e:
            logger.error(f"SmartBookingEngine error: {e}", exc_info=True)
            # If the booking engine was mid-flow, do NOT fall through to
            # the legacy state machine (which may send the main menu).
            if booking_active:
                self.notifier.send_whatsapp_text(
                    sender_id,
                    "⚠️ Something went wrong. Please try again or type *reset* to start over."
                )
                return
            # Otherwise fall through to old state machine

        # ── 5. State Machine (legacy — handles menu, registration, voice, AI chat) ──
        #    Guard: if the booking engine is active (booking_state != BK_IDLE)
        #    but try_handle returned False (shouldn't normally happen), don't let
        #    the legacy machine send the menu.
        if booking_active:
            logger.warning(f"⚠️ Booking engine active but returned False for '{message_content}' from {sender_id}")
            return
        self._process_state(sender_id, current_state, message_content, session)

    # ═══════════════════════════════════════════
    #  STATE MACHINE ROUTING
    # ═══════════════════════════════════════════

    def _process_state(self, sender_id, state, input_text, session):
        data = session.get('data', {})

        # ── INIT ──
        if state == STATE_INIT:
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        # ── LANGUAGE SELECTION (for voice flow) ──
        if state == STATE_LANG_SELECT:
            self._handle_language_selection(sender_id, input_text)
            return

        # ── REGISTRATION ──
        if state == STATE_REGISTER_NAME:
            self._register_name(sender_id, input_text)
            return

        if state == STATE_REGISTER_EMAIL:
            self._register_email(sender_id, input_text, data)
            return

        # ── SARVAM VOICE AI CHAT ──
        if state == STATE_VOICE_CHAT:
            self._handle_sarvam_text_chat(sender_id, input_text, data)
            return

        # ── AI CHAT (legacy Groq) ──
        if state == STATE_CHAT:
            self._handle_ai_chat(sender_id, input_text, data)
            return

        # ── AUTOMATION MENU ──
        if state == STATE_MENU:
            self._handle_menu(sender_id, input_text)
            return

        if state == STATE_BOOKING_FOR:
            self._handle_booking_for(sender_id, input_text)
            return

        if state == STATE_GUEST_NAME:
            self._handle_guest_name(sender_id, input_text)
            return

        if state == STATE_SELECT_SERVICE:
            self._handle_service_selection(sender_id, input_text)
            return

        if state == STATE_SELECT_DOCTOR:
            self._handle_doctor_selection(sender_id, input_text, data)
            return

        if state == STATE_SELECT_DATE:
            self._handle_date_selection(sender_id, input_text, data)
            return

        if state == STATE_SELECT_SHIFT:
            self._handle_shift_selection(sender_id, input_text, data)
            return

        if state == STATE_SELECT_TIME:
            self._handle_time_selection(sender_id, input_text, data)
            return

        if state == STATE_CONFIRM:
            self._handle_confirmation(sender_id, input_text, data)
            return

        # Fallback — only send menu if there is no active booking engine flow
        bk_state = data.get('booking_state', BK_IDLE)
        if bk_state != BK_IDLE:
            logger.warning(f"⚠️ Legacy fallback reached while booking_state={bk_state} for {sender_id}, ignoring menu send")
            return
        self.notifier.send_whatsapp_text(sender_id, "Something went wrong. Sending you back to menu.")
        self._transition_to(sender_id, STATE_MENU, clear_data=True)
        self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  LLM CHAT HANDLER
    # ═══════════════════════════════════════════

    def _handle_ai_chat(self, sender_id, input_text, data):
        # Fetch available constraints for context
        available_services = [s['service_name'] for s in self.appt_service.get_services()]
        available_doctors = [d['full_name'] for d in self.appt_service.get_active_doctors()]

        # Prepare messages array
        messages = data.get('messages', [])
        
        # Add patient context if available
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)
        patient_context = ""
        if patient:
            patient_context = f"The user's registered name is {patient.get('patient_name', 'Unknown')}. \n"
        
        system_message_content = f"Today's date is {datetime.now().strftime('%Y-%m-%d, %A')}. {patient_context}"
        
        if not messages:
             messages.append({"role": "system", "content": system_message_content})

        messages.append({"role": "user", "content": str(input_text)})

        # Callback for tool execution
        def tool_executor(tool_name, tool_args):
            return self._tool_execution_callback(sender_id, tool_name, tool_args, data)

        # Process via AI Service
        ai_response_text = self.ai_service.process_conversation(
            messages=messages,
            available_services=available_services,
            available_doctors=available_doctors,
            tool_callback=tool_executor
        )

        messages.append({"role": "assistant", "content": ai_response_text})

        # Save conversation memory
        data['messages'] = messages[-15:] # Keep last 15 messages max to avoid too large context
        self._transition_to(sender_id, STATE_CHAT, data)

        # Send back to WhatsApp
        self.notifier.send_whatsapp_text(sender_id, ai_response_text)


    def _tool_execution_callback(self, sender_id, tool_name, tool_args, session_data):
        """Executes actual backend functions when LLM calls a tool."""
        try:
            if tool_name == "list_available_doctors":
                date_str = tool_args.get("date")
                specialization = tool_args.get("specialization")

                # Resolve natural date
                if date_str:
                    resolved = self._parse_natural_date(date_str)
                    if resolved:
                        date_str = resolved

                doctors = self.appt_service.get_active_doctors(specialization=specialization)
                if not doctors:
                    return "No active doctors found."

                if date_str:
                    available_doctors = []
                    for doc in doctors:
                        shifts = self.appt_service.get_available_shifts(doc['user_id'], date_str)
                        if shifts:
                            available_doctors.append({
                                'name': doc['full_name'],
                                'specialization': doc.get('specialization', 'General'),
                                'shifts': [s['shift_name'] for s in shifts]
                            })

                    if not available_doctors:
                        return f"No doctors available on {date_str}."

                    # Send visual WhatsApp list
                    items = []
                    for doc in available_doctors[:10]:
                        items.append((
                            f"doc_pick_{doc['name'].replace(' ', '_')}",
                            f"👨‍⚕️ {doc['name']}",
                            f"{doc['specialization']} | {', '.join(doc['shifts'])}"
                        ))
                    self.notifier.send_whatsapp_list(
                        sender_id,
                        f"🏥 Doctors available on {date_str}:",
                        items,
                        title="Available Doctors",
                        button_text="Choose Doctor"
                    )

                    result = f"On {date_str}, these doctors are available:\n"
                    for doc in available_doctors:
                        result += f"- Dr. {doc['name']} ({doc['specialization']}) — {', '.join(doc['shifts'])}\n"
                    return result
                else:
                    # No date — list all
                    items = []
                    for doc in doctors[:10]:
                        items.append((
                            f"doc_pick_{doc['full_name'].replace(' ', '_')}",
                            f"👨‍⚕️ {doc['full_name']}",
                            doc.get('specialization', 'General')
                        ))
                    self.notifier.send_whatsapp_list(
                        sender_id,
                        "🏥 Our available doctors:",
                        items,
                        title="Doctors",
                        button_text="Choose Doctor"
                    )
                    result = "Our available doctors:\n"
                    for doc in doctors[:10]:
                        result += f"- Dr. {doc['full_name']} ({doc.get('specialization', 'General')})\n"
                    return result

            elif tool_name == "check_availability":
                doctor_name = tool_args.get("doctor_name")
                date_str = tool_args.get("date")
                time_str = tool_args.get("time")

                # Resolve natural date
                if date_str:
                    resolved = self._parse_natural_date(date_str)
                    if resolved:
                        date_str = resolved

                # Match Doctor
                doctor_clean = doctor_name.lower().replace('dr.', '').replace('doctor', '').strip()
                doctors = self.appt_service.get_active_doctors()
                matched_doctor = next((d for d in doctors if doctor_clean in d['full_name'].lower()), None)

                if not matched_doctor:
                    return f"Doctor '{doctor_name}' not found."

                doctor_id = matched_doctor['user_id']
                
                # Check specifics
                if not date_str:
                    return "You must provide a date to check availability."
                
                try:
                    # Validate date YYYY-MM-DD
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                except ValueError:
                    # Try resolving natural language via appt_service directly if we had a natural date parser
                    # But the LLM is instructed to generate YYYY-MM-DD.
                    return f"Invalid date. Ask the user for a valid Date."
                
                # Let's get shifts and slots
                shifts = self.appt_service.get_available_shifts(doctor_id, date_str)
                if not shifts:
                     return f"Dr. {matched_doctor['full_name']} has no available shifts on {date_str}."

                all_slots = []
                for s in shifts:
                    slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                    if slots:
                        all_slots.extend([slot['start'] for slot in slots])
                
                if not all_slots:
                     return f"All slots are booked for Dr. {matched_doctor['full_name']} on {date_str}."

                if time_str:
                    if time_str in all_slots:
                         return f"Yes, {time_str} is available on {date_str} with Dr. {matched_doctor['full_name']}."
                    else:
                         # Return alternative times
                         return f"No, {time_str} is NOT available. However, these slots are available: {', '.join(all_slots[:5])}..."
                else:
                     return f"Available slots on {date_str} for Dr. {matched_doctor['full_name']} are: {', '.join(all_slots[:10])}..."

            elif tool_name == "book_appointment":
                patient_name_input = tool_args.get("patient_name")
                doctor_name = tool_args.get("doctor_name")
                date_str = tool_args.get("date")
                time_str = tool_args.get("time")

                # Resolve natural date/time
                if date_str:
                    resolved = self._parse_natural_date(date_str)
                    if resolved:
                        date_str = resolved
                if time_str:
                    time_str = self._parse_natural_time(time_str)

                # Match Doctor
                doctor_clean = doctor_name.lower().replace('dr.', '').replace('doctor', '').strip()
                doctors = self.appt_service.get_active_doctors()
                matched_doctor = next((d for d in doctors if doctor_clean in d['full_name'].lower()), None)
                if not matched_doctor:
                     return f"Error: Cannot book. Doctor '{doctor_name}' not found."

                # Determine Patient Details
                clean_phone = sender_id.replace('+', '').replace(' ', '')
                patient_rec = self.patient_service.get_patient_by_phone(clean_phone)
                
                if not patient_rec:
                    return "Error: Patient not registered properly."
                
                patient_id = patient_rec['patient_id']
                booked_for_name = patient_rec.get('patient_name', 'Unknown')
                
                if patient_name_input.lower() not in ['self', '', 'me', booked_for_name.lower()]:
                    booked_for_name = patient_name_input # Booking for someone else under this phone
                    
                # Calculate end time (assume 30 min)
                dt_time = datetime.strptime(time_str, "%H:%M")
                end_time_str = (dt_time + timedelta(minutes=30)).strftime("%H:%M")
                
                # Book it!
                success = self.appt_service.book_appointment({
                    'patient_id': patient_id,
                    'patient_name': booked_for_name,
                    'doctor_id': matched_doctor['user_id'],
                    'date': date_str,
                    'start_time': time_str,
                    'end_time': end_time_str,
                    'status': 'pending_doctor_approval',
                    'created_by': 'whatsapp_ai',
                    'created_by_id': sender_id,
                    'notes': f"Booked via AI Assistant for {booked_for_name}"
                })
                
                if success:
                     # Notify doctor via socket so dashboard updates in real-time
                     _notify_doctor_new_appointment(matched_doctor['user_id'], success)
                     # Clear memory so next chat is fresh
                     session_data['messages'] = []
                     self._transition_to(sender_id, STATE_CHAT, session_data)
                     return "SUCCESS. The appointment has been booked. Inform the user of the final details."
                else:
                     return "FAILED to book appointment. There was a system error or slot conflict. Ask user to try another time."

            else:
                return f"Error: Tool '{tool_name}' is not recognized."

        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return f"System Error while checking: {e}"

    # ═══════════════════════════════════════════
    #  REGISTRATION HANDLERS
    # ═══════════════════════════════════════════

    def _register_name(self, sender_id, name):
        self._transition_to(sender_id, STATE_REGISTER_EMAIL, {'temp_name': name})
        self.notifier.send_whatsapp_text(
            sender_id,
            f"Nice to meet you, {name}! 😊\n\nPlease enter your *Email Address*:"
        )

    def _register_email(self, sender_id, email, data):
        # Basic email validation
        if '@' not in email or '.' not in email:
            self.notifier.send_whatsapp_text(sender_id, "⚠️ Please enter a valid email address (e.g. name@example.com):")
            return

        phone = sender_id.replace('+', '').replace(' ', '')
        name = data.get('temp_name', 'Guest')

        # Save to users collection (WhatsApp users)
        user_data = {
            'phone': phone,
            'name': name,
            'email': email,
            'registered_at': datetime.now()
        }
        self.db.wa_users.update_one(
            {'phone': phone},
            {'$set': user_data},
            upsert=True
        )

        # Also create patient record for appointment linking
        db_patient, plain_pwd = self.patient_service.create_patient_from_whatsapp(phone, name)
        patient_id = db_patient.get('patient_id', f"wa_{phone}")

        msg = (
            "✅ *Registration Complete!*\n\n"
            "You can now access our Patient Web Dashboard to view your appointments and details.\n\n"
            f"🔹 *Login ID:* {patient_id}\n"
            f"🔹 *Password:* {plain_pwd}\n\n"
            "Please save these details. You can change your password in the dashboard."
        )

        self.notifier.send_whatsapp_text(sender_id, msg)
        self._transition_to(sender_id, STATE_MENU, clear_data=True)
        self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  MENU HANDLER
    # ═══════════════════════════════════════════

    def _handle_menu(self, sender_id, input_text):
        action = input_text.strip().lower()

        if action == 'book_appointment':
            self._transition_to(sender_id, STATE_BOOKING_FOR, clear_data=True)
            self.notifier.send_whatsapp_buttons(
                sender_id,
                "Who is this appointment for?",
                ["Myself", "Someone Else"],
                ["book_self", "book_other"]
            )
        elif action == 'check_appointments':
            self._check_appointments(sender_id)
        elif action == 'list_services':
            self._list_services(sender_id)
        elif action in ['voice_booking', 'voice', 'call']:
            self._start_voice_flow(sender_id)
        else:
            self.notifier.send_whatsapp_text(sender_id, "Please select an option from the menu.")
            self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  BOOKING FOR (SELF / OTHER)
    # ═══════════════════════════════════════════

    def _handle_booking_for(self, sender_id, input_text):
        text = input_text.strip().lower()
        
        if text == 'book_self' or any(w in text for w in ['myself', 'me', 'self']):
            # Get user's own name
            clean_phone = sender_id.replace('+', '').replace(' ', '')
            patient = self.patient_service.get_patient_by_phone(clean_phone)
            patient_name = patient.get('patient_name', 'You') if patient else 'You'

            self._transition_to(sender_id, STATE_SELECT_SERVICE, {
                'booked_for': 'self',
                'patient_name': patient_name
            })
            self._send_service_list(sender_id)

        elif text == 'book_other' or any(w in text for w in ['other', 'someone', 'else']):
            self._transition_to(sender_id, STATE_GUEST_NAME)
            self.notifier.send_whatsapp_text(sender_id, "Please enter the *Patient's Full Name*:")

        else:
            self.notifier.send_whatsapp_text(sender_id, "Please select *Myself* or *Someone Else*.")
            self.notifier.send_whatsapp_buttons(
                sender_id,
                "Who is this appointment for?",
                ["Myself", "Someone Else"],
                ["book_self", "book_other"]
            )

    def _handle_guest_name(self, sender_id, patient_name):
        self._transition_to(sender_id, STATE_SELECT_SERVICE, {
            'booked_for': 'other',
            'patient_name': patient_name
        })
        self.notifier.send_whatsapp_text(sender_id, f"📝 Booking for: *{patient_name}*")
        self._send_service_list(sender_id)

    # ═══════════════════════════════════════════
    #  SERVICE SELECTION
    # ═══════════════════════════════════════════

    def _send_service_list(self, sender_id):
        services = self.appt_service.get_services()
        if not services:
            self.notifier.send_whatsapp_text(sender_id, "No services available at the moment.")
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        items = []
        for svc in services[:10]:
            items.append((
                f"svc_{svc['service_id']}",
                svc['service_name'][:24],
                f"{svc.get('duration_minutes', 30)} min"
            ))

        self.notifier.send_whatsapp_list(
            sender_id,
            "🏥 Select a Service:",
            items,
            title="Services",
            button_text="View Services"
        )

    def _handle_service_selection(self, sender_id, selection_id):
        service_id = None
        
        # Check if it's a list selection
        if selection_id.startswith('svc_'):
            service_id = selection_id.replace('svc_', '', 1)
        else:
            # Try to match text input to a service name
            # Remove punctuation and extra spaces
            import string
            input_clean = selection_id.translate(str.maketrans('', '', string.punctuation)).strip().lower()
            
            services = self.appt_service.get_services()
            service_names = [s['service_name'] for s in services]
            logger.info(f"🔎 fuzzy match input='{input_clean}' against {service_names}")
            
            # Exact/Partial match on service name
            matched = next((s for s in services if s['service_name'].lower().strip() == input_clean or input_clean in s['service_name'].lower() or s['service_name'].lower().strip() in input_clean), None)
            
            if matched:
                service_id = matched['service_id']
        
        if not service_id:
            self.notifier.send_whatsapp_text(sender_id, "Invalid selection. Please pick from the list.")
            self._send_service_list(sender_id)
            return

        service = self.appt_service.get_service_by_id(service_id)

        if not service:
            self.notifier.send_whatsapp_text(sender_id, "Service not found.")
            return

        # Find doctors for this service
        doctors = self.appt_service.get_doctors_by_service(service_id)

        if not doctors:
            self.notifier.send_whatsapp_text(
                sender_id,
                f"No doctors available for *{service['service_name']}*. Please try another service."
            )
            self._send_service_list(sender_id)
            return

        self._transition_to(sender_id, STATE_SELECT_DOCTOR, {
            'service_id': service_id,
            'service_name': service['service_name']
        })
        self._send_doctor_list(sender_id, doctors)

    # ═══════════════════════════════════════════
    #  DOCTOR SELECTION
    # ═══════════════════════════════════════════

    def _send_doctor_list(self, sender_id, doctors):
        items = []
        for doc in doctors[:10]:
            name_clean = doc['full_name'].replace('Dr.', '').replace('dr.', '').strip()
            doc_label = f"Dr. {name_clean}"
            spec = doc.get('specialization', '')
            items.append((f"doc_{doc['user_id']}", doc_label[:24], spec[:72]))

        self.notifier.send_whatsapp_list(
            sender_id,
            "👨‍⚕️ Select a Doctor:",
            items,
            title="Doctors"
        )

    def _handle_doctor_selection(self, sender_id, selection_id, data=None):
        doctor_id = None
        
        if selection_id.startswith('doc_'):
            doctor_id = selection_id.replace('doc_', '', 1)
        else:
            # Try to match text input to a doctor name
            input_clean = selection_id.lower().replace('dr.', '').replace('doctor', '').strip()
            
            # Use service_id from data to narrow down search if possible
            service_id = data.get('service_id') if data else None
            
            if service_id:
                potential_doctors = self.appt_service.get_doctors_by_service(service_id)
            else:
                potential_doctors = self.appt_service.get_active_doctors()

            # Exact/Partial match on name
            matched = next((d for d in potential_doctors if 
                input_clean in d['full_name'].lower() or 
                d['full_name'].lower() in input_clean
            ), None)
            
            if matched:
                doctor_id = matched['user_id']

        if not doctor_id:
            self.notifier.send_whatsapp_text(sender_id, "Invalid selection. Please pick a doctor from the list.")
            # Re-send the doctor list so the user can try again
            service_id = (data or {}).get('service_id')
            if service_id:
                doctors = self.appt_service.get_doctors_by_service(service_id)
                if doctors:
                    self._send_doctor_list(sender_id, doctors)
            return

        doctor = self.appt_service.get_doctor_by_id(doctor_id)

        if not doctor:
            self.notifier.send_whatsapp_text(sender_id, "Doctor not found.")
            return

        self._transition_to(sender_id, STATE_SELECT_DATE, {
            'doctor_id': doctor_id,
            'doctor_name': doctor['full_name']
        })
        self._send_available_dates(sender_id, doctor_id, doctor['full_name'])

    # ═══════════════════════════════════════════
    #  DATE SELECTION
    # ═══════════════════════════════════════════

    def _send_available_dates(self, sender_id, doctor_id, doctor_name):
        available = self.appt_service.get_doctor_available_dates(doctor_id, num_dates=10)

        if not available:
            self.notifier.send_whatsapp_text(
                sender_id,
                f"No available dates for Dr. {doctor_name}. Please try another doctor."
            )
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        items = []
        for d in available:
            shift_str = ', '.join(d.get('shifts', []))
            display = f"{d['display']} ({shift_str})" if shift_str else d['display']
            items.append((
                f"date_{d['date']}",
                display[:24],
                d['date']
            ))

        self.notifier.send_whatsapp_list(
            sender_id,
            f"📅 Dr. {doctor_name}\nSelect an available date:",
            items,
            title="Available Dates"
        )

    def _parse_natural_date(self, text):
        """
        Resolve natural language date text to YYYY-MM-DD without requiring a doctor.
        Handles: today, tomorrow, day after tomorrow, weekday names, 'feb 21', YYYY-MM-DD pass-through.
        """
        import re as _re
        text_lower = text.lower().strip()
        today = datetime.now()

        # Already in YYYY-MM-DD format
        try:
            datetime.strptime(text_lower, '%Y-%m-%d')
            return text_lower
        except ValueError:
            pass

        # Relative
        if text_lower in ['today', 'aaj', 'آج']:
            return today.strftime('%Y-%m-%d')
        if text_lower in ['tomorrow', 'kal', 'کل', 'demain']:
            return (today + timedelta(days=1)).strftime('%Y-%m-%d')
        if text_lower in ['day after tomorrow', 'परसों', 'parson']:
            return (today + timedelta(days=2)).strftime('%Y-%m-%d')

        # "in N days"
        m = _re.search(r'in\s+(\d+)\s+days?', text_lower)
        if m:
            return (today + timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d')

        # Day names → next occurrence
        day_names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for i, day_name in enumerate(day_names):
            if day_name in text_lower:
                days_ahead = (i - today.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7  # Next week same day
                return (today + timedelta(days=days_ahead)).strftime('%Y-%m-%d')

        # Month + day: "feb 21", "21 feb", "february 21"
        month_map = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
            'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
            'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'oct': 10, 'october': 10,
            'nov': 11, 'november': 11, 'dec': 12, 'december': 12
        }
        for month_name, month_num in month_map.items():
            if month_name in text_lower:
                day_match = _re.search(r'(\d{1,2})', text_lower)
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

        return None  # Could not resolve

    def _parse_natural_time(self, text):
        """
        Resolve natural language time to HH:MM (24h) format.
        Handles: '9am', '9:30am', '14:00', '2pm', '9 AM', etc.
        """
        import re as _re
        text_clean = text.strip().lower().replace(' ', '')

        # Already HH:MM
        m = _re.match(r'^(\d{1,2}):(\d{2})$', text_clean)
        if m:
            h, mn = int(m.group(1)), int(m.group(2))
            return f"{h:02d}:{mn:02d}"

        # 12h format: 9am, 9:30am, 2pm, 2:30pm
        m = _re.match(r'^(\d{1,2})(?::(\d{2}))?([ap]m)$', text_clean)
        if m:
            h = int(m.group(1))
            mn = int(m.group(2)) if m.group(2) else 0
            period = m.group(3)
            if period == 'pm' and h != 12:
                h += 12
            if period == 'am' and h == 12:
                h = 0
            return f"{h:02d}:{mn:02d}"

        # Just a number
        m = _re.match(r'^(\d{1,2})$', text_clean)
        if m:
            h = int(m.group(1))
            return f"{h:02d}:00"

        return text  # Return as-is if can't parse

    def _resolve_natural_date(self, text, doctor_id):
        """Resolve natural language date text to YYYY-MM-DD by matching available dates."""
        text_lower = text.lower().strip()
        
        # Get available dates for this doctor
        available = self.appt_service.get_doctor_available_dates(doctor_id, num_dates=10)
        if not available:
            return None
        
        available_dates = [d['date'] for d in available]  # ['2026-02-19', '2026-02-20', ...]
        
        # Relative dates
        today = datetime.now()
        if text_lower in ['today', 'aaj', 'آج']:
            candidate = today.strftime('%Y-%m-%d')
            return candidate if candidate in available_dates else None
        if text_lower in ['tomorrow', 'kal', 'کل']:
            candidate = (today + timedelta(days=1)).strftime('%Y-%m-%d')
            return candidate if candidate in available_dates else None
        
        # Day names: "saturday", "on saturday", "monday"
        day_names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for day_name in day_names:
            if day_name in text_lower:
                for date_str in available_dates:
                    dt = datetime.strptime(date_str, '%Y-%m-%d')
                    if dt.strftime('%A').lower() == day_name:
                        return date_str
                return None
        
        # Month + day: "february 21", "feb 21", "21 february"
        import re
        month_map = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
            'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
            'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'oct': 10, 'october': 10,
            'nov': 11, 'november': 11, 'dec': 12, 'december': 12
        }
        # Match "month day" or "day month"
        for month_name, month_num in month_map.items():
            if month_name in text_lower:
                day_match = re.search(r'(\d{1,2})', text_lower)
                if day_match:
                    day = int(day_match.group(1))
                    year = today.year
                    try:
                        candidate = datetime(year, month_num, day).strftime('%Y-%m-%d')
                        if candidate in available_dates:
                            return candidate
                    except ValueError:
                        pass
                break
        
        # Just a number (e.g. "21") — match against available dates' day
        num_match = re.match(r'^\s*(\d{1,2})\s*$', text_lower)
        if num_match:
            day = int(num_match.group(1))
            for date_str in available_dates:
                dt = datetime.strptime(date_str, '%Y-%m-%d')
                if dt.day == day:
                    return date_str
        
        return None

    def _handle_date_selection(self, sender_id, input_text, data):
        if input_text.startswith('date_'):
            date_str = input_text.replace('date_', '', 1)
        else:
            date_str = input_text.strip()

        # Validate format — if not YYYY-MM-DD, try natural language parsing
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            # Try natural language date resolution
            resolved = self._resolve_natural_date(date_str, data.get('doctor_id', ''))
            if resolved:
                logger.info(f"📅 Resolved natural date '{date_str}' → {resolved}")
                date_str = resolved
            else:
                self.notifier.send_whatsapp_text(sender_id, "Invalid date. Please select from the list.")
                self._send_available_dates(sender_id, data.get('doctor_id', ''), data.get('doctor_name', ''))
                return


        # Get available shifts
        shifts = self.appt_service.get_available_shifts(data['doctor_id'], date_str)

        if not shifts:
            self.notifier.send_whatsapp_text(
                sender_id,
                f"No available shifts on {date_str}. Try another date."
            )
            self._send_available_dates(sender_id, data['doctor_id'], data.get('doctor_name', ''))
            return

        self._transition_to(sender_id, STATE_SELECT_SHIFT, {'date': date_str})

        # Send shift options
        if len(shifts) <= 3:
            # Use buttons for ≤3 shifts
            btn_titles = [f"{s['shift_name']} ({s['free_slots']} slots)" for s in shifts]
            btn_ids = [f"shift_{s['start']}_{s['end']}" for s in shifts]
            self.notifier.send_whatsapp_buttons(
                sender_id,
                f"🕐 Select a shift for {date_str}:",
                btn_titles[:3],
                btn_ids[:3]
            )
        else:
            # Use list for >3 shifts
            items = []
            for s in shifts:
                items.append((
                    f"shift_{s['start']}_{s['end']}",
                    f"{s['shift_name']}",
                    f"{s['start']}–{s['end']} ({s['free_slots']} slots)"
                ))
            self.notifier.send_whatsapp_list(
                sender_id,
                f"🕐 Select a shift for {date_str}:",
                items,
                title="Shifts"
            )

    # ═══════════════════════════════════════════
    #  SHIFT SELECTION
    # ═══════════════════════════════════════════

    def _handle_shift_selection(self, sender_id, input_text, data):
        if input_text.startswith('shift_'):
            # Button/list selection — parse directly
            pass
        else:
            # Fuzzy match text input to a shift name (e.g. "Morning", "Morning slots", "Night")
            text_clean = input_text.lower().strip()
            # Remove common filler words
            for filler in ['slots', 'slot', 'shift', 'please', 'select', 'pick', 'the']:
                text_clean = text_clean.replace(filler, '').strip()

            shifts = self.appt_service.get_available_shifts(data.get('doctor_id', ''), data.get('date', ''))
            if shifts:
                matched_shift = next(
                    (s for s in shifts if s['shift_name'].lower() in text_clean or text_clean in s['shift_name'].lower()),
                    None
                )
                if matched_shift:
                    input_text = f"shift_{matched_shift['start']}_{matched_shift['end']}"
                    logger.info(f"🕐 Fuzzy matched shift '{text_clean}' → {matched_shift['shift_name']}")

            if not input_text.startswith('shift_'):
                self.notifier.send_whatsapp_text(sender_id, "Invalid selection. Please pick a shift.")
                return

        parts = input_text.replace('shift_', '', 1).split('_')
        if len(parts) != 2:
            self.notifier.send_whatsapp_text(sender_id, "Invalid shift format.")
            return

        shift_start, shift_end = parts
        shift_name = self.appt_service._classify_shift(shift_start)

        # Get free slots for this shift
        slots = self.appt_service.get_shift_slots(
            data['doctor_id'], data['date'], shift_start, shift_end
        )

        if not slots:
            self.notifier.send_whatsapp_text(
                sender_id,
                "No slots available for this shift. Try another."
            )
            # Re-send shifts
            shifts = self.appt_service.get_available_shifts(data['doctor_id'], data['date'])
            if shifts:
                if len(shifts) <= 3:
                    btn_titles = [f"{s['shift_name']} ({s['free_slots']} slots)" for s in shifts]
                    btn_ids = [f"shift_{s['start']}_{s['end']}" for s in shifts]
                    self.notifier.send_whatsapp_buttons(sender_id, "Select a shift:", btn_titles[:3], btn_ids[:3])
                else:
                    items = [(f"shift_{s['start']}_{s['end']}", s['shift_name'], f"{s['free_slots']} slots") for s in shifts]
                    self.notifier.send_whatsapp_list(sender_id, "Select a shift:", items, title="Shifts")
            return

        self._transition_to(sender_id, STATE_SELECT_TIME, {
            'shift': shift_name,
            'shift_start': shift_start,
            'shift_end': shift_end
        })

        # ── Text message with ALL slots (no limit) ──
        msg_lines = [
            f"⏰ *Available Slots ({len(slots)}) — {shift_name} shift*",
            f"Dr. {data.get('doctor_name', '?')} | {data['date']}\n",
        ]
        for i, slot in enumerate(slots, 1):
            msg_lines.append(f"  {i}. {slot['start']} – {slot['end']}")
        msg_lines.append("\nReply with a *number* or *time* (e.g. '9 AM').")
        self.notifier.send_whatsapp_text(sender_id, '\n'.join(msg_lines))

        # ── Interactive list (WhatsApp max 10 rows) ──
        items = []
        for slot in slots[:10]:
            items.append((
                f"time_{slot['start']}",
                f"🕐 {slot['start']}",
                f"{slot['start']} – {slot['end']}"
            ))

        list_header = (
            f"⏰ Available slots ({shift_name} shift)\n"
            f"Dr. {data.get('doctor_name', '?')} | {data['date']}"
        )
        if len(slots) > 10:
            list_header += f"\nTap for slots 1-10. For 11-{len(slots)}, reply with the number."
        self.notifier.send_whatsapp_list(
            sender_id,
            list_header,
            items,
            title="Time Slots"
        )

    # ═══════════════════════════════════════════
    #  TIME SELECTION
    # ═══════════════════════════════════════════

    def _handle_time_selection(self, sender_id, input_text, data):
        if input_text.startswith('time_'):
            # Button/list selection — parse directly
            pass
        else:
            # Fuzzy match voice/text input like "7 am", "7:00", "7", "seven am" to available slots
            import re
            text_clean = input_text.lower().strip()

            # Get available slots to match against
            slots = self.appt_service.get_shift_slots(
                data['doctor_id'], data['date'], data['shift_start'], data['shift_end']
            )
            free_times = [s['start'] for s in slots]  # e.g. ['07:00', '07:30', '08:00']

            # Word-to-number map for spoken numbers
            word_nums = {
                'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
                'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12
            }

            # Try to extract hour (and optional minutes) from input
            matched_time = None

            # Pattern: "7:30 am", "7:30 pm", "7:30"
            m = re.search(r'(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|a\.m|p\.m)?', text_clean)
            if m:
                hour, minute = int(m.group(1)), int(m.group(2))
                period = (m.group(3) or '').replace('.', '')
                if period == 'pm' and hour != 12:
                    hour += 12
                elif period == 'am' and hour == 12:
                    hour = 0
                matched_time = f"{hour:02d}:{minute:02d}"

            # Pattern: "7 am", "7am", "7 pm", "7pm", or just "7"
            if not matched_time:
                m = re.search(r'(\d{1,2})\s*(am|pm|a\.m|p\.m)?', text_clean)
                if m:
                    hour = int(m.group(1))
                    period = (m.group(2) or '').replace('.', '')
                    if period == 'pm' and hour != 12:
                        hour += 12
                    elif period == 'am' and hour == 12:
                        hour = 0
                    matched_time = f"{hour:02d}:00"

            # Pattern: word numbers like "seven", "seven am"
            if not matched_time:
                for word, num in word_nums.items():
                    if word in text_clean:
                        hour = num
                        if 'pm' in text_clean or 'p.m' in text_clean:
                            if hour != 12:
                                hour += 12
                        elif 'am' in text_clean or 'a.m' in text_clean:
                            if hour == 12:
                                hour = 0
                        matched_time = f"{hour:02d}:00"
                        break

            if matched_time and matched_time in free_times:
                input_text = f"time_{matched_time}"
                logger.info(f"⏰ Fuzzy matched time '{text_clean}' → {matched_time}")
            elif matched_time:
                # Try closest match (e.g. user says "7" but slot is "07:00")
                closest = next((t for t in free_times if t.startswith(matched_time[:2] + ':')), None)
                if closest:
                    input_text = f"time_{closest}"
                    logger.info(f"⏰ Closest time match '{text_clean}' → {closest}")

            if not input_text.startswith('time_'):
                self.notifier.send_whatsapp_text(sender_id, "Invalid selection. Please pick a time slot.")
                return

        time_str = input_text.replace('time_', '', 1)

        # Double-check availability (concurrency guard)
        slots = self.appt_service.get_shift_slots(
            data['doctor_id'], data['date'], data['shift_start'], data['shift_end']
        )
        free_times = [s['start'] for s in slots]

        if time_str not in free_times:
            self.notifier.send_whatsapp_text(
                sender_id,
                "⚠️ That slot was just taken! Please select another."
            )
            # Re-send the shift slots
            self._handle_shift_selection(
                sender_id,
                f"shift_{data['shift_start']}_{data['shift_end']}",
                data
            )
            return

        # Calculate end time from slot_duration
        matched_slot = next((s for s in slots if s['start'] == time_str), None)
        end_time = matched_slot['end'] if matched_slot else (
            datetime.strptime(time_str, '%H:%M') + timedelta(minutes=30)
        ).strftime('%H:%M')

        self._transition_to(sender_id, STATE_CONFIRM, {'time': time_str, 'end_time': end_time})

        patient_name = data.get('patient_name', 'You')
        booked_for = data.get('booked_for', 'self')

        summary = (
            f"*📋 Confirm Booking?*\n\n"
            f"👤 Patient: {patient_name}\n"
            f"🏥 Service: {data.get('service_name', '—')}\n"
            f"👨‍⚕️ Doctor: Dr. {data.get('doctor_name', '—')}\n"
            f"📅 Date: {data['date']}\n"
            f"🕐 Shift: {data.get('shift', '—')}\n"
            f"⏰ Time: {time_str} – {end_time}\n\n"
            f"_Please arrive 10 minutes early._"
        )
        self.notifier.send_whatsapp_buttons(sender_id, summary, ["✅ Confirm", "❌ Cancel"], ["confirm_yes", "confirm_no"])

    # ═══════════════════════════════════════════
    #  CONFIRMATION
    # ═══════════════════════════════════════════

    def _handle_confirmation(self, sender_id, response_id, data):
        text_lower = response_id.lower().strip()

        # Match positive confirmation via button ID or natural language
        confirm_words = ['confirm_yes', 'yes', 'ya', 'yeah', 'yep', 'ok', 'okay',
                         'confirm', 'haan', 'haa', 'ha', 'sure', 'book', 'done', 'proceed']
        cancel_words = ['confirm_no', 'no', 'nah', 'nahi', 'cancel', 'nope', 'stop', 'abort']

        is_confirm = any(w in text_lower for w in confirm_words)
        is_cancel = any(w in text_lower for w in cancel_words)

        # If both match, prefer cancel (explicit cancellation is intentional)
        if is_cancel:
            self.notifier.send_whatsapp_text(sender_id, "Booking cancelled.")
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        if not is_confirm:
            # Unrecognized input — ask again instead of cancelling
            self.notifier.send_whatsapp_text(
                sender_id,
                "Please reply *Confirm* or *Cancel*."
            )
            return

        # Resolve patient
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)
        patient_id = patient['patient_id'] if patient else f"wa_{clean_phone}"
        patient_name = data.get('patient_name', patient.get('patient_name', '?') if patient else '?')

        try:
            new_appt = self.appt_service.book_appointment({
                'patient_id': patient_id,
                'patient_name': patient_name,
                'doctor_id': data['doctor_id'],
                'service_id': data.get('service_id', ''),
                'service_name': data.get('service_name', ''),
                'date': data['date'],
                'shift': data.get('shift', ''),
                'start_time': data['time'],
                'end_time': data.get('end_time', ''),
                'status': 'pending_doctor_approval',
                'booked_for': data.get('booked_for', 'self'),
                'created_by': 'whatsapp',
                'created_by_id': sender_id
            })

            appt_id = new_appt.get('appointment_id', '—')

            confirm_msg = (
                f"✅ *Appointment Booked!*\n\n"
                f"🆔 ID: {appt_id}\n"
                f"👤 Patient: {patient_name}\n"
                f"🏥 Service: {data.get('service_name', '—')}\n"
                f"👨‍⚕️ Doctor: Dr. {data.get('doctor_name', '—')}\n"
                f"📅 Date: {data['date']}\n"
                f"🕐 Shift: {data.get('shift', '—')}\n"
                f"⏰ Time: {data['time']} – {data.get('end_time', '')}\n\n"
                f"⏳ Status: Pending Doctor Approval\n"
                f"_You will receive a notification once confirmed._"
            )
            self.notifier.send_whatsapp_text(sender_id, confirm_msg)
            # Notify doctor in real-time via socket so dashboard updates instantly
            _notify_doctor_new_appointment(new_appt.get('doctor_id', ''), new_appt)

        except Exception as e:
            logger.error(f"Booking failed: {e}")
            self.notifier.send_whatsapp_text(sender_id, f"❌ Booking Failed: {str(e)}")

        self._transition_to(sender_id, STATE_MENU, clear_data=True)
        self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  CHECK APPOINTMENTS
    # ═══════════════════════════════════════════

    def _check_appointments(self, sender_id):
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)

        if not patient:
            self.notifier.send_whatsapp_text(sender_id, "No patient record found.")
            self._send_main_menu(sender_id)
            return

        appts = self.appt_service.get_patient_appointments(patient['patient_id'])

        if not appts:
            self.notifier.send_whatsapp_text(sender_id, "📭 No upcoming appointments found.")
        else:
            msg = "*📅 Your Upcoming Appointments:*\n\n"
            for a in appts:
                icon = {"pending_doctor_approval": "⏳", "confirmed": "✅", "rejected": "❌"}.get(a['status'], "❓")
                doc_name = a.get('doctor_name', '?')
                msg += (
                    f"{icon} *{a['date']}* at {a['start_time']}\n"
                    f"   Dr. {doc_name} | {a.get('service_name', '')}\n"
                    f"   Status: {a['status']}\n"
                    f"   ID: {a['appointment_id']}\n\n"
                )
            self.notifier.send_whatsapp_text(sender_id, msg)

        self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  LIST SERVICES
    # ═══════════════════════════════════════════

    def _list_services(self, sender_id):
        services = self.appt_service.get_services()
        if not services:
            self.notifier.send_whatsapp_text(sender_id, "No services available.")
            self._send_main_menu(sender_id)
            return

        msg = "*🏥 Our Services:*\n\n"
        for i, svc in enumerate(services, 1):
            msg += f"{i}. {svc['service_name']} ({svc.get('duration_minutes', 30)} min)\n"

        self.notifier.send_whatsapp_text(sender_id, msg)
        self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  MAIN MENU
    # ═══════════════════════════════════════════

    def _send_main_menu(self, sender_id):
        # Use list message to fit 4+ options (buttons limited to 3)
        items = [
            ("book_appointment", "📅 Book Appointment", "Book a new appointment"),
            ("check_appointments", "🔍 Check Appointments", "View upcoming appointments"),
            ("list_services", "🏥 Services", "Browse available services"),
            ("voice_booking", "🎤 Voice Booking", "Book via voice in your language"),
        ]
        self.notifier.send_whatsapp_list(
            sender_id,
            "👋 How can I help you today?",
            items,
            title="Menu Options",
            button_text="Select Option"
        )

    # ═══════════════════════════════════════════
    #  VOICE / STT
    # ═══════════════════════════════════════════

    def _handle_voice(self, sender_id, media_id):
        """
        Download & transcribe a WhatsApp voice message.
        Returns the mapped command string, or None on failure.
        """
        if not self.stt:
            self.notifier.send_whatsapp_text(sender_id, "⚠️ Voice messages are not supported. Please use text.")
            return None

        if not media_id:
            self.notifier.send_whatsapp_text(sender_id, "⚠️ Failed to process voice note. Please try text.")
            return None

        try:
            self.notifier.send_whatsapp_text(sender_id, "🎤 Processing your voice message...")
            audio_path = self._download_media(media_id)

            if not audio_path:
                self.notifier.send_whatsapp_text(sender_id, "⚠️ Could not download audio. Please try text.")
                return None

            transcribed = self.stt.transcribe_audio_file(audio_path)

            # Clean up temp file
            try:
                os.remove(audio_path)
            except Exception:
                pass

            if not transcribed:
                self.notifier.send_whatsapp_text(sender_id, "⚠️ Could not understand audio. Please try again or use text.")
                return None

            logger.info(f"📝 Transcribed: '{transcribed}'")
            self.notifier.send_whatsapp_text(sender_id, f"📝 I heard: \"{transcribed}\"")

            # Map to command
            text_lower = transcribed.lower().strip()
            for phrase, cmd in VOICE_COMMANDS.items():
                if phrase in text_lower:
                    return cmd

            # Fallback to AI Intent Extraction with enhanced for-whom detection
            logger.info(f"🤔 keyphrase miss. Asking AI for intent from: '{transcribed}'")
            
            # Fetch services context for AI
            services = self.appt_service.get_services()
            service_names = [s['service_name'] for s in services]
            
            # Fetch doctor context if applicable (for Urdu/Hindi/Arabic matching)
            session = self._get_session(sender_id)
            current_state = session.get('state')
            session_data = session.get('data', {})
            doctor_names = []
            available_doctors = []
            
            if current_state == STATE_SELECT_DOCTOR:
                svc_id = session_data.get('service_id')
                if svc_id:
                    available_doctors = self.appt_service.get_doctors_by_service(svc_id)
                else:
                    available_doctors = self.appt_service.get_active_doctors()
                doctor_names = [d.get('full_name', 'Dr. Unknown') for d in available_doctors]
                logger.info(f"🩺 STATE_SELECT_DOCTOR: available doctors = {doctor_names}")

            intent_data = self.ai_service.extract_booking_intent(transcribed, service_names, doctor_names)
            
            intent = intent_data.get('intent', 'unknown')
            for_whom = intent_data.get('for_whom', None)
            predicted_doc = intent_data.get('entities', {}).get('doctor')
            
            # Try to resolve service entity
            resolved_service_id = None
            predicted_service = intent_data.get('entities', {}).get('service')
            if predicted_service:
                match = next((s for s in services if s['service_name'].lower() == predicted_service.lower()), None)
                if match:
                    resolved_service_id = match['service_id']

            logger.info(f"🧠 AI understood: intent={intent}, for_whom={for_whom}, service={resolved_service_id}, doctor={predicted_doc}")

            # ── PRIORITY: Context-aware state handling ──
            # If the user is already in a selection state, handle it directly
            # regardless of what intent the AI returned (it may misclassify)
            
            if current_state == STATE_SELECT_DOCTOR:
                # User is selecting a doctor — try to resolve directly
                if predicted_doc and available_doctors:
                    doc_clean = predicted_doc.lower().replace('dr.', '').replace('doctor', '').strip()
                    matched_doc = next(
                        (d for d in available_doctors
                         if doc_clean in d['full_name'].lower()
                         or d['full_name'].lower() in doc_clean),
                        None
                    )
                    if matched_doc:
                        logger.info(f"✅ Voice matched doctor: {matched_doc['full_name']} (ID: {matched_doc['user_id']})")
                        self._handle_doctor_selection(sender_id, f"doc_{matched_doc['user_id']}", session_data)
                        return None
                    else:
                        logger.info(f"⚠️ AI returned doctor='{predicted_doc}' but no fuzzy match found")
                
                # Fallback: if only ONE doctor is available, auto-select them
                if len(available_doctors) == 1:
                    only_doc = available_doctors[0]
                    logger.info(f"🎯 Only one doctor available, auto-selecting: {only_doc['full_name']}")
                    self._handle_doctor_selection(sender_id, f"doc_{only_doc['user_id']}", session_data)
                    return None
                
                # Last resort: return raw text for _handle_doctor_selection to try
                logger.info(f"⚠️ Voice doctor selection: returning raw text '{transcribed}' for fuzzy match")
                return transcribed

            if current_state == STATE_SELECT_DATE:
                # Try to resolve natural language date via voice
                doctor_id = session_data.get('doctor_id')
                if doctor_id:
                    # Try AI-extracted date first
                    predicted_date = intent_data.get('entities', {}).get('date')
                    if predicted_date:
                        # Try direct YYYY-MM-DD
                        try:
                            datetime.strptime(predicted_date, '%Y-%m-%d')
                            self._handle_date_selection(sender_id, f"date_{predicted_date}", session_data)
                            return None
                        except ValueError:
                            pass
                    
                    # Try natural language resolution
                    resolved = self._resolve_natural_date(transcribed, doctor_id)
                    if resolved:
                        logger.info(f"📅 Voice resolved date '{transcribed}' → {resolved}")
                        self._handle_date_selection(sender_id, f"date_{resolved}", session_data)
                        return None
                
                # Return raw text for _handle_date_selection to try parsing
                return transcribed

            if current_state == STATE_SELECT_SERVICE:
                if resolved_service_id:
                    self._handle_service_selection(sender_id, f"svc_{resolved_service_id}")
                    return None
                if predicted_service:
                    return predicted_service
                # Return raw transcribed text for service fuzzy match
                return transcribed

            if current_state == STATE_SELECT_SHIFT:
                # Return raw text — _handle_shift_selection will fuzzy-match "Morning", "Evening", "Night" etc.
                return transcribed

            if current_state == STATE_SELECT_TIME:
                # Return raw text for time selection
                return transcribed

            # ── Generic intent routing (for MENU, INIT, etc.) ──
            if intent == 'book_appointment':
                # If AI detected who the booking is for, skip the BOOKING_FOR step
                if for_whom in ['self', 'other']:
                    target_state = STATE_SELECT_SERVICE
                    next_step_data = {}
                    
                    if resolved_service_id:
                        target_state = STATE_SELECT_DOCTOR
                        next_step_data['service_id'] = resolved_service_id
                    
                    if for_whom == 'self':
                        clean_phone = sender_id.replace('+', '').replace(' ', '')
                        patient = self.patient_service.get_patient_by_phone(clean_phone)
                        patient_name = patient.get('patient_name', 'You') if patient else 'You'
                        
                        next_step_data.update({
                            'booked_for': 'self',
                            'patient_name': patient_name
                        })
                        
                        self._transition_to(sender_id, target_state, next_step_data)
                        
                        if resolved_service_id:
                            doctors = self.appt_service.get_doctors_by_service(resolved_service_id)
                            self._send_doctor_list(sender_id, doctors)
                        else:
                            self._send_service_list(sender_id)
                        return None

                    elif for_whom == 'other':
                        guest_name = intent_data.get('entities', {}).get('guest_name')
                        if guest_name:
                            next_step_data.update({
                                'booked_for': 'other',
                                'patient_name': guest_name
                            })
                            
                            self._transition_to(sender_id, target_state, next_step_data)
                            self.notifier.send_whatsapp_text(sender_id, f"📝 Booking for: *{guest_name}*")
                            
                            if resolved_service_id:
                                doctors = self.appt_service.get_doctors_by_service(resolved_service_id)
                                self._send_doctor_list(sender_id, doctors)
                            else:
                                self._send_service_list(sender_id)
                            return None
                        else:
                            self._transition_to(sender_id, STATE_GUEST_NAME)
                            self.notifier.send_whatsapp_text(sender_id, "Please enter the *Patient's Full Name*:")
                            return None
                
                return 'book_appointment'

            elif intent == 'check_appointments':
                return 'check_appointments'
            elif intent == 'list_services':
                return 'list_services'

            # No command matched — return raw text for current state context
            return transcribed

        except Exception as e:
            logger.error(f"STT Error: {e}")
            self.notifier.send_whatsapp_text(sender_id, "⚠️ Voice processing failed. Please use text.")
            return None

    # ═══════════════════════════════════════════
    #  SARVAM VOICE FLOW: Language Selection
    # ═══════════════════════════════════════════

    def _start_voice_flow(self, sender_id):
        """Start the voice booking flow by asking for language selection."""
        self._transition_to(sender_id, STATE_LANG_SELECT, clear_data=True)

        # Send language selection as a WhatsApp list
        lang_items = [
            ("lang_te", "తెలుగు (Telugu)", "Speak in Telugu"),
            ("lang_hi", "हिन्दी (Hindi)", "Speak in Hindi"),
            ("lang_ur", "اردو (Urdu)", "Speak in Urdu"),
            ("lang_kn", "ಕನ್ನಡ (Kannada)", "Speak in Kannada"),
            ("lang_en", "English", "Speak in English"),
        ]

        self.notifier.send_whatsapp_list(
            sender_id,
            "🌐 *Select Your Preferred Language*\n\n"
            "Please choose the language you'd like to use for voice booking.\n\n"
            "Available languages:\n"
            "1️⃣ తెలుగు (Telugu)\n"
            "2️⃣ हिन्दी (Hindi)\n"
            "3️⃣ اردو (Urdu)\n"
            "4️⃣ ಕನ್ನಡ (Kannada)\n"
            "5️⃣ English\n\n"
            "_You can also type the language name or number._",
            lang_items,
            title="Languages",
            button_text="Choose Language"
        )

        # Also send a TTS audio of the language selection prompt (in English)
        if self.sarvam and self.sarvam.is_available() and getattr(self, 'local_voice', None):
            tts_text = self.sarvam.get_language_selection_tts()
            audio_path = self.local_voice.text_to_speech(tts_text, 'en')
            if audio_path:
                self._send_whatsapp_audio(sender_id, audio_path)

    def _handle_language_selection(self, sender_id, input_text):
        """Handle user's language selection input."""
        text = input_text.strip()

        # Check if it's a list selection (e.g. 'lang_te')
        if text.startswith('lang_'):
            lang_code = text.replace('lang_', '')
        else:
            # Try to resolve from text/voice input
            if self.sarvam:
                lang_code = self.sarvam.resolve_language_from_input(text)
            else:
                lang_code = None

        if not lang_code or lang_code not in SARVAM_SUPPORTED_LANGUAGES:
            self.notifier.send_whatsapp_text(
                sender_id,
                "⚠️ I didn't understand that. Please select a language from the list, or type a number 1-5."
            )
            self._start_voice_flow(sender_id)
            return

        lang_info = SARVAM_SUPPORTED_LANGUAGES[lang_code]
        lang_name = lang_info['name']
        lang_display = lang_info['display']

        # Save language selection and transition to voice chat
        self._transition_to(sender_id, STATE_VOICE_CHAT, {
            'language': lang_code,
            'messages': []
        })

        # Send confirmation
        confirm_msg = (
            f"✅ Language set to *{lang_display} ({lang_name})*\n\n"
            f"🎤 You can now send voice notes or type in {lang_name} to book appointments.\n\n"
            f"_Send a voice note or type your request to get started!_"
        )
        self.notifier.send_whatsapp_text(sender_id, confirm_msg)

        # Send TTS greeting in chosen language
        if self.sarvam and self.sarvam.is_available() and getattr(self, 'local_voice', None):
            greetings = {
                'te': "నమస్కారం! హాస్పిటల్ అపాయింట్మెంట్ బుకింగ్ సర్వీస్‌కి స్వాగతం. మీకు ఎలా సహాయం చేయగలను?",
                'hi': "नमस्ते! हॉस्पिटल अपॉइंटमेंट बुकिंग सर्विस में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूं?",
                'ur': "السلام علیکم! ہسپتال اپائنٹمنٹ بکنگ سروس میں خوش آمدید۔ میں آپ کی کیسے مدد کر سکتا ہوں؟",
                'kn': "ನಮಸ್ಕಾರ! ಆಸ್ಪತ್ರೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕಿಂಗ್ ಸೇವೆಗೆ ಸ್ವಾಗತ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
                'en': "Welcome to the hospital appointment booking service. How can I help you today?",
            }
            greeting = greetings.get(lang_code, greetings['en'])
            audio_path = self.local_voice.text_to_speech(greeting, lang_code)
            if audio_path:
                self._send_whatsapp_audio(sender_id, audio_path)

    # ═══════════════════════════════════════════
    #  SARVAM VOICE PROCESSING (Audio Messages)
    # ═══════════════════════════════════════════

    def _handle_sarvam_voice(self, sender_id, media_id, session):
        """
        Handle voice messages using Sarvam AI for STT, intent processing, and TTS reply.
        This is the primary voice pipeline when Sarvam is available.
        """
        if not media_id:
            self.notifier.send_whatsapp_text(sender_id, "⚠️ Failed to process voice note. Please try again.")
            return

        current_state = session.get('state', STATE_INIT)
        data = session.get('data', {})
        lang_code = data.get('language', 'en')

        try:
            self.notifier.send_whatsapp_text(sender_id, "🎤 Processing your voice message...")

            # 1. Download audio from WhatsApp
            audio_path = self._download_media(media_id)
            if not audio_path:
                self.notifier.send_whatsapp_text(sender_id, "⚠️ Could not download audio. Please try again.")
                return

            # 2. If no language selected yet, ask for language first
            if current_state not in [STATE_VOICE_CHAT, STATE_LANG_SELECT] and current_state not in [STATE_REGISTER_NAME, STATE_REGISTER_EMAIL]:
                # User sent voice without starting voice flow — start it with language selection
                self._start_voice_flow(sender_id)
                # Also try to transcribe to see if they said a language name
                stt_result = self.local_voice.speech_to_text(audio_path, 'en') if self.local_voice else None
                if stt_result:
                    transcript = stt_result.get('transcript', '')
                    if transcript:
                        resolved_lang = self.sarvam.resolve_language_from_input(transcript)
                        if resolved_lang:
                            self._handle_language_selection(sender_id, f"lang_{resolved_lang}")
                try:
                    os.remove(audio_path)
                except Exception:
                    pass
                return

            # 3. Handle language selection state via voice
            if current_state == STATE_LANG_SELECT:
                stt_result = self.local_voice.speech_to_text(audio_path, 'en') if self.local_voice else None
                try:
                    os.remove(audio_path)
                except Exception:
                    pass
                if stt_result:
                    transcript = stt_result.get('transcript', '')
                    if transcript:
                        self.notifier.send_whatsapp_text(sender_id, f"📝 I heard: \"{transcript}\"")
                        self._handle_language_selection(sender_id, transcript)
                        return
                self.notifier.send_whatsapp_text(sender_id, "⚠️ Could not understand. Please try again or select from the list.")
                return

            # 4. Transcribe using local STT in the selected language
            stt_result = self.local_voice.speech_to_text(audio_path, lang_code) if self.local_voice else None

            # Clean up audio file
            try:
                os.remove(audio_path)
            except Exception:
                pass

            if not stt_result or not stt_result.get('transcript'):
                self.notifier.send_whatsapp_text(
                    sender_id,
                    "⚠️ Could not understand your voice message. Please try again or type your request."
                )
                return

            transcript = stt_result['transcript']
            logger.info(f"🎤 Sarvam STT [{lang_code}]: '{transcript}'")

            # 4b. Quality check — reject garbage transcriptions
            if self._is_garbage_transcript(transcript):
                logger.warning(f"🗑️ Rejected garbage transcription: '{transcript}'")
                self.notifier.send_whatsapp_text(
                    sender_id,
                    "⚠️ I couldn't understand that clearly. Please speak closer to the mic and try again."
                )
                return

            # Echo transcription
            self.notifier.send_whatsapp_text(sender_id, f"📝 I heard: \"{transcript}\"")

            # 5. Check for global commands
            text_lower = transcript.lower().strip()
            voice_booking_active = data.get('booking_state', BK_IDLE) != BK_IDLE
            if text_lower in ['hi', 'hello', 'menu', 'reset', 'start']:
                if voice_booking_active and text_lower not in ['reset', 'menu']:
                    logger.info(f"🚫 Ignoring voice reset command '{text_lower}' during active booking for {sender_id}")
                    return
                if voice_booking_active:
                    self.db.whatsapp_sessions.update_one(
                        {'sender_id': sender_id},
                        {'$set': {'data.booking_state': BK_IDLE}}
                    )
                self._transition_to(sender_id, STATE_MENU, clear_data=True)
                self._send_main_menu(sender_id)
                return

            # 6. Try SmartBookingEngine first for booking/query intents
            try:
                if self._booking_engine.try_handle(sender_id, transcript, session):
                    logger.info(f"📋 SmartBookingEngine handled voice transcript from {sender_id}")
                    return
            except Exception as e:
                logger.error(f"SmartBookingEngine voice error: {e}", exc_info=True)
                if voice_booking_active:
                    self.notifier.send_whatsapp_text(
                        sender_id,
                        "⚠️ Something went wrong. Please try again or type *reset* to start over."
                    )
                    return

            # 7. Fallback to Sarvam AI conversation (LLM)
            self._process_sarvam_conversation(sender_id, transcript, data, lang_code)

        except Exception as e:
            logger.error(f"❌ Sarvam voice processing error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self.notifier.send_whatsapp_text(sender_id, "⚠️ Voice processing failed. Please try text instead.")

    # ═══════════════════════════════════════════
    #  SARVAM TEXT CHAT (typed messages in voice flow)
    # ═══════════════════════════════════════════

    def _handle_sarvam_text_chat(self, sender_id, input_text, data):
        """Handle typed text messages when in Sarvam voice chat mode."""
        lang_code = data.get('language', 'en')

        # Check for exit commands
        text_lower = input_text.lower().strip()
        if text_lower in ['menu', 'exit', 'back', 'reset']:
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        if text_lower in ['change language', 'language', 'bhasha', 'భాష', 'भाषा']:
            self._start_voice_flow(sender_id)
            return

        # Convert hybrid button IDs to natural language for the AI
        if input_text.startswith('vslot_'):
            time_str = input_text.replace('vslot_', '')
            spoken = self.appt_service._time_to_spoken(time_str)
            input_text = f"I want the {spoken} slot"

        if input_text.startswith('shift_'):
            parts = input_text.replace('shift_', '').split('_')
            if len(parts) == 2:
                start_spoken = self.appt_service._time_to_spoken(parts[0])
                end_spoken = self.appt_service._time_to_spoken(parts[1])
                h = int(parts[0].split(':')[0])
                shift_name = "morning" if h < 12 else ("afternoon" if h < 17 else "evening")
                input_text = f"I want the {shift_name} shift from {start_spoken} to {end_spoken}"

        # Process through Sarvam conversation
        self._process_sarvam_conversation(sender_id, input_text, data, lang_code)

    # ═══════════════════════════════════════════
    #  SARVAM CONVERSATION ENGINE
    # ═══════════════════════════════════════════

    def _process_sarvam_conversation(self, sender_id, user_text, data, lang_code):
        """
        Core Sarvam AI conversation processing with tool calling and hybrid WhatsApp delivery.
        """
        # Fetch available constraints
        available_services = [s['service_name'] for s in self.appt_service.get_services()]
        available_doctors = [d['full_name'] for d in self.appt_service.get_active_doctors()]

        # Build message history
        messages = data.get('messages', [])

        # Add patient context if first message
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)
        patient_context = ""
        if patient:
            patient_context = f"The user's registered name is {patient.get('patient_name', 'Unknown')}. "

        if not messages:
            messages.append({
                "role": "system",
                "content": f"Today's date is {datetime.now().strftime('%Y-%m-%d, %A')}. {patient_context}"
            })

        messages.append({"role": "user", "content": str(user_text)})

        # Track hybrid data for side-channel WhatsApp messages
        hybrid_data = {'slots_sent': False}

        # Tool execution callback with hybrid WhatsApp delivery
        def tool_executor(tool_name, tool_args):
            result = self._sarvam_tool_callback(sender_id, tool_name, tool_args, data, hybrid_data)
            return result

        # Process with Groq Llama 3 (AI Service) instead of Sarvam due to 404 error
        # Add a strict rule to ensure it speaks naturally for the TTS
        system_injection = {
            "role": "system",
            "content": "IMPORTANT: You are speaking on a voice call. Do NOT use markdown (* or **). Speak times naturally (e.g. '9 AM' not '09:00'). Keep it conversational and brief. If the user spoke in a specific language, reply in that EXACT same language."
        }
        
        # We need to filter out old system messages to prevent Groq from getting confused
        filtered_messages = [m for m in messages if m.get('role') != 'system' or 'Today is' in m.get('content','')]
        filtered_messages.insert(0, system_injection)

        ai_response = self.ai_service.process_conversation(
            messages=filtered_messages,
            available_services=available_services,
            available_doctors=available_doctors,
            tool_callback=tool_executor
        )

        messages.append({"role": "assistant", "content": ai_response})

        # Save conversation memory
        data['messages'] = messages[-15:]
        self._transition_to(sender_id, STATE_VOICE_CHAT, data)

        # Send text response to WhatsApp
        self.notifier.send_whatsapp_text(sender_id, ai_response)

        # Generate and send TTS audio response
        if self.sarvam and self.sarvam.is_available() and getattr(self, 'local_voice', None):
            audio_path = self.local_voice.text_to_speech(ai_response, lang_code)
            if audio_path:
                self._send_whatsapp_audio(sender_id, audio_path)

    def _sarvam_tool_callback(self, sender_id, tool_name, tool_args, session_data, hybrid_data):
        """
        Execute tools for Sarvam conversation and trigger hybrid WhatsApp delivery.
        When slots are found, sends a visual WhatsApp list alongside the voice response.
        """
        try:
            if tool_name == "list_available_doctors":
                date_str = tool_args.get("date")
                specialization = tool_args.get("specialization")

                # Resolve natural date if provided
                if date_str:
                    resolved = self._parse_natural_date(date_str)
                    if resolved:
                        date_str = resolved

                doctors = self.appt_service.get_active_doctors(specialization=specialization)

                if not doctors:
                    return "No active doctors found."

                if date_str:
                    # Filter to only doctors who have availability on this date
                    available_doctors = []
                    for doc in doctors:
                        shifts = self.appt_service.get_available_shifts(doc['user_id'], date_str)
                        if shifts:
                            available_doctors.append({
                                'name': doc['full_name'],
                                'specialization': doc.get('specialization', 'General'),
                                'shifts': [s['shift_name'] for s in shifts]
                            })

                    if not available_doctors:
                        return f"No doctors are available on {date_str}. Try another date."

                    # Send visual WhatsApp list
                    if not hybrid_data.get('doctors_sent'):
                        items = []
                        for doc in available_doctors[:10]:
                            items.append((
                                f"doc_pick_{doc['name'].replace(' ', '_')}",
                                f"👨‍⚕️ {doc['name']}",
                                f"{doc['specialization']} | {', '.join(doc['shifts'])}"
                            ))
                        self.notifier.send_whatsapp_list(
                            sender_id,
                            f"🏥 Doctors available on {date_str}:",
                            items,
                            title="Available Doctors",
                            button_text="Choose Doctor"
                        )
                        hybrid_data['doctors_sent'] = True

                    result = f"On {date_str}, these doctors are available:\n"
                    for doc in available_doctors:
                        result += f"- Dr. {doc['name']} ({doc['specialization']}) — {', '.join(doc['shifts'])}\n"
                    return result
                else:
                    # No date — just list all active doctors
                    items = []
                    for doc in doctors[:10]:
                        items.append((
                            f"doc_pick_{doc['full_name'].replace(' ', '_')}",
                            f"👨‍⚕️ {doc['full_name']}",
                            doc.get('specialization', 'General')
                        ))
                    self.notifier.send_whatsapp_list(
                        sender_id,
                        "🏥 Our available doctors:",
                        items,
                        title="Doctors",
                        button_text="Choose Doctor"
                    )
                    result = "Our available doctors:\n"
                    for doc in doctors[:10]:
                        result += f"- Dr. {doc['full_name']} ({doc.get('specialization', 'General')})\n"
                    return result

            elif tool_name == "check_availability":
                doctor_name = tool_args.get("doctor_name")
                date_str = tool_args.get("date")
                time_str = tool_args.get("time")

                # Resolve natural date
                if date_str:
                    resolved = self._parse_natural_date(date_str)
                    if resolved:
                        date_str = resolved

                # Match Doctor
                doctor_clean = doctor_name.lower().replace('dr.', '').replace('doctor', '').strip()
                doctors = self.appt_service.get_active_doctors()
                matched_doctor = next((d for d in doctors if doctor_clean in d['full_name'].lower()), None)

                if not matched_doctor:
                    return f"Doctor '{doctor_name}' not found. Available doctors are: {', '.join(d['full_name'] for d in doctors[:5])}"

                doctor_id = matched_doctor['user_id']
                doc_name = matched_doctor['full_name']

                if not date_str:
                    return "Please provide a date to check availability."

                try:
                    datetime.strptime(date_str, "%Y-%m-%d")
                except ValueError:
                    return f"Invalid date format. Please use a valid date."

                # Get spoken shift data
                spoken_shifts, shifts = self.appt_service.get_spoken_shifts(doctor_id, date_str)

                if not shifts:
                    return f"Dr. {doc_name} has no available shifts on {date_str}."

                # ── HYBRID: Send WhatsApp visual list of shifts ──
                if not hybrid_data.get('slots_sent'):
                    self._send_hybrid_shifts(sender_id, shifts, doc_name, date_str)

                # If a specific time is requested
                if time_str:
                    all_slots = []
                    for s in shifts:
                        slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                        all_slots.extend([slot['start'] for slot in slots])

                    if time_str in all_slots:
                        return f"Yes, {time_str} is available on {date_str} with Dr. {doc_name}."
                    else:
                        return f"{time_str} is not available. Available slots are: {', '.join(all_slots[:8])}"

                # No specific time — return spoken shifts and also fire hybrid slot lists
                for s in shifts:
                    slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                    if slots and not hybrid_data.get('slots_sent'):
                        self._send_hybrid_slots(sender_id, slots, s['shift_name'], doc_name, date_str)
                        hybrid_data['slots_sent'] = True

                return spoken_shifts

            elif tool_name == "book_appointment":
                patient_name_input = tool_args.get("patient_name")
                doctor_name = tool_args.get("doctor_name")
                date_str = tool_args.get("date")
                time_str = tool_args.get("time")

                # Resolve natural date
                if date_str:
                    resolved = self._parse_natural_date(date_str)
                    if resolved:
                        date_str = resolved

                # Resolve natural time (e.g. "9am" → "09:00")
                if time_str:
                    time_str = self._parse_natural_time(time_str)

                # Match Doctor
                doctor_clean = doctor_name.lower().replace('dr.', '').replace('doctor', '').strip()
                doctors = self.appt_service.get_active_doctors()
                matched_doctor = next((d for d in doctors if doctor_clean in d['full_name'].lower()), None)
                if not matched_doctor:
                    return f"Error: Doctor '{doctor_name}' not found."

                # Determine Patient
                clean_phone = sender_id.replace('+', '').replace(' ', '')
                patient_rec = self.patient_service.get_patient_by_phone(clean_phone)

                if not patient_rec:
                    return "Error: Patient not registered. Please register first."

                patient_id = patient_rec['patient_id']
                booked_for_name = patient_rec.get('patient_name', 'Unknown')

                if patient_name_input and patient_name_input.lower() not in ['self', '', 'me', booked_for_name.lower()]:
                    booked_for_name = patient_name_input

                # Calculate end time
                dt_time = datetime.strptime(time_str, "%H:%M")
                end_time_str = (dt_time + timedelta(minutes=30)).strftime("%H:%M")

                # Book appointment
                success = self.appt_service.book_appointment({
                    'patient_id': patient_id,
                    'patient_name': booked_for_name,
                    'doctor_id': matched_doctor['user_id'],
                    'date': date_str,
                    'start_time': time_str,
                    'end_time': end_time_str,
                    'status': 'pending_doctor_approval',
                    'created_by': 'sarvam_voice',
                    'created_by_id': sender_id,
                    'notes': f"Booked via Sarvam Voice AI for {booked_for_name}"
                })

                if success:
                    # Notify doctor in real-time via socket
                    _notify_doctor_new_appointment(matched_doctor['user_id'], success)
                    session_data['messages'] = []
                    self._transition_to(sender_id, STATE_VOICE_CHAT, session_data)

                    # ── HYBRID: Send booking confirmation as WhatsApp message ──
                    confirm_msg = (
                        f"✅ *Appointment Booked!*\n\n"
                        f"👤 Patient: {booked_for_name}\n"
                        f"👨‍⚕️ Doctor: Dr. {matched_doctor['full_name']}\n"
                        f"📅 Date: {date_str}\n"
                        f"⏰ Time: {time_str} – {end_time_str}\n\n"
                        f"⏳ Status: Pending Doctor Approval"
                    )
                    self.notifier.send_whatsapp_text(sender_id, confirm_msg)

                    return "SUCCESS. The appointment has been booked successfully. Inform the user of the details and ask if they need anything else."
                else:
                    return "FAILED to book. There was a conflict or error. Ask user to try another time."

            else:
                return f"Error: Tool '{tool_name}' is not recognized."

        except Exception as e:
            logger.error(f"Sarvam tool execution failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return f"System error: {e}"

    # ═══════════════════════════════════════════
    #  HYBRID WHATSAPP DELIVERY
    # ═══════════════════════════════════════════

    def _send_hybrid_shifts(self, sender_id, shifts, doctor_name, date_str):
        """
        Send available shifts as a WhatsApp interactive list while the AI speaks them.
        This is the 'hybrid' feature — voice + visual simultaneously.
        """
        try:
            if not shifts:
                return

            if len(shifts) <= 3:
                # Use buttons
                btn_titles = []
                btn_ids = []
                for s in shifts:
                    start_spoken = self.appt_service._time_to_spoken(s['start'])
                    end_spoken = self.appt_service._time_to_spoken(s['end'])
                    btn_titles.append(f"{s['shift_name']} {start_spoken}")
                    btn_ids.append(f"shift_{s['start']}_{s['end']}")

                self.notifier.send_whatsapp_buttons(
                    sender_id,
                    f"📋 Dr. {doctor_name} — {date_str}\nAvailable shifts (tap to select):",
                    btn_titles[:3],
                    btn_ids[:3]
                )
            else:
                items = []
                for s in shifts:
                    start_spoken = self.appt_service._time_to_spoken(s['start'])
                    end_spoken = self.appt_service._time_to_spoken(s['end'])
                    items.append((
                        f"shift_{s['start']}_{s['end']}",
                        f"{s['shift_name']}",
                        f"{start_spoken} – {end_spoken} ({s['free_slots']} slots)"
                    ))

                self.notifier.send_whatsapp_list(
                    sender_id,
                    f"📋 Dr. {doctor_name} — {date_str}\nAvailable shifts:",
                    items,
                    title="Shifts",
                    button_text="View Shifts"
                )

            logger.info(f"📤 Hybrid: Sent shift list to {sender_id} for {doctor_name} on {date_str}")

        except Exception as e:
            logger.error(f"Hybrid shift delivery error: {e}")

    def _send_hybrid_slots(self, sender_id, slots, shift_name, doctor_name, date_str):
        """
        Send available time slots as a WhatsApp interactive list while the AI speaks them.
        """
        try:
            if not slots:
                return

            items = []
            for slot in slots[:10]:
                start_spoken = self.appt_service._time_to_spoken(slot['start'])
                end_spoken = self.appt_service._time_to_spoken(slot['end'])
                items.append((
                    f"vslot_{slot['start']}",
                    f"🕐 {start_spoken}",
                    f"{start_spoken} – {end_spoken}"
                ))

            self.notifier.send_whatsapp_list(
                sender_id,
                f"⏰ {shift_name} Shift — Dr. {doctor_name}\n"
                f"📅 {date_str}\n\n"
                f"_Tap a slot to select, or tell me the time by voice._",
                items,
                title="Available Slots",
                button_text="View Slots"
            )

            logger.info(f"📤 Hybrid: Sent slot list to {sender_id} for {shift_name} shift")

        except Exception as e:
            logger.error(f"Hybrid slot delivery error: {e}")

    # ═══════════════════════════════════════════
    #  WHATSAPP AUDIO SEND
    # ═══════════════════════════════════════════

    def _send_whatsapp_audio(self, sender_id, audio_file_path):
        """
        Upload and send an audio file as a WhatsApp voice message.
        Uses the WhatsApp Cloud API media upload + send flow.
        """
        try:
            if not os.path.exists(audio_file_path):
                logger.error(f"Audio file not found: {audio_file_path}")
                return False

            # Step 1: Upload media to WhatsApp
            upload_url = f"https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/media"
            headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}

            with open(audio_file_path, 'rb') as audio_file:
                files = {
                    'file': (os.path.basename(audio_file_path), audio_file, 'audio/ogg')
                }
                data = {
                    'messaging_product': 'whatsapp',
                    'type': 'audio/ogg'
                }

                upload_response = requests.post(upload_url, headers=headers, files=files, data=data)

            if upload_response.status_code != 200:
                logger.error(f"Audio upload failed: {upload_response.status_code} {upload_response.text}")
                return False

            media_id = upload_response.json().get('id')
            if not media_id:
                logger.error("No media_id in upload response")
                return False

            # Step 2: Send the audio message
            send_url = f"https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages"
            send_headers = {
                "Authorization": f"Bearer {WHATSAPP_TOKEN}",
                "Content-Type": "application/json"
            }
            send_payload = {
                "messaging_product": "whatsapp",
                "to": sender_id,
                "type": "audio",
                "audio": {"id": media_id}
            }

            send_response = requests.post(send_url, headers=send_headers, json=send_payload)

            if send_response.status_code == 200:
                logger.info(f"🔊 Audio sent to {sender_id}")
                return True
            else:
                logger.error(f"Audio send failed: {send_response.status_code} {send_response.text}")
                return False

        except Exception as e:
            logger.error(f"❌ WhatsApp audio send error: {e}")
            return False
        finally:
            # Clean up audio file
            try:
                if os.path.exists(audio_file_path):
                    os.remove(audio_file_path)
            except Exception:
                pass

    # ═══════════════════════════════════════════
    #  TRANSCRIPTION QUALITY FILTER
    # ═══════════════════════════════════════════

    def _is_garbage_transcript(self, text):
        """
        Detect garbage / noise transcriptions that should be discarded.
        Returns True if the text looks like STT gibberish from background noise.
        """
        import re as _re
        if not text or len(text.strip()) < 3:
            return True

        clean = text.strip()

        # 1. Mostly non-alphanumeric (fractions, symbols, control chars)
        alpha_chars = sum(1 for c in clean if c.isalpha())
        if len(clean) > 5 and alpha_chars / len(clean) < 0.3:
            return True

        # 2. Excessive repetition (same word repeated 3+ times)
        # e.g. "⅔ 2.0  ⅔ 3.0  ⅔ 3.0  ⅔ 4.0" or "requirement of the requirement of the requirement"
        words = clean.split()
        if len(words) >= 4:
            from collections import Counter
            word_counts = Counter(w.lower().strip('.,!?') for w in words)
            # Skip common filler words like 'the', 'of', 'a'
            filler = {'the', 'of', 'a', 'an', 'is', 'to', 'and', 'in', 'on', 'it', 'i'}
            for most_common_word, most_common_count in word_counts.most_common(5):
                if most_common_word in filler:
                    continue
                if most_common_count >= 3 and most_common_count / len(words) > 0.25:
                    return True
                break  # Only check the top non-filler word

        # 3. Very short with no real words (less than 2 alphabetic words)
        # But allow known short valid inputs: greetings, commands
        short_valid = {'hi', 'hello', 'menu', 'yes', 'no', 'ok', 'book', 'help',
                       'call', 'voice', 'reset', 'start', 'back', 'exit',
                       'haan', 'nahi', 'haa', 'cancel', 'confirm'}
        if clean.lower().strip() in short_valid:
            return False
        real_words = [w for w in words if _re.match(r'^[a-zA-Z\u0900-\u097F\u0C00-\u0C7F\u0600-\u06FF]{2,}$', w)]
        if len(real_words) < 2 and len(clean) < 20:
            return True

        # 4. Contains fraction characters or other STT artifacts
        fraction_chars = sum(1 for c in clean if ord(c) in range(0x2150, 0x2190))  # ⅓ ⅔ ¼ etc
        if fraction_chars >= 2:
            return True

        return False

    # ═══════════════════════════════════════════
    #  SESSION MANAGEMENT
    # ═══════════════════════════════════════════

    def _get_session(self, sender_id):
        session = self.db.whatsapp_sessions.find_one({'sender_id': sender_id})
        if not session:
            session = {
                'sender_id': sender_id,
                'state': STATE_INIT,
                'data': {},
                'updated_at': datetime.now()
            }
            self.db.whatsapp_sessions.insert_one(session)
        return session

    def _transition_to(self, sender_id, new_state, data_update=None, clear_data=False):
        """Transition to a new state, optionally merging or clearing data."""
        update = {'state': new_state, 'updated_at': datetime.now()}

        if clear_data:
            update['data'] = data_update or {}
        elif data_update:
            current = self.db.whatsapp_sessions.find_one({'sender_id': sender_id})
            merged = current.get('data', {}) if current else {}
            merged.update(data_update)
            update['data'] = merged

        self.db.whatsapp_sessions.update_one(
            {'sender_id': sender_id},
            {'$set': update},
            upsert=True
        )

    # ═══════════════════════════════════════════
    #  MEDIA DOWNLOAD
    # ═══════════════════════════════════════════

    def _download_media(self, media_id):
        """Download media from WhatsApp Cloud API."""
        try:
            url = f"https://graph.facebook.com/v19.0/{media_id}"
            headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}

            response = requests.get(url, headers=headers)
            response.raise_for_status()
            media_info = response.json()
            media_url = media_info.get("url")
            mime_type = media_info.get("mime_type", "")

            if not media_url:
                logger.error("No media URL in response")
                return None

            ext = ".ogg"
            if "aac" in mime_type:
                ext = ".aac"
            elif "mp4" in mime_type:
                ext = ".mp4"
            elif "mpeg" in mime_type:
                ext = ".mp3"

            filepath = os.path.join(os.getcwd(), f"temp_{media_id}{ext}")
            logger.info(f"Downloading media: {media_url}")

            media_response = requests.get(media_url, headers=headers)
            media_response.raise_for_status()

            with open(filepath, 'wb') as f:
                f.write(media_response.content)

            return filepath

        except Exception as e:
            logger.error(f"Media Download Error: {e}")
            return None

    def send_message(self, to, body):
        """Convenience alias."""
        self.notifier.send_whatsapp_text(to, body)
