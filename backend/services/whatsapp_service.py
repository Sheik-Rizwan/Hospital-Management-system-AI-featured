from __future__ import annotations
# whatsapp_service.py — Production-Ready WhatsApp Booking Engine
# 13-state conversation engine with Sarvam AI voice call, language selection, and hybrid delivery

from datetime import datetime, timedelta
import requests
import os
import json
import re
from mongodb_config import MongoDatabase
from services.appointment_service import AppointmentService
from services.patient_service import PatientService
from services.notification_service import NotificationService
from services.speech_to_text import SpeechToTextRecorder
from services.sarvam_service import SarvamService
from services.local_voice_service import LocalVoiceService
from services.stt_post_processor import post_process_stt
from ai_service import AIService
from logger_config import logger
from services.booking_flow import SmartBookingEngine, BK_IDLE
from services.booking_utils import resolve_date, resolve_time, resolve_ambiguous_time, validate_booking_date, get_doctor_weekly_schedule
from services.language_utils import detect_language, get_language_name, get_response_language_instruction
from services.localization_service import LocalizationService

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
#  SUPPORTED LANGUAGES & SCRIPT VALIDATION
# ═══════════════════════════════════════════

# Only these 6 languages are trained/supported
TRAINED_LANGUAGES = {'te', 'hi', 'en', 'ta', 'kn'}

# Unicode ranges for supported scripts
# Telugu: 0C00-0C7F, Hindi/Devanagari: 0900-097F, Tamil: 0B80-0BFF
# Kannada: 0C80-0CFF, English/Latin: 0000-007F
SUPPORTED_SCRIPT_RANGES = [
    (0x0000, 0x007F),   # Basic Latin (English)
    (0x0900, 0x097F),   # Devanagari (Hindi)
    (0x0B80, 0x0BFF),   # Tamil
    (0x0C00, 0x0C7F),   # Telugu
    (0x0C80, 0x0CFF),   # Kannada
    (0x0020, 0x0040),   # Basic punctuation and digits
    (0x005B, 0x0060),   # More punctuation
    (0x007B, 0x007E),   # Braces, etc.
]

# Unsupported scripts that indicate wrong language detection
UNSUPPORTED_SCRIPT_RANGES = [
    (0x4E00, 0x9FFF),   # CJK Unified Ideographs (Chinese)
    (0x3040, 0x309F),   # Hiragana (Japanese)
    (0x30A0, 0x30FF),   # Katakana (Japanese)
    (0xAC00, 0xD7AF),   # Hangul (Korean)
    (0x0400, 0x04FF),   # Cyrillic (Russian, etc.)
    (0x0370, 0x03FF),   # Greek
    (0x0E00, 0x0E7F),   # Thai
    (0x1000, 0x109F),   # Myanmar
    (0x0980, 0x09FF),   # Bengali (not trained yet)
    (0x0A00, 0x0A7F),   # Gurmukhi/Punjabi (not trained yet)
    (0x0A80, 0x0AFF),   # Gujarati (not trained yet)
    (0x0D00, 0x0D7F),   # Malayalam (not trained yet)
    (0x0D80, 0x0DFF),   # Sinhala (not trained yet)
]

def is_transcript_valid(transcript: str) -> tuple:
    """
    Check if transcript contains only characters from supported languages.
    Returns: (is_valid: bool, detected_issue: str | None)
    """
    if not transcript or not transcript.strip():
        return False, "empty_transcript"

    transcript = transcript.strip()

    # Check for unsupported script characters
    for char in transcript:
        code_point = ord(char)
        for start, end in UNSUPPORTED_SCRIPT_RANGES:
            if start <= code_point <= end:
                # Found an unsupported character
                script_name = _get_script_name(code_point)
                logger.warning(f"️ Unsupported script detected: {script_name} (char: {char}, code: {hex(code_point)})")
                return False, f"unsupported_script:{script_name}"

    return True, None

def _get_script_name(code_point: int) -> str:
    """Get human-readable script name from Unicode code point."""
    if 0x4E00 <= code_point <= 0x9FFF:
        return "Chinese"
    elif 0x3040 <= code_point <= 0x309F or 0x30A0 <= code_point <= 0x30FF:
        return "Japanese"
    elif 0xAC00 <= code_point <= 0xD7AF:
        return "Korean"
    elif 0x0400 <= code_point <= 0x04FF:
        return "Cyrillic"
    elif 0x0370 <= code_point <= 0x03FF:
        return "Greek"
    elif 0x0E00 <= code_point <= 0x0E7F:
        return "Thai"
    elif 0x1000 <= code_point <= 0x109F:
        return "Myanmar"
    elif 0x0980 <= code_point <= 0x09FF:
        return "Bengali"
    elif 0x0A00 <= code_point <= 0x0A7F:
        return "Punjabi"
    elif 0x0A80 <= code_point <= 0x0AFF:
        return "Gujarati"
    elif 0x0D00 <= code_point <= 0x0D7F:
        return "Malayalam"
    elif 0x0D80 <= code_point <= 0x0DFF:
        return "Sinhala"
    return "Unknown"


def is_garbage_transcription(text: str) -> bool:
    """
    Detect garbage/nonsensical STT transcriptions.
    Returns True if the text appears to be garbage.
    """
    if not text or len(text.strip()) < 3:
        return True

    text_lower = text.lower().strip()

    # 1. Check for repetitive phrases (e.g., "X, X, X" or "X X X")
    # Split by commas or periods
    parts = re.split(r'[,.\!]+', text_lower)
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) >= 2:
        # Check if all parts are the same or very similar
        unique_parts = set(parts)
        if len(unique_parts) == 1 and len(parts) >= 2:
            logger.warning(f"️ Garbage detected: repetitive phrase '{parts[0]}'")
            return True

    # 2. Check for known garbage patterns from STT
    garbage_patterns = [
        r'i am going to make a movie',
        r'i am going to',
        r'i am a body artist',
        r'actress.*point',
        r'movie.*movie.*movie',
        r'body artist',
        r'thank you for watching',
        r'subscribe to my channel',
        r'please like and subscribe',
        r'^(the|a|an|i|we|he|she|it)\s*$',  # Single common words
        r'^[\d\s\.\,]+$',  # Only numbers and punctuation
    ]
    for pattern in garbage_patterns:
        if re.search(pattern, text_lower):
            logger.warning(f"️ Garbage detected: matches pattern '{pattern}'")
            return True

    # 3. Check word repetition (same word repeated 3+ times)
    words = text_lower.split()
    if len(words) >= 3:
        word_counts = {}
        for w in words:
            if len(w) > 2:  # Ignore short words
                word_counts[w] = word_counts.get(w, 0) + 1
        for word, count in word_counts.items():
            if count >= 3 and count / len(words) > 0.4:  # Same word is 40%+ of text
                logger.warning(f"️ Garbage detected: word '{word}' repeated {count} times")
                return True

    return False


def score_transcription_quality(text: str, expected_lang: str) -> int:
    """
    Score a transcription based on quality indicators.
    Higher score = better quality.
    Returns 0-100.
    """
    if not text or not text.strip():
        return 0

    text_lower = text.lower().strip()
    score = 50  # Base score

    # Check for garbage
    if is_garbage_transcription(text):
        return 0

    # Bonus for booking-related keywords (any language)
    booking_keywords = [
        # English
        'appointment', 'book', 'booking', 'doctor', 'hospital', 'clinic',
        'schedule', 'time', 'date', 'tomorrow', 'today',
        # Hindi Romanized
        'appointment', 'book', 'karo', 'karna', 'chahiye', 'doctor', 'dawai',
        'kal', 'aaj', 'parso', 'parsu', 'milna', 'dikhana', 'bukking',
        # Common misspellings from STT
        'apointment', 'appoint', 'bookin', 'docter', 'hospitl',
    ]
    keyword_count = sum(1 for kw in booking_keywords if kw in text_lower)
    score += keyword_count * 10

    # Bonus for native script (Devanagari, Telugu, etc.)
    native_chars = sum(1 for c in text if ord(c) > 127)
    if native_chars > 0:
        score += 20

    # Bonus for reasonable length
    if 5 <= len(text.split()) <= 50:
        score += 10

    # Penalty for too short or too long
    if len(text.split()) < 2:
        score -= 20
    if len(text.split()) > 100:
        score -= 10

    return min(100, max(0, score))

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
STATE_RESCHEDULE        = 'RESCHEDULE'          # Reschedule appointment flow

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
                logger.info(" Sarvam AI Service initialized successfully")
            else:
                logger.warning("️ Sarvam AI Service initialized but API key missing")
        except Exception as e:
            logger.warning(f"️ Sarvam Service unavailable: {e}")
            self.sarvam = None

        # Local Voice Service (Whisper & MMS)
        try:
            self.local_voice = LocalVoiceService()
            logger.info(" Local Voice Service initialized successfully")
        except Exception as e:
            logger.warning(f"️ Local Voice Service initialization failed: {e}")
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

        # ── 1. Handle Voice / Audio ──
        if message_type == 'audio':
            session = self._get_session(sender_id)
            current_state = session.get('state', STATE_INIT)
            lang_code = session.get('data', {}).get('language', 'en')
            detected_lang = session.get('data', {}).get('detected_lang', 'en')

            # If user is in AI Chat mode, transcribe and feed to chat instead of Sarvam voice
            if current_state == STATE_CHAT:
                transcribed = self._transcribe_audio_for_chat(sender_id, media_id, detected_lang or lang_code)
                if transcribed:
                    message_content = transcribed
                    # Fall through to normal text processing
                else:
                    return
            elif self.sarvam and self.sarvam.is_available():
                # Use Sarvam for voice processing in voice chat mode
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
                    " Welcome! It looks like you're new here.\n\nPlease enter your *Full Name* to register:"
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
                    logger.info(f" Ignoring reset command '{text_lower}' during active booking for {sender_id}")
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
                logger.info(f" SmartBookingEngine handled message from {sender_id}")
                return
        except Exception as e:
            logger.error(f"SmartBookingEngine error: {e}", exc_info=True)
            # If the booking engine was mid-flow, do NOT fall through to
            # the legacy state machine (which may send the main menu).
            if booking_active:
                self.notifier.send_whatsapp_text(
                    sender_id,
                    "️ Something went wrong. Please try again or type *reset* to start over."
                )
                return
            # Otherwise fall through to old state machine

        # ── 5. State Machine (legacy — handles menu, registration, voice, AI chat) ──
        #    Guard: if the booking engine is active (booking_state != BK_IDLE)
        #    but try_handle returned False (shouldn't normally happen), don't let
        #    the legacy machine send the menu.
        if booking_active:
            logger.warning(f"️ Booking engine active but returned False for '{message_content}' from {sender_id}")
            return
        self._process_state(sender_id, current_state, message_content, session)

    # ═══════════════════════════════════════════
    #  STATE MACHINE ROUTING
    # ═══════════════════════════════════════════

    def _process_state(self, sender_id, state, input_text, session):
        data = session.get('data', {})

        # ── GLOBAL MENU INTERCEPTS ──
        # If the user taps a button/list item from the main menu, handle it immediately
        # regardless of their current state (e.g., they might be in CHAT or CONFIRM)
        global_actions = {
            'book_appointment', 'check_appointments', 'menu_more',
            'reschedule_appointment', 'list_services', 'voice_booking'
        }
        if input_text.strip().lower() in global_actions:
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._handle_menu(sender_id, input_text)
            return

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

        # ── RESCHEDULE ──
        if state == STATE_RESCHEDULE:
            self._handle_reschedule_selection(sender_id, input_text, data)
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
            logger.warning(f"️ Legacy fallback reached while booking_state={bk_state} for {sender_id}, ignoring menu send")
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

        # Detect language from user input and store in session
        detected_lang = detect_language(str(input_text))
        if detected_lang != 'en':
            data['detected_lang'] = detected_lang
            logger.info(f" Language detected: {get_language_name(detected_lang)} for {sender_id}")
        elif not data.get('detected_lang'):
            data['detected_lang'] = 'en'

        # Prepare messages array
        messages = data.get('messages', [])

        # Add patient context if available
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)
        patient_context = ""
        if patient:
            patient_context = f"The user's registered name is {patient.get('patient_name', 'Unknown')}. \n"

        # Build system message with language instruction
        lang_instruction = get_response_language_instruction(data.get('detected_lang', 'en'))
        system_message_content = (
            f"Today's date is {datetime.now().strftime('%Y-%m-%d, %A')}. {patient_context}"
            f"{lang_instruction}"
        )

        if not messages:
            messages.append({"role": "system", "content": system_message_content})
        else:
            # Update system message with latest language detection
            messages[0] = {"role": "system", "content": system_message_content}

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

        suppress_ai_reply = bool(data.pop('_suppress_next_ai_text', False))
        if suppress_ai_reply:
            logger.info(" Missing-doctor fallback already sent directly; suppressing extra AI chat text")
            messages.append({"role": "assistant", "content": "[Missing-doctor fallback sent via direct WhatsApp messages.]"})
        else:
            messages.append({"role": "assistant", "content": ai_response_text})

        # Save conversation memory
        data['messages'] = messages[-15:]  # Keep last 15 messages max
        self._transition_to(sender_id, STATE_CHAT, data)

        # Send back to WhatsApp
        if not suppress_ai_reply:
            self.notifier.send_whatsapp_text(sender_id, ai_response_text)

    def _transcribe_audio_for_chat(self, sender_id, media_id, lang_code='en'):
        """
        Download and transcribe a WhatsApp voice note for AI Chat mode.
        Uses Sarvam STT (better for Indian languages) with multi-language detection.
        Returns transcribed text, or None on failure.
        """
        if not media_id:
            self.notifier.send_whatsapp_text(sender_id, "️ Could not process voice note.")
            return None

        try:
            _status_msgs = {
                'te': ' మీ వాయిస్ మెసేజ్ ప్రాసెస్ చేస్తున్నాము...',
                'hi': ' आपका वॉइस मैसेज प्रोसेस हो रहा है...',
                'ta': ' உங்கள் குரல் செய்தியை செயலாக்குகிறோம்...',
                'kn': ' ನಿಮ್ಮ ಧ್ವನಿ ಸಂದೇಶವನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ...',
                'ur': ' آپ کا وائس پیغام پروسیس ہو رہا ہے...'
            }
            self.notifier.send_whatsapp_text(sender_id, _status_msgs.get(lang_code, " Processing your voice message..."))
            audio_path = self._download_media(media_id)

            if not audio_path:
                self.notifier.send_whatsapp_text(sender_id, "️ Could not download audio. Please try text.")
                return None

            transcribed = None
            final_lang_code = lang_code

            # PRIORITY: Use Sarvam STT for all languages (best for Indian languages)
            if self.sarvam and self.sarvam.is_available():
                try:
                    if lang_code == 'en':
                        # Auto-detect: try common Indian languages first
                        LANG_PRIORITY = ['hi', 'kn', 'te', 'ta', 'ur', 'en']
                        for try_lang in LANG_PRIORITY:
                            try:
                                sarvam_result = self.sarvam.speech_to_text(audio_path, try_lang)
                                if sarvam_result and sarvam_result.get('transcript'):
                                    transcript_text = sarvam_result['transcript'].strip()
                                    if transcript_text and len(transcript_text) > 2:
                                        if try_lang != 'en':
                                            has_native = any(ord(c) > 127 for c in transcript_text)
                                            if has_native:
                                                transcribed = transcript_text
                                                final_lang_code = try_lang
                                                logger.info(f" Chat STT found native {try_lang}: '{transcribed[:60]}'")
                                                break
                                            else:
                                                detected = detect_language(transcript_text)
                                                if detected == try_lang:
                                                    transcribed = transcript_text
                                                    final_lang_code = try_lang
                                                    break
                                                elif not transcribed:
                                                    transcribed = transcript_text
                                                    final_lang_code = try_lang
                                        else:
                                            if not transcribed:
                                                transcribed = transcript_text
                                                final_lang_code = 'en'
                            except Exception as e:
                                logger.warning(f"Sarvam STT {try_lang} failed: {e}")
                                continue
                    else:
                        # Use specified language directly
                        sarvam_result = self.sarvam.speech_to_text(audio_path, lang_code)
                        if sarvam_result and sarvam_result.get('transcript'):
                            transcribed = sarvam_result['transcript']
                            final_lang_code = lang_code
                            logger.info(f" Chat Sarvam STT ({lang_code}): '{transcribed}'")
                except Exception as e:
                    logger.warning(f"Sarvam STT failed: {e}")

            # Only fallback to Groq Whisper as last resort
            if not transcribed and self.stt:
                logger.warning("️ Sarvam STT failed, trying Groq Whisper as last resort")
                transcribed = self.stt.transcribe_audio_file(audio_path, lang_code)

            # Update lang_code for response
            lang_code = final_lang_code

            # Clean up temp file
            try:
                os.remove(audio_path)
            except Exception:
                pass

            if not transcribed or self._is_garbage_transcript(transcribed):
                # Try post-processing before giving up
                if transcribed:
                    processed = post_process_stt(transcribed, language_code=lang_code)
                    if processed.get('is_likely_appointment_intent') and processed.get('corrected'):
                        logger.info(f" STT post-processing corrected: '{transcribed}'  '{processed['corrected']}'")
                        transcribed = processed['corrected']
                    else:
                        # Still garbage after post-processing
                        self.notifier.send_whatsapp_text(
                            sender_id, "️ Could not understand audio. Please try again or use text."
                        )
                        return None
                else:
                    self.notifier.send_whatsapp_text(
                        sender_id, "️ Could not understand audio. Please try again or use text."
                    )
                    return None

            logger.info(f" Chat voice transcription ({lang_code}): '{transcribed}'")

            _heard_prefix = {'te': ' నేను విన్నది', 'hi': ' मैंने सुना', 'ta': ' நான் கேட்டது', 'kn': ' ನಾನು ಕೇಳಿದ್ದು', 'ur': ' میں نے سنا'}
            self.notifier.send_whatsapp_text(sender_id, f"{_heard_prefix.get(lang_code, ' I heard')}: \"{transcribed}\"")
            return transcribed

        except Exception as e:
            logger.error(f"Chat audio transcription failed: {e}")
            self.notifier.send_whatsapp_text(sender_id, "️ Voice processing failed. Please use text.")
            return None


    def _normalize_doctor_text(self, value):
        """Normalize doctor/specialization text for tolerant matching."""
        text = str(value or "").lower()
        text = text.replace('dr.', ' ').replace('dr ', ' ').replace('doctor', ' ')
        text = re.sub(r"[^a-z0-9\s]", " ", text)
        return " ".join(text.split())

    def _extract_specialization_hint(self, doctor_query, candidate_doctors):
        """Try to infer specialization from a combined query like 'Dr X cardiologist'."""
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

    def _match_doctors_with_specialization(self, doctor_query, doctors, specialization_hint=None):
        """Match doctor by name and, when present, narrow by specialization hint."""
        query_norm = self._normalize_doctor_text(doctor_query)
        if not query_norm or not doctors:
            return []

        query_tokens = [tok for tok in query_norm.split() if len(tok) >= 2]
        matched_doctors = []

        for doctor in doctors:
            doctor_name_norm = self._normalize_doctor_text(doctor.get('full_name', ''))
            if not doctor_name_norm:
                continue

            if len(doctor_name_norm) >= 2:
                if query_norm in doctor_name_norm or doctor_name_norm in query_norm:
                    matched_doctors.append(doctor)
                    continue
            elif doctor_name_norm in query_norm.split():
                matched_doctors.append(doctor)
                continue

            doctor_name_tokens = [tok for tok in doctor_name_norm.split() if len(tok) >= 2]
            if doctor_name_tokens and query_tokens:
                overlap = set(doctor_name_tokens).intersection(query_tokens)
                if overlap and len(overlap) >= min(2, len(doctor_name_tokens), len(query_tokens)):
                    matched_doctors.append(doctor)

        if not matched_doctors:
            return []

        effective_spec = specialization_hint or self._extract_specialization_hint(doctor_query, matched_doctors)
        if not effective_spec:
            return matched_doctors

        spec_hint_norm = self._normalize_doctor_text(effective_spec)
        if not spec_hint_norm:
            return matched_doctors

        hint_tokens = [tok for tok in spec_hint_norm.split() if len(tok) >= 4]
        narrowed = []
        for doctor in matched_doctors:
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

        return narrowed or matched_doctors

    def _build_doctor_disambiguation_message(self, doctor_query, matched_doctors, lang_code='en'):
        """Build an explicit disambiguation prompt when multiple doctors match."""
        if not matched_doctors:
            return "Multiple doctors match. Please specify the doctor name and specialization."

        unique_names = {
            str(d.get('full_name', '')).strip().lower()
            for d in matched_doctors
            if d.get('full_name')
        }
        cleaned_query = str(doctor_query or '').strip()

        if len(unique_names) == 1:
            raw_name = next(iter(unique_names))
            doctor_label = re.sub(r'^\s*dr\.?\s*', '', raw_name, flags=re.IGNORECASE).title()
            if not doctor_label:
                doctor_label = cleaned_query or "this doctor"
            doctor_label_loc = LocalizationService.get_bilingual_name(f"Dr. {doctor_label}", lang_code)
            header = (
                f"There are {len(matched_doctors)} doctors named {doctor_label_loc} with different specializations:\n"
            )
        else:
            label = cleaned_query or "your request"
            header = f"Multiple doctors match '{label}':\n"

        body = ""
        for doctor in matched_doctors[:10]:
            name = str(doctor.get('full_name', 'Unknown')).strip()
            name_clean = name.replace('Dr.', '').replace('dr.', '').strip()
            doc_name = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang_code)
            specialization = str(doctor.get('specialization', 'General')).strip()
            spec_loc = LocalizationService.get_bilingual_name(specialization, lang_code)
            body += f"- {doc_name} ({spec_loc})\n"

        footer = "Which doctor do you need? Please tell the exact doctor name or specialization."
        return header + body + footer

    def _build_missing_doctor_line(self, missing_doctor_name=None, lang_code='en'):
        """Build the explicit missing-doctor line requested by users."""
        requested_name = re.sub(
            r'^\s*dr\.?\s*',
            '',
            str(missing_doctor_name or '').strip(),
            flags=re.IGNORECASE
        )
        if requested_name:
            doc_name = LocalizationService.get_bilingual_name(f"Dr. {requested_name}", lang_code)
            return f"{doc_name} is not there in our database."
        else:
            return "That doctor is not there in our database."

    def _build_present_doctors_list_message(self, doctors, limit=10, include_prompt=False, lang_code='en'):
        """Build numbered present-doctors list with specialization."""
        if not doctors:
            return "No active doctors are currently available in the hospital."

        lines = []
        for doc in doctors[:limit]:
            name = str(doc.get('full_name', '') or '').strip()
            if not name:
                continue
            name_clean = name.replace('Dr.', '').replace('dr.', '').strip()
            doc_name = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang_code)
            specialization = str(doc.get('specialization', 'General') or 'General').strip() or 'General'
            spec_loc = LocalizationService.get_bilingual_name(specialization, lang_code)
            lines.append(f"{len(lines) + 1}. {doc_name} ({spec_loc})")

        if not lines:
            return "No active doctors are currently available in the hospital."

        message = "Present doctors:\n" + "\n".join(lines)
        if include_prompt:
            message += "\nPlease choose one doctor from the present doctors list."
        return message

    def _build_available_doctors_fallback_message(self, doctors, missing_doctor_name=None, limit=10, lang_code='en'):
        """Build explicit not-found + numbered present-doctors fallback text."""
        missing_line = self._build_missing_doctor_line(missing_doctor_name, lang_code)
        present_doctors = self._build_present_doctors_list_message(doctors, limit=limit, lang_code=lang_code)
        return f"{missing_line}\n{present_doctors}"

    def _send_missing_doctor_two_step_messages(self, sender_id, doctors, missing_doctor_name=None, limit=10, lang_code='en'):
        """Send strict 2-step fallback for unknown doctors.

        1) Dr. <name> is not there in our database.
        2) Present doctors:\n1. Dr. <name> (<specialization>) ...
        """
        missing_line = self._build_missing_doctor_line(missing_doctor_name, lang_code)
        present_doctors = self._build_present_doctors_list_message(doctors, limit=limit, lang_code=lang_code)
        self.notifier.send_whatsapp_text(sender_id, missing_line)
        self.notifier.send_whatsapp_text(sender_id, present_doctors)
        return missing_line, present_doctors


    def _tool_execution_callback(self, sender_id, tool_name, tool_args, session_data):
        """Executes actual backend functions when LLM calls a tool.
        Uses booking_utils for date validation (reject past/today),
        smart time resolution (auto-resolve AM/PM via doctor schedule),
        and slot-based end_time from doctor's actual schedule.
        """
        today = datetime.now().date()
        lang_code = session_data.get('detected_lang', 'en') if isinstance(session_data, dict) else 'en'
        try:
            if tool_name == "list_available_doctors":
                date_input = tool_args.get("date")
                specialization = tool_args.get("specialization")

                # Resolve and validate date
                date_str = None
                if date_input:
                    resolved, date_err = resolve_date(date_input, today)
                    if date_err:
                        return date_err
                    date_str = resolved
                    if not date_str:
                        # Try old parser as fallback
                        date_str = self._parse_natural_date(date_input)

                doctors = self.appt_service.get_active_doctors(specialization=specialization)
                if not doctors:
                    if specialization:
                        return f"No doctors found for specialization '{specialization}'."
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

                    result = f"On {date_str}, these doctors are available:\n"
                    for doc in available_doctors:
                        name_clean = doc['name'].replace('Dr.', '').replace('dr.', '').strip()
                        doc_name = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang_code)
                        spec_loc = LocalizationService.get_bilingual_name(doc['specialization'], lang_code)
                        result += f"- {doc_name} ({spec_loc}) — {', '.join(doc['shifts'])}\n"
                    return result
                else:
                    result = "Our available doctors:\n"
                    for doc in doctors[:10]:
                        name_clean = doc['full_name'].replace('Dr.', '').replace('dr.', '').strip()
                        doc_name = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang_code)
                        spec_loc = LocalizationService.get_bilingual_name(doc.get('specialization', 'General'), lang_code)
                        result += f"- {doc_name} ({spec_loc})\n"
                    return result

            elif tool_name == "check_availability":
                doctor_name = tool_args.get("doctor_name", "").strip()
                date_input = tool_args.get("date", "").strip()
                time_input = tool_args.get("time")

                if not doctor_name:
                    return "I need a doctor name to check availability."
                if not date_input:
                    return "I need a date to check availability."

                # Resolve and validate date (reject past/today)
                date_str, date_err = resolve_date(date_input, today)
                if date_err:
                    return date_err
                if not date_str:
                    date_str = self._parse_natural_date(date_input)
                if not date_str:
                    is_valid, err = validate_booking_date(date_input, today)
                    if not is_valid:
                        return err or f"Invalid date '{date_input}'."
                    date_str = date_input

                # Match Doctor — handle multiple matches for disambiguation
                specialization_hint = tool_args.get("specialization")
                doctors = self.appt_service.get_active_doctors()
                matched_doctors = self._match_doctors_with_specialization(
                    doctor_name,
                    doctors,
                    specialization_hint
                )

                if not matched_doctors:
                    missing_line, present_doctors = self._send_missing_doctor_two_step_messages(
                        sender_id,
                        doctors,
                        doctor_name,
                        limit=10,
                        lang_code=lang_code
                    )
                    if isinstance(session_data, dict):
                        session_data['_suppress_next_ai_text'] = True
                    return f"{missing_line}\n{present_doctors}"

                # If multiple doctors match, ask for disambiguation
                if len(matched_doctors) > 1:
                    return self._build_doctor_disambiguation_message(doctor_name, matched_doctors, lang_code=lang_code)

                matched_doctor = matched_doctors[0]
                doctor_id = matched_doctor['user_id']
                doctor_specialization = matched_doctor.get('specialization', 'General')
                name_clean = matched_doctor.get('full_name', '').replace('Dr.', '').replace('dr.', '').strip()
                doc_name = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang_code)
                spec_loc = LocalizationService.get_bilingual_name(doctor_specialization, lang_code)

                # Get shifts and slots
                shifts = self.appt_service.get_available_shifts(doctor_id, date_str)
                if not shifts:
                    weekly = get_doctor_weekly_schedule(doctor_id, self.appt_service)
                    return (
                        f"{doc_name} ({spec_loc}) is NOT available on {date_str}.\n"
                        f"Their weekly schedule:\n{weekly}"
                    )

                all_slots = []
                for s in shifts:
                    slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                    if slots:
                        all_slots.extend([slot['start'] for slot in slots])

                if not all_slots:
                    return f"All slots are booked for {doc_name} on {date_str}."

                # Smart time resolution if time was provided
                if time_input:
                    resolved_time, time_err = resolve_ambiguous_time(
                        time_input, doctor_id, date_str, self.appt_service
                    )
                    if time_err and not resolved_time:
                        return time_err
                    check_time = resolved_time or resolve_time(time_input) or time_input
                    display_check_time = self._format_time_display(check_time)

                    if check_time in all_slots:
                        return (
                            f"Yes, {display_check_time} is available on {date_str} with "
                            f"{doc_name} ({spec_loc})."
                        )
                    else:
                        available_display = ', '.join(self._format_time_display(slot_time) for slot_time in all_slots[:8])
                        return (
                            f"No, {display_check_time} is NOT available. "
                            f"Available slots: {available_display}."
                        )
                else:
                    all_slots_display = ', '.join(self._format_time_display(slot_time) for slot_time in all_slots[:10])
                    return (
                        f"Available slots on {date_str} for {doc_name} "
                        f"({spec_loc}) are: {all_slots_display}."
                    )

            elif tool_name == "book_appointment":
                patient_name_input = tool_args.get("patient_name", "").strip()
                doctor_name = tool_args.get("doctor_name", "").strip()
                date_input = tool_args.get("date", "").strip()
                time_input = tool_args.get("time", "").strip()

                if not all([doctor_name, date_input, time_input]):
                    return "I need doctor name, date, and time to book."

                # Resolve and validate date (reject past/today)
                date_str, date_err = resolve_date(date_input, today)
                if date_err:
                    return date_err
                if not date_str:
                    date_str = self._parse_natural_date(date_input)
                if not date_str:
                    is_valid, err = validate_booking_date(date_input, today)
                    if not is_valid:
                        return err or f"Invalid date '{date_input}'."
                    date_str = date_input

                # Match Doctor — handle multiple matches
                specialization_hint = tool_args.get("specialization")
                doctors = self.appt_service.get_active_doctors()
                matched_doctors = self._match_doctors_with_specialization(
                    doctor_name,
                    doctors,
                    specialization_hint
                )

                if not matched_doctors:
                    missing_line, present_doctors = self._send_missing_doctor_two_step_messages(
                        sender_id,
                        doctors,
                        doctor_name
                    )
                    if isinstance(session_data, dict):
                        session_data['_suppress_next_ai_text'] = True
                    return f"{missing_line}\n{present_doctors}"

                if len(matched_doctors) > 1:
                    return self._build_doctor_disambiguation_message(doctor_name, matched_doctors)

                matched_doctor = matched_doctors[0]
                doctor_id = matched_doctor['user_id']
                doctor_specialization = matched_doctor.get('specialization', 'General')

                # Smart time resolution using doctor's schedule
                resolved_time, time_err = resolve_ambiguous_time(
                    time_input, doctor_id, date_str, self.appt_service
                )
                if time_err and not resolved_time:
                    return time_err
                time_str = resolved_time or resolve_time(time_input) or time_input

                # Look up actual slot to get real end_time from doctor's schedule
                end_time_str = None
                shifts = self.appt_service.get_available_shifts(doctor_id, date_str)
                for s in shifts:
                    slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                    if slots:
                        matching_slot = next((sl for sl in slots if sl['start'] == time_str), None)
                        if matching_slot:
                            end_time_str = matching_slot['end']
                            break

                if not end_time_str:
                    # Slot not found — collect all available slots and report them
                    all_available = []
                    for s in shifts:
                        slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                        if slots:
                            all_available.extend([sl['start'] for sl in slots])
                    slots_str = (
                        ', '.join(self._format_time_display(slot_time) for slot_time in all_available[:10])
                        if all_available else 'No slots available'
                    )
                    return (
                        f"The slot at {self._format_time_display(time_str)} is NOT available with {doc_name} ({spec_loc}) on {date_str}. "
                        f"Available slots: {slots_str}. "
                        f"Please ask the user which slot they want."
                    )

                # Determine Patient Details
                clean_phone = sender_id.replace('+', '').replace(' ', '')
                patient_rec = self.patient_service.get_patient_by_phone(clean_phone)

                if not patient_rec:
                    return "Error: Patient not registered properly."

                patient_id = patient_rec['patient_id']
                booked_for_name = patient_rec.get('patient_name', 'Unknown')

                if patient_name_input and patient_name_input.lower() not in ['self', '', 'me', booked_for_name.lower()]:
                    booked_for_name = patient_name_input

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
                    return (
                        f"SUCCESS. Booked for patient {booked_for_name} with {doc_name} "
                        f"({spec_loc}) on {date_str} at {self._format_time_display(time_str)}-{self._format_time_display(end_time_str)}. "
                        f"Inform the user with all confirmation details."
                    )
                else:
                    return "FAILED to book appointment. System error or slot conflict. Ask user to try another time."

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
            f"Nice to meet you, {name}! \n\nPlease enter your *Email Address*:"
        )

    def _register_email(self, sender_id, email, data):
        # Basic email validation
        if '@' not in email or '.' not in email:
            self.notifier.send_whatsapp_text(sender_id, "️ Please enter a valid email address (e.g. name@example.com):")
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
            " *Registration Complete!*\n\n"
            "You can now access our Patient Web Dashboard to view your appointments and details.\n\n"
            f" *Login ID:* {patient_id}\n"
            f" *Password:* {plain_pwd}\n\n"
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
            self._transition_to(sender_id, STATE_LANG_SELECT, {'flow_type': 'text_booking'}, clear_data=True)
            self.notifier.send_whatsapp_buttons(
                sender_id,
                " *Select Your Preferred Language*\n\nChoose a language:",
                ["English", "हिन्दी (Hindi)", "Other Languages"],
                ["lang_en", "lang_hi", "lang_more"]
            )
        elif action == 'check_appointments':
            self._check_appointments(sender_id)
        elif action == 'menu_more':
            # Step 3: User tapped "More Options"  send full list
            items = [
                ("book_appointment", " Book Appointment", "Book a new appointment"),
                ("check_appointments", " Check Appointments", "View upcoming appointments"),
                ("reschedule_appointment", " Reschedule", "Modify your current booking"),
                ("list_services", " Services", "Browse available services"),
                ("voice_booking", " Voice Booking", "Book via voice in your language"),
            ]
            self.notifier.send_whatsapp_list(
                sender_id,
                " How can I help you today?",
                items,
                title="All Options",
                button_text="See all options"
            )
        elif action == 'reschedule_appointment':
            self._start_reschedule(sender_id)
        elif action == 'list_services':
            self._list_services(sender_id)
        elif action in ['voice_booking', 'voice', 'call']:
            self._start_voice_flow(sender_id)
        else:
            # Route freeform text / non-English to AI chat for intelligent handling
            detected_lang = detect_language(input_text)
            is_freeform = len(input_text.strip()) > 5 and not action.startswith(('book_', 'check_', 'list_', 'menu_', 'reschedule_'))

            if detected_lang != 'en' or is_freeform:
                # Switch to AI chat mode and process the message there
                logger.info(f" Routing freeform text to AI chat (lang={detected_lang}): '{input_text[:50]}'")
                session = self._get_session(sender_id)
                data = session.get('data', {})
                data['detected_lang'] = detected_lang
                self._transition_to(sender_id, STATE_CHAT, data)
                self._handle_ai_chat(sender_id, input_text, data)
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
            
            def is_dummy_name(name):
                if not name: return True
                nl = name.lower()
                return 'test whatsapp user' in nl or 'whatsapp user' in nl or 'test user' in nl or nl in ['guest', 'you', 'test', 'unknown']

                session = self._get_session(sender_id)
                lang = session.get('data', {}).get('language', 'en')
                ask_name = LocalizationService.get('ask_own_name', lang)
                
                self._transition_to(sender_id, STATE_GUEST_NAME, {'updating_own_name': True})
                self.notifier.send_whatsapp_text(sender_id, ask_name)
                return

            self._transition_to(sender_id, STATE_SELECT_SERVICE, {
                'booked_for': 'self',
                'patient_name': patient_name
            })
            self._send_service_list(sender_id)

        elif text == 'book_other' or any(w in text for w in ['other', 'someone', 'else']):
            session = self._get_session(sender_id)
            lang = session.get('data', {}).get('language', 'en')
            ask_name = LocalizationService.get('ask_patient_name', lang)
            
            self._transition_to(sender_id, STATE_GUEST_NAME, {'updating_own_name': False})
            self.notifier.send_whatsapp_text(sender_id, ask_name)

        else:
            session = self._get_session(sender_id)
            lang = session.get('data', {}).get('language', 'en')
            book_who = LocalizationService.get('book_who', lang)
            btn_myself = LocalizationService.get('btn_myself', lang)
            btn_someone_else = LocalizationService.get('btn_someone_else', lang)
            
            self.notifier.send_whatsapp_text(sender_id, "Please select *Myself* or *Someone Else*.")
            self.notifier.send_whatsapp_buttons(
                sender_id,
                book_who,
                [btn_myself[:20], btn_someone_else[:20]],
                ["book_self", "book_other"]
            )

    def _handle_guest_name(self, sender_id, patient_name):
        session = self._get_session(sender_id)
        data = session.get('data', {})
        updating_own_name = data.get('updating_own_name', False)

        if updating_own_name:
            booked_for = 'self'
            clean_phone = sender_id.replace('+', '').replace(' ', '')
            self.patient_service.db.patients.update_one(
                {'phone': clean_phone},
                {'$set': {'patient_name': patient_name}}
            )
            self.db.wa_users.update_one(
                {'phone': clean_phone},
                {'$set': {'name': patient_name}}
            )
            self.notifier.send_whatsapp_text(sender_id, f" Name updated to: *{patient_name}*")
        else:
            booked_for = 'other'
            self.notifier.send_whatsapp_text(sender_id, f" Booking for: *{patient_name}*")

        self._transition_to(sender_id, STATE_SELECT_SERVICE, {
            'booked_for': booked_for,
            'patient_name': patient_name
        })
        self._send_service_list(sender_id)

    # ═══════════════════════════════════════════
    #  SERVICE SELECTION
    # ═══════════════════════════════════════════

    def _send_service_list(self, sender_id):
        session = self._get_session(sender_id)
        lang = session.get('data', {}).get('language', 'en')
        no_services = LocalizationService.get('no_services', lang)
        see_all_options = LocalizationService.get('see_all_options', lang)
        select_service = LocalizationService.get('select_service', lang)
        
        services = self.appt_service.get_services()
        if not services:
            self.notifier.send_whatsapp_text(sender_id, no_services)
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        # Step 1: Show top 2 services as buttons + "See all options"
        top_services = services[:2]
        btn_titles = [LocalizationService.get_bilingual_name(svc['service_name'], lang)[:20] for svc in top_services] + [see_all_options[:20]]
        btn_ids = [f"svc_{svc['service_id']}" for svc in top_services] + ["svc_more"]
        self.notifier.send_whatsapp_buttons(
            sender_id,
            f" {select_service}",
            btn_titles[:3],
            btn_ids[:3]
        )

    def _handle_service_selection(self, sender_id, selection_id):
        session = self._get_session(sender_id)
        lang = session.get('data', {}).get('language', 'en')
        
        # Step 2: User tapped "See all options"  send full service list
        if selection_id == 'svc_more':
            services = self.appt_service.get_services()
            if not services:
                no_services = LocalizationService.get('no_services', lang)
                self.notifier.send_whatsapp_text(sender_id, no_services)
                return
            items = []
            for svc in services[:10]:
                svc_bilingual = LocalizationService.get_bilingual_name(svc['service_name'], lang)
                items.append((
                    f"svc_{svc['service_id']}",
                    svc_bilingual[:24],
                    svc.get('category', '')
                ))
                
            select_service = LocalizationService.get('select_service', lang)
            all_services = LocalizationService.get('all_services', lang)
            view_services = LocalizationService.get('view_services', lang)
            
            self.notifier.send_whatsapp_list(
                sender_id,
                f" {select_service}",
                items,
                title=all_services[:24],
                button_text=view_services[:20]
            )
            return

        service_id = None
        
        # Check if it's a list/button selection
        if selection_id.startswith('svc_'):
            service_id = selection_id.replace('svc_', '', 1)
        else:
            # Try to match text input to a service name
            import string
            input_clean = selection_id.translate(str.maketrans('', '', string.punctuation)).strip().lower()
            
            services = self.appt_service.get_services()
            service_names = [s['service_name'] for s in services]
            logger.info(f" fuzzy match input='{input_clean}' against {service_names}")
            
            # Exact/Partial match on service name
            matched = next((s for s in services if s['service_name'].lower().strip() == input_clean or input_clean in s['service_name'].lower() or s['service_name'].lower().strip() in input_clean), None)
            
            if matched:
                service_id = matched['service_id']
        
        if not service_id:
            invalid_selection = LocalizationService.get('invalid_selection', lang)
            self.notifier.send_whatsapp_text(sender_id, invalid_selection)
            self._send_service_list(sender_id)
            return

        service = self.appt_service.get_service_by_id(service_id)

        if not service:
            self.notifier.send_whatsapp_text(sender_id, "Service not found.")
            return

        # Find doctors for this service
        doctors = self.appt_service.get_doctors_by_service(service_id)

        if not doctors:
            no_doctors_service = LocalizationService.get('no_doctors_service', lang)
            self.notifier.send_whatsapp_text(
                sender_id,
                f"*{service['service_name']}* - {no_doctors_service}"
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
        session = self._get_session(sender_id)
        lang = session.get('data', {}).get('language', 'en')
        select_doctor = LocalizationService.get('select_doctor', lang)
        see_all_options = LocalizationService.get('see_all_options', lang)
        
        if len(doctors) <= 2:
            # 2 or fewer doctors — show as buttons directly (no "See all" needed)
            btn_titles = []
            btn_ids = []
            for doc in doctors:
                name_clean = doc['full_name'].replace('Dr.', '').replace('dr.', '').strip()
                dr_bilingual = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang)
                btn_titles.append(dr_bilingual[:20])
                btn_ids.append(f"doc_{doc['user_id']}")
            self.notifier.send_whatsapp_buttons(
                sender_id,
                f"‍️ {select_doctor}",
                btn_titles,
                btn_ids
            )
        else:
            # Step 1: Show top 2 doctors as buttons + "See all options"
            top_docs = doctors[:2]
            btn_titles = []
            btn_ids = []
            for doc in top_docs:
                name_clean = doc['full_name'].replace('Dr.', '').replace('dr.', '').strip()
                dr_bilingual = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang)
                btn_titles.append(dr_bilingual[:20])
                btn_ids.append(f"doc_{doc['user_id']}")
            btn_titles.append(see_all_options[:20])
            btn_ids.append("doc_more")
            self.notifier.send_whatsapp_buttons(
                sender_id,
                f"‍️ {select_doctor}",
                btn_titles[:3],
                btn_ids[:3]
            )
            # Store the full doctor list in session for the doc_more handler
            doc_ids = [doc['user_id'] for doc in doctors[:10]]
            self._transition_to(sender_id, STATE_SELECT_DOCTOR, {'_pending_doctor_ids': doc_ids})

    def _handle_doctor_selection(self, sender_id, selection_id, data=None):
        session = self._get_session(sender_id)
        lang = session.get('data', {}).get('language', 'en')
        
        # Step 2: User tapped "See all options"  send full doctor list
        if selection_id == 'doc_more':
            data = data or {}
            service_id = data.get('service_id')
            pending_ids = data.get('_pending_doctor_ids', [])
            if service_id:
                doctors = self.appt_service.get_doctors_by_service(service_id)
            elif pending_ids:
                doctors = [self.appt_service.get_doctor_by_id(did) for did in pending_ids]
                doctors = [d for d in doctors if d]  # filter None
            else:
                doctors = self.appt_service.get_active_doctors()
            items = []
            for doc in doctors[:10]:
                name_clean = doc['full_name'].replace('Dr.', '').replace('dr.', '').strip()
                dr_bilingual = LocalizationService.get_bilingual_name(f"Dr. {name_clean}", lang)
                spec = doc.get('specialization', '')
                spec_bilingual = LocalizationService.get_bilingual_name(spec, lang)
                items.append((f"doc_{doc['user_id']}", dr_bilingual[:24], spec_bilingual[:72]))
                
            select_doctor = LocalizationService.get('select_doctor', lang)
            all_doctors = LocalizationService.get('all_doctors', lang)
            select_btn = LocalizationService.get('select', lang)
            
            self.notifier.send_whatsapp_list(
                sender_id,
                f"‍️ {select_doctor}",
                items,
                title=all_doctors[:24],
                button_text=select_btn[:20]
            )
            return

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
            self.notifier.send_whatsapp_text(sender_id, "Invalid selection. Please tap or select a valid option from the list.")
            
            # Re-send the doctor list so the user can try again
            service_id = (data or {}).get('service_id')
            if service_id:
                doctors = self.appt_service.get_doctors_by_service(service_id)
            else:
                doctors = self.appt_service.get_active_doctors()
            if doctors:
                self._send_doctor_list(sender_id, doctors)
            return

        doctor = self.appt_service.get_doctor_by_id(doctor_id)

        if not doctor:
            self.notifier.send_whatsapp_text(sender_id, "Doctor not found. Please tap or select a valid option from the list.")
            service_id = (data or {}).get('service_id')
            if service_id:
                doctors = self.appt_service.get_doctors_by_service(service_id)
            else:
                doctors = self.appt_service.get_active_doctors()
            if doctors:
                self._send_doctor_list(sender_id, doctors)
            return

        self._transition_to(sender_id, STATE_SELECT_DATE, {
            'doctor_id': doctor_id,
            'doctor_name': doctor['full_name'],
            'doctor_specialization': doctor.get('specialization', 'General')
        })
        self._send_available_dates(sender_id, doctor_id, doctor['full_name'])

    # ═══════════════════════════════════════════
    #  DATE SELECTION
    # ═══════════════════════════════════════════

    def _send_available_dates(self, sender_id, doctor_id, doctor_name):
        session = self._get_session(sender_id)
        lang = session.get('data', {}).get('language', 'en')
        
        available = self.appt_service.get_doctor_available_dates(doctor_id, num_dates=10)

        if not available:
            no_dates = LocalizationService.get('no_dates_doctor', lang)
            self.notifier.send_whatsapp_text(
                sender_id,
                f"Dr. {doctor_name} - {no_dates}"
            )
            self._transition_to(sender_id, STATE_MENU, clear_data=True)
            self._send_main_menu(sender_id)
            return

        items = []
        for d in available:
            items.append((
                f"date_{d['date']}",
                d['display'][:24],
                d['date']
            ))

        select_date = LocalizationService.get('select_date', lang)
        available_dates = LocalizationService.get('available_dates', lang)

        self.notifier.send_whatsapp_list(
            sender_id,
            f" Dr. {doctor_name}\n{select_date}",
            items,
            title=available_dates[:24]
        )

    def _parse_natural_date(self, text):
        """Resolve natural language date to YYYY-MM-DD. Delegates to booking_utils."""
        today = datetime.now().date()
        date_str, _ = resolve_date(text, today)
        return date_str

    def _parse_natural_time(self, text):
        """Resolve natural language time to HH:MM. Delegates to booking_utils."""
        result = resolve_time(text)
        return result if result else text  # Return as-is if can't parse

    def _format_time_display(self, time_str):
        """Format time for WhatsApp user-facing text (24h -> 12h AM/PM)."""
        if not time_str:
            return ''
        return self.appt_service.format_time_ampm(str(time_str))

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
                logger.info(f" Resolved natural date '{date_str}'  {resolved}")
                date_str = resolved
            else:
                self.notifier.send_whatsapp_text(sender_id, "Invalid date. Please select from the list.")
                self._send_available_dates(sender_id, data.get('doctor_id', ''), data.get('doctor_name', ''))
                return


        # Collect ALL available slots across all schedule entries (no shift step)
        shifts = self.appt_service.get_available_shifts(data['doctor_id'], date_str)

        if not shifts:
            self.notifier.send_whatsapp_text(
                sender_id,
                f"No available slots on {date_str}. Try another date."
            )
            self._send_available_dates(sender_id, data['doctor_id'], data.get('doctor_name', ''))
            return

        # Gather all free slots from every schedule block
        all_slots = []
        for s in shifts:
            block_slots = self.appt_service.get_shift_slots(
                data['doctor_id'], date_str, s['start'], s['end']
            )
            all_slots.extend(block_slots)

        if not all_slots:
            self.notifier.send_whatsapp_text(
                sender_id,
                f"All slots are booked on {date_str}. Try another date."
            )
            self._send_available_dates(sender_id, data['doctor_id'], data.get('doctor_name', ''))
            return

        # Skip shift step — go directly to time selection
        self._transition_to(sender_id, STATE_SELECT_TIME, {'date': date_str})

        # ── Text message with ALL slots ──
        msg_lines = [
            f" *Available Slots ({len(all_slots)})*",
            f"Dr. {data.get('doctor_name', '?')} | {date_str}\n",
        ]
        for i, slot in enumerate(all_slots, 1):
            msg_lines.append(
                f"  {i}. {self._format_time_display(slot['start'])} – {self._format_time_display(slot['end'])}"
            )
        msg_lines.append("\nReply with a *number* or *time* (e.g. '9 AM').")
        self.notifier.send_whatsapp_text(sender_id, '\n'.join(msg_lines))

        # ── Interactive list (WhatsApp max 10 rows) ──
        items = []
        for slot in all_slots[:10]:
            items.append((
                f"time_{slot['start']}",
                f" {self._format_time_display(slot['start'])}",
                f"{self._format_time_display(slot['start'])} – {self._format_time_display(slot['end'])}"
            ))

        list_header = (
            f" Available slots\n"
            f"Dr. {data.get('doctor_name', '?')} | {date_str}"
        )
        if len(all_slots) > 10:
            list_header += f"\nTap for slots 1-10. For 11-{len(all_slots)}, reply with the number."
        self.notifier.send_whatsapp_list(
            sender_id,
            list_header,
            items,
            title="Time Slots"
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
                    logger.info(f" Fuzzy matched shift '{text_clean}'  {matched_shift['shift_name']}")

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
            f" *Available Slots ({len(slots)}) — {shift_name} shift*",
            f"Dr. {data.get('doctor_name', '?')} | {data['date']}\n",
        ]
        for i, slot in enumerate(slots, 1):
            msg_lines.append(
                f"  {i}. {self._format_time_display(slot['start'])} – {self._format_time_display(slot['end'])}"
            )
        msg_lines.append("\nReply with a *number* or *time* (e.g. '9 AM').")
        self.notifier.send_whatsapp_text(sender_id, '\n'.join(msg_lines))

        # ── Interactive list (WhatsApp max 10 rows) ──
        items = []
        for slot in slots[:10]:
            items.append((
                f"time_{slot['start']}",
                f" {self._format_time_display(slot['start'])}",
                f"{self._format_time_display(slot['start'])} – {self._format_time_display(slot['end'])}"
            ))

        list_header = (
            f" Available slots ({shift_name} shift)\n"
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

            # Get available slots to match against (all schedule blocks combined)
            slots = self.appt_service.get_all_date_slots(
                data['doctor_id'], data['date']
            )
            free_times = [s['start'] for s in slots]  # e.g. ['07:00', '07:30', '08:00']

            # Word-to-number map for spoken numbers
            word_nums = {
                'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
                'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12
            }

            # Try to extract hour (and optional minutes) from input
            matched_time = None

            # First, check if input is a slot number (1-index based) matching the presented list
            num_match = re.match(r'^\s*(\d{1,2})\s*$', text_clean)
            if num_match:
                idx = int(num_match.group(1)) - 1
                if 0 <= idx < len(free_times):
                    matched_time = free_times[idx]
                    input_text = f"time_{matched_time}"
            
            if not matched_time:
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
                logger.info(f" Fuzzy matched time '{text_clean}' -> {matched_time}")
            elif matched_time and not input_text.startswith('time_'):
                # Try closest match (e.g. user says "7" but slot is "07:00")
                closest = next((t for t in free_times if t.startswith(matched_time[:2] + ':')), None)
                if closest:
                    input_text = f"time_{closest}"
                    logger.info(f" Closest time match '{text_clean}' -> {closest}")

            if not input_text.startswith('time_'):
                self.notifier.send_whatsapp_text(sender_id, "Invalid selection. Please pick a time slot.")
                return

        time_str = input_text.replace('time_', '', 1)

        # Double-check availability (concurrency guard)
        slots = self.appt_service.get_all_date_slots(
            data['doctor_id'], data['date']
        )
        free_times = [s['start'] for s in slots]

        if time_str not in free_times:
            self.notifier.send_whatsapp_text(
                sender_id,
                "️ That slot was just taken! Please select another."
            )
            # Re-send date selection so user can try again
            self._send_available_dates(sender_id, data['doctor_id'], data.get('doctor_name', ''))
            self._transition_to(sender_id, STATE_SELECT_DATE)
            return

        # Calculate end time from slot_duration
        matched_slot = next((s for s in slots if s['start'] == time_str), None)
        end_time = matched_slot['end'] if matched_slot else (
            datetime.strptime(time_str, '%H:%M') + timedelta(minutes=30)
        ).strftime('%H:%M')

        self._transition_to(sender_id, STATE_CONFIRM, {'time': time_str, 'end_time': end_time})

        patient_name = data.get('patient_name', 'You')
        booked_for = data.get('booked_for', 'self')

        lang = data.get('language', 'en')
        confirm_title = LocalizationService.get('confirm_title', lang)
        confirm_prompt = LocalizationService.get('confirm_prompt', lang)
        btn_confirm = LocalizationService.get('btn_confirm', lang)
        btn_cancel = LocalizationService.get('btn_cancel', lang)

        svc_bilingual = LocalizationService.get_bilingual_name(data.get('service_name', '—'), lang)
        dr_bilingual = LocalizationService.get_bilingual_name(f"Dr. {data.get('doctor_name', '—')}", lang)

        summary = (
            f" {confirm_title}\n\n"
            f"{confirm_prompt}\n"
            f" Patient: {patient_name}\n"
            f" Service: {svc_bilingual}\n"
            f"‍️ Doctor: {dr_bilingual}\n"
            f" Date: {data['date']}\n"
            f" Time: {self._format_time_display(time_str)} – {self._format_time_display(end_time)}"
        )
        self.notifier.send_whatsapp_buttons(sender_id, summary, [btn_confirm[:20], btn_cancel[:20]], ["confirm_yes", "confirm_no"])

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
            appt_data = {
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
            }
            if data.get('reschedule_old_appt_id'):
                appt_data['notes'] = f"Rescheduled from {data['reschedule_old_appt_id']}"

            new_appt = self.appt_service.book_appointment(appt_data)

            appt_id = new_appt.get('appointment_id', '—')
            
            if data.get('reschedule_old_appt_id'):
                try:
                    self.appt_service.cancel_appointment(
                        data['reschedule_old_appt_id'], 
                        patient_id, 
                        'patient', 
                        f"Cancelled by patient for rescheduling to {appt_id}"
                    )
                except Exception as e:
                    logger.warning(f"Failed to cancel old appointment during reschedule: {e}")

            lang = data.get('language', 'en')
            booking_success = LocalizationService.get('booking_success', lang)
            
            dr_bilingual = LocalizationService.get_bilingual_name(f"Dr. {data.get('doctor_name', '—')}", lang)
            
            confirm_msg = (
                f" {booking_success} {patient_name}\n\n"
                f"🆔 ID: {appt_id}\n"
                f"‍️ Doctor: {dr_bilingual}\n"
                f" Date: {data['date']}\n"
                f" Time: {self._format_time_display(data['time'])} – {self._format_time_display(data.get('end_time', ''))}\n\n"
                f" Status: Pending Doctor Approval"
            )
            self.notifier.send_whatsapp_text(sender_id, confirm_msg)
            # Notify doctor in real-time via socket so dashboard updates instantly
            _notify_doctor_new_appointment(new_appt.get('doctor_id', ''), new_appt)

        except Exception as e:
            logger.error(f"Booking failed: {e}")
            self.notifier.send_whatsapp_text(sender_id, f" Booking Failed: {str(e)}")

        self._transition_to(sender_id, STATE_MENU, clear_data=True)
        # Note: Deliberately skipped self._send_main_menu(sender_id) here so the 
        # menu doesn't immediately prompt again after booking confirmation.

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
            self.notifier.send_whatsapp_text(sender_id, " No upcoming appointments found.")
        else:
            msg = "* Your Upcoming Appointments:*\n\n"
            for a in appts:
                icon = {"pending_doctor_approval": "", "confirmed": "", "rejected": ""}.get(a['status'], "")
                doc_name = a.get('doctor_name', '?')
                msg += (
                    f"{icon} *{a['date']}* at {self._format_time_display(a['start_time'])}\n"
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

        msg = "* Our Services:*\n\n"
        for i, svc in enumerate(services, 1):
            msg += f"{i}. {svc['service_name']}\n"

        self.notifier.send_whatsapp_text(sender_id, msg)
        self._send_main_menu(sender_id)

    # ═══════════════════════════════════════════
    #  RESCHEDULE APPOINTMENT
    # ═══════════════════════════════════════════

    def _start_reschedule(self, sender_id):
        """Show the patient's active appointments so they can pick one to reschedule."""
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)

        if not patient:
            self.notifier.send_whatsapp_text(sender_id, "No patient record found.")
            self._send_main_menu(sender_id)
            return

        appts = self.appt_service.get_patient_appointments(patient['patient_id'])
        # Only show pending/confirmed (reschedule-able) appointments
        active = [a for a in appts if a.get('status') in ('pending_doctor_approval', 'confirmed')]

        if not active:
            self.notifier.send_whatsapp_text(sender_id, " No active appointments to reschedule.")
            self._send_main_menu(sender_id)
            return

        self._transition_to(sender_id, STATE_RESCHEDULE, clear_data=True)

        items = []
        for a in active[:10]:
            appt_id = a['appointment_id']
            display = f"Dr. {a.get('doctor_name', '?')}"[:24]
            desc = f"{a['date']} {self._format_time_display(a['start_time'])}"[:72]
            items.append((f"resched_{appt_id}", display, desc))

        self.notifier.send_whatsapp_list(
            sender_id,
            " *Reschedule Appointment*\n\nSelect the appointment you want to modify:",
            items,
            title="Your Appointments",
            button_text="Select"
        )

    def _handle_reschedule_selection(self, sender_id, input_text, data):
        """Handle user picking an appointment to reschedule."""
        if not input_text.startswith('resched_'):
            self.notifier.send_whatsapp_text(sender_id, "Please select an appointment from the list.")
            self._start_reschedule(sender_id)
            return

        appt_id = input_text.replace('resched_', '', 1)

        # Look up the appointment
        clean_phone = sender_id.replace('+', '').replace(' ', '')
        patient = self.patient_service.get_patient_by_phone(clean_phone)
        user_id = patient.get('user_id', '') if patient else ''

        self.notifier.send_whatsapp_text(
            sender_id,
            f" You selected to reschedule appointment *{appt_id}*.\n\n"
            "Let's book a new slot first. When confirmed, your old appointment will be cancelled."
        )

        # Redirect into booking flow
        patient_name = patient.get('patient_name', 'You') if patient else 'You'
        self._transition_to(sender_id, STATE_SELECT_SERVICE, {
            'booked_for': 'self',
            'patient_name': patient_name,
            'reschedule_old_appt_id': appt_id
        })
        self._send_service_list(sender_id)

    # ═══════════════════════════════════════════
    #  MAIN MENU
    # ═══════════════════════════════════════════

    def _send_main_menu(self, sender_id):
        # Step 1: Show top 2 actions as buttons + "More Options"
        self.notifier.send_whatsapp_buttons(
            sender_id,
            " How can I help you today?",
            [" Book Appointment", " Check Appts", "More Options"],
            ["book_appointment", "check_appointments", "menu_more"]
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
            self.notifier.send_whatsapp_text(sender_id, "️ Voice messages are not supported. Please use text.")
            return None

        if not media_id:
            self.notifier.send_whatsapp_text(sender_id, "️ Failed to process voice note. Please try text.")
            return None

        try:
            self.notifier.send_whatsapp_text(sender_id, " Processing your voice message...")
            audio_path = self._download_media(media_id)

            if not audio_path:
                self.notifier.send_whatsapp_text(sender_id, "️ Could not download audio. Please try text.")
                return None

            transcribed = self.stt.transcribe_audio_file(audio_path)

            # Clean up temp file
            try:
                os.remove(audio_path)
            except Exception:
                pass

            if not transcribed:
                self.notifier.send_whatsapp_text(sender_id, "️ Could not understand audio. Please try again or use text.")
                return None

            logger.info(f" Transcribed: '{transcribed}'")
            self.notifier.send_whatsapp_text(sender_id, f" I heard: \"{transcribed}\"")

            # Map to command
            text_lower = transcribed.lower().strip()
            for phrase, cmd in VOICE_COMMANDS.items():
                if phrase in text_lower:
                    return cmd

            # Fallback to AI Intent Extraction with enhanced for-whom detection
            logger.info(f" keyphrase miss. Asking AI for intent from: '{transcribed}'")
            
            # Fetch services context for AI
            services = self.appt_service.get_services()
            service_names = [s['service_name'] for s in services]
            
            # Fetch doctor context if applicable (for Hindi matching)
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
                logger.info(f" STATE_SELECT_DOCTOR: available doctors = {doctor_names}")

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

            logger.info(f" AI understood: intent={intent}, for_whom={for_whom}, service={resolved_service_id}, doctor={predicted_doc}")

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
                        logger.info(f" Voice matched doctor: {matched_doc['full_name']} (ID: {matched_doc['user_id']})")
                        self._handle_doctor_selection(sender_id, f"doc_{matched_doc['user_id']}", session_data)
                        return None
                    else:
                        logger.info(f"️ AI returned doctor='{predicted_doc}' but no fuzzy match found")
                
                # Fallback: if only ONE doctor is available, auto-select them
                if len(available_doctors) == 1:
                    only_doc = available_doctors[0]
                    logger.info(f" Only one doctor available, auto-selecting: {only_doc['full_name']}")
                    self._handle_doctor_selection(sender_id, f"doc_{only_doc['user_id']}", session_data)
                    return None
                
                # Last resort: return raw text for _handle_doctor_selection to try
                logger.info(f"️ Voice doctor selection: returning raw text '{transcribed}' for fuzzy match")
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
                        logger.info(f" Voice resolved date '{transcribed}'  {resolved}")
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
                            self.notifier.send_whatsapp_text(sender_id, f" Booking for: *{guest_name}*")
                            
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
            self.notifier.send_whatsapp_text(sender_id, "️ Voice processing failed. Please use text.")
            return None

    # ═══════════════════════════════════════════
    #  SARVAM VOICE FLOW: Language Selection
    # ═══════════════════════════════════════════

    def _start_voice_flow(self, sender_id):
        """Start the voice booking flow by asking for language selection."""
        self._transition_to(sender_id, STATE_LANG_SELECT, clear_data=True)

        # Step 1: Show English & Hindi as buttons + "Other Languages"
        self.notifier.send_whatsapp_buttons(
            sender_id,
            " *Select Your Preferred Language*\n\n"
            "Choose a language for voice booking:",
            ["English", "हिन्दी (Hindi)", "Other Languages"],
            ["lang_en", "lang_hi", "lang_more"]
        )

        # Also send a TTS audio of the language selection prompt (in English)
        if self.sarvam and self.sarvam.is_available():
            tts_text = self.sarvam.get_language_selection_tts()
            audio_path = self.sarvam.text_to_speech(tts_text, 'en')
            if audio_path:
                self._send_whatsapp_audio(sender_id, audio_path)

    def _handle_language_selection(self, sender_id, input_text):
        """Handle user's language selection input."""
        text = input_text.strip()

        # Step 2: User tapped "Other Languages"  send full language list
        if text == 'lang_more':
            lang_items = [
                ("lang_te", "తెలుగు (Telugu)", "Speak in Telugu"),
                ("lang_hi", "हिन्दी (Hindi)", "Speak in Hindi"),
                ("lang_kn", "ಕನ್ನಡ (Kannada)", "Speak in Kannada"),
                ("lang_ta", "தமிழ் (Tamil)", "Speak in Tamil"),
                ("lang_en", "English", "Speak in English"),
            ]
            self.notifier.send_whatsapp_list(
                sender_id,
                " *Select Your Preferred Language*\n\n"
                "Choose the language you'd like to use for voice booking:",
                lang_items,
                title="All Languages",
                button_text="Choose Language"
            )
            return

        # Check if it's a list/button selection (e.g. 'lang_te')
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
                "️ I didn't understand that. Please select a language from the list, or type a number 1-5."
            )
            self._start_voice_flow(sender_id)
            return

        lang_info = SARVAM_SUPPORTED_LANGUAGES[lang_code]
        lang_name = lang_info['name']
        lang_display = lang_info['display']

        session = self._get_session(sender_id)
        session_data = session.get('data', {})
        flow_type = session_data.get('flow_type', 'voice_booking')

        if flow_type == 'text_booking':
            self._transition_to(sender_id, STATE_BOOKING_FOR, {'language': lang_code}, clear_data=True)
            self.notifier.send_whatsapp_text(
                sender_id, f" Language set to *{lang_display} ({lang_name})*"
            )
            book_who = LocalizationService.get('book_who', lang_code)
            btn_myself = LocalizationService.get('btn_myself', lang_code)
            btn_someone_else = LocalizationService.get('btn_someone_else', lang_code)
            
            self.notifier.send_whatsapp_buttons(
                sender_id,
                book_who,
                [btn_myself[:20], btn_someone_else[:20]],
                ["book_self", "book_other"]
            )
        else:
            # Save language selection and transition to voice chat
            self._transition_to(sender_id, STATE_VOICE_CHAT, {
                'language': lang_code,
                'messages': []
            })
            
            # Send confirmation
            confirm_msg = (
                f" Language set to *{lang_display} ({lang_name})*\n\n"
                f" You can now send voice notes or type in {lang_name} to book appointments.\n\n"
                f"_Send a voice note or type your request to get started!_"
            )
            self.notifier.send_whatsapp_text(sender_id, confirm_msg)
            
            # Send TTS greeting in chosen language
            if self.sarvam and self.sarvam.is_available():
                greetings = {
                    'te': "నమస్కారం! హాస్పిటల్ అపాయింట్మెంట్ బుకింగ్ సర్వీస్‌కి స్వాగతం. మీకు ఎలా సహాయం చేయగలను?",
                    'hi': "नमस्ते! हॉस्पिटल अपॉइंटमेंट बुकिंग सर्विस में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूं?",
                    'ur': "السلام علیکم! ہسپتال اپائنٹمنٹ بکنگ سروس میں خوش آمدید۔ میں آپ کی کیسے مدد کر سکتا ہوں؟",
                    'kn': "ನಮಸ್ಕಾರ! ಆಸ್ಪತ್ರೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕಿಂಗ್ ಸೇವೆಗೆ ಸ್ವಾಗತ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
                    'ta': "வணக்கம்! மருத்துவமனை அப்பாயிண்ட்மென்ட் புக்கிங் சேவைக்கு வரவேற்கிறேன். நான் உங்களுக்கு எப்படி உதவி செய்யலாம்?",
                    'en': "Welcome to the hospital appointment booking service. How can I help you today?",
                }
                greeting = greetings.get(lang_code, greetings['en'])
                audio_path = self.sarvam.text_to_speech(greeting, lang_code)
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
            self.notifier.send_whatsapp_text(sender_id, "️ Failed to process voice note. Please try again.")
            return

        current_state = session.get('state', STATE_INIT)
        data = session.get('data', {})
        lang_code = data.get('language', 'en')

        try:
            _status_msgs = {
                'te': ' మీ వాయిస్ మెసేజ్ ప్రాసెస్ చేస్తున్నాము...',
                'hi': ' आपका वॉइस मैसेज प्रोसेस हो रहा है...',
                'ta': ' உங்கள் குரல் செய்தியை செயலாக்குகிறோம்...',
                'kn': ' ನಿಮ್ಮ ಧ್ವನಿ ಸಂದೇಶವನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ...',
                'ur': ' آپ کا وائس پیغام پروسیس ہو رہا ہے...'
            }
            self.notifier.send_whatsapp_text(sender_id, _status_msgs.get(lang_code, " Processing your voice message..."))

            # 1. Download audio from WhatsApp
            audio_path = self._download_media(media_id)
            if not audio_path:
                self.notifier.send_whatsapp_text(sender_id, "️ Could not download audio. Please try again.")
                return

            # 2. If no language selected yet, auto-detect from this voice note
            if current_state not in [STATE_VOICE_CHAT, STATE_LANG_SELECT] and current_state not in [STATE_REGISTER_NAME, STATE_REGISTER_EMAIL]:
                logger.info(f" AUTO-DETECT: First voice note from {sender_id}, auto-detecting language...")

                # PRIORITY: Use Sarvam STT for Indian language detection
                # Local Whisper "tiny" is unreliable for Indian languages and often outputs garbage
                stt_result = None
                temp_transcript = ""

                # Strategy: Try Sarvam with common Indian languages in order of likelihood
                # Hindi is most common, then try others
                if self.sarvam and self.sarvam.is_available():
                    LANG_PRIORITY = ['hi', 'kn', 'te', 'ta', 'ur', 'en']
                    best_result = None
                    best_lang = 'en'

                    for try_lang in LANG_PRIORITY:
                        try:
                            temp_stt = self.sarvam.speech_to_text(audio_path, try_lang)
                            if temp_stt and temp_stt.get('transcript'):
                                transcript_text = temp_stt['transcript'].strip()
                                logger.info(f" AUTO-DETECT trying {try_lang}: '{transcript_text[:60]}'")

                                # Check if this looks like valid content (not garbage)
                                if transcript_text and len(transcript_text) > 2:
                                    # For non-English, check if it contains native script
                                    if try_lang != 'en':
                                        has_native_script = any(ord(c) > 127 for c in transcript_text)
                                        if has_native_script:
                                            # Found native script - this is likely the correct language
                                            best_result = temp_stt
                                            best_lang = try_lang
                                            logger.info(f" AUTO-DETECT found native script for {try_lang}")
                                            break
                                        else:
                                            # Romanized text - check with language patterns
                                            detected = detect_language(transcript_text)
                                            if detected == try_lang:
                                                best_result = temp_stt
                                                best_lang = try_lang
                                                logger.info(f" AUTO-DETECT matched Romanized {try_lang}")
                                                break
                                            elif not best_result:
                                                # Keep as fallback
                                                best_result = temp_stt
                                                best_lang = try_lang
                                    else:
                                        # English - use as final fallback
                                        if not best_result:
                                            best_result = temp_stt
                                            best_lang = 'en'
                        except Exception as e:
                            logger.warning(f"Sarvam STT {try_lang} failed: {e}")
                            continue

                    if best_result:
                        stt_result = best_result
                        lang_code = best_lang
                        logger.info(f" AUTO-DETECT selected {lang_code}: '{stt_result['transcript'][:60]}'")

                # If Sarvam failed completely, try local Whisper as last resort
                if not stt_result and self.local_voice and self.local_voice.stt_available:
                    logger.warning("️ Sarvam STT failed for all languages, trying local Whisper...")
                    try:
                        whisper_result = self.local_voice.speech_to_text(audio_path, 'hi')
                        if whisper_result and whisper_result.get('transcript'):
                            stt_result = whisper_result
                            detected_lang = whisper_result.get('language_code', 'hi')
                            lang_code = detected_lang if detected_lang in SARVAM_SUPPORTED_LANGUAGES else 'hi'
                            logger.info(f" LOCAL Whisper fallback: {lang_code} - '{stt_result['transcript'][:60]}'")
                    except Exception as e:
                        logger.error(f"Local Whisper fallback failed: {e}")

                try:
                    os.remove(audio_path)
                except Exception:
                    pass

                if stt_result and stt_result.get('transcript'):
                    transcript = stt_result['transcript']

                    # VALIDATE: Check for unsupported language scripts (Chinese, Japanese, Korean, etc.)
                    is_valid, issue = is_transcript_valid(transcript)
                    if not is_valid:
                        logger.warning(f"️ INVALID TRANSCRIPT: {issue} - '{transcript[:60]}'")
                        # Send "language not detected" message in multiple supported languages
                        self.notifier.send_whatsapp_text(
                            sender_id,
                            "️ *Language not detected / भाषा पहचान नहीं हुई*\n\n"
                            "I only understand these languages:\n"
                            "• Telugu (తెలుగు)\n"
                            "• Hindi (हिंदी)\n"
                            "• English\n"
                            "• Tamil (தமிழ்)\n"
                            "• Kannada (ಕನ್ನಡ)\n\n"
                            "Please speak clearly in one of these languages.\n"
                            "कृपया इन भाषाओं में से किसी एक में स्पष्ट बोलें।"
                        )
                        try:
                            os.remove(audio_path)
                        except Exception:
                            pass
                        return

                    # Also validate that language code is in our trained set
                    if lang_code not in TRAINED_LANGUAGES:
                        logger.warning(f"️ Language {lang_code} not in trained set, defaulting to 'hi'")
                        lang_code = 'hi'

                    logger.info(f" AUTO-DETECT language result: {lang_code} ({get_language_name(lang_code)}) for '{transcript[:60]}'")

                    # Set language and transition directly to voice chat — skip language selection
                    self._transition_to(sender_id, STATE_VOICE_CHAT, {
                        'language': lang_code,
                        'messages': []
                    })
                    _activation_msgs = {
                        'te': f" వాయిస్ బుకింగ్ యాక్టివేట్ అయింది! భాష: *{get_language_name(lang_code)}*",
                        'hi': f" वॉइस बुकिंग एक्टिवेट! भाषा: *{get_language_name(lang_code)}*",
                        'ta': f" குரல் முன்பதிவு செயல்படுத்தப்பட்டது! மொழி: *{get_language_name(lang_code)}*",
                        'kn': f" ಧ್ವನಿ ಬುಕಿಂಗ್ ಸಕ್ರಿಯಗೊಂಡಿದೆ! ಭಾಷೆ: *{get_language_name(lang_code)}*",
                        'ur': f" وائس بکنگ ایکٹیویٹ! زبان: *{get_language_name(lang_code)}*"
                    }
                    self.notifier.send_whatsapp_text(
                        sender_id,
                        _activation_msgs.get(lang_code, f" Voice booking activated! Language: *{get_language_name(lang_code)}*")
                    )
                    _heard_prefix = {'te': ' నేను విన్నది', 'hi': ' मैंने सुना', 'ta': ' நான் கேட்டது', 'kn': ' ನಾನು ಕೇಳಿದ್ದು', 'ur': ' میں نے سنا'}
                    self.notifier.send_whatsapp_text(sender_id, f"{_heard_prefix.get(lang_code, ' I heard')}: \"{transcript}\"")

                    # Process this transcript immediately (don't waste the first message)
                    session = self._get_session(sender_id)
                    data = session.get('data', {})

                    # Try booking engine first (only if NOT already in voice chat)
                    try:
                        if current_state != STATE_VOICE_CHAT and self._booking_engine.try_handle(sender_id, transcript, session):
                            logger.info(f" SmartBookingEngine handled auto-detected voice from {sender_id}")
                            return
                    except Exception as e:
                        logger.error(f"SmartBookingEngine auto-detect error: {e}", exc_info=True)

                    # Fallback to AI conversation
                    self._process_sarvam_conversation(sender_id, transcript, data, lang_code)
                else:
                    # Could not transcribe with ANY method - default to Hindi and ask user to try again
                    logger.warning(f"️ AUTO-DETECT: All STT methods failed, defaulting to Hindi voice mode")
                    self._transition_to(sender_id, STATE_VOICE_CHAT, {
                        'language': 'hi',
                        'messages': []
                    })
                    self.notifier.send_whatsapp_text(
                        sender_id,
                        " *वॉइस बुकिंग एक्टिवेट!*\n\n"
                        "️ आपकी आवाज़ साफ़ नहीं सुनाई दी। कृपया धीरे और साफ़ बोलें।\n\n"
                        "_Voice booking activated! Could not understand clearly. Please speak slowly and clearly._"
                    )
                return

            # 3. Handle language selection state via voice - auto-detect instead of requiring language name
            if current_state == STATE_LANG_SELECT:
                logger.info(f" User in LANG_SELECT sent voice - auto-detecting language instead...")
                # Auto-detect language from voice content
                stt_result = None
                best_lang = 'hi'

                if self.sarvam and self.sarvam.is_available():
                    LANG_PRIORITY = ['hi', 'kn', 'te', 'ta', 'ur', 'en']
                    for try_lang in LANG_PRIORITY:
                        try:
                            temp_stt = self.sarvam.speech_to_text(audio_path, try_lang)
                            if temp_stt and temp_stt.get('transcript', '').strip():
                                transcript_text = temp_stt['transcript'].strip()
                                if len(transcript_text) > 2:
                                    # Check for native script
                                    has_native = any(ord(c) > 127 for c in transcript_text)
                                    if has_native or try_lang == 'en':
                                        stt_result = temp_stt
                                        best_lang = try_lang
                                        break
                                    elif not stt_result:
                                        stt_result = temp_stt
                                        best_lang = try_lang
                        except Exception as e:
                            logger.warning(f"Sarvam STT {try_lang} in lang_select failed: {e}")
                            continue

                # Fallback to local Whisper
                if not stt_result and self.local_voice:
                    try:
                        stt_result = self.local_voice.speech_to_text(audio_path, 'hi')
                        if stt_result:
                            best_lang = stt_result.get('language_code', 'hi')
                            if best_lang not in SARVAM_SUPPORTED_LANGUAGES:
                                best_lang = 'hi'
                    except Exception:
                        pass

                try:
                    os.remove(audio_path)
                except Exception:
                    pass

                if stt_result and stt_result.get('transcript', '').strip():
                    transcript = stt_result['transcript']
                    # Transition to voice chat with detected language
                    self._transition_to(sender_id, STATE_VOICE_CHAT, {
                        'language': best_lang,
                        'messages': []
                    })
                    _heard_prefix = {'te': ' నేను విన్నది', 'hi': ' मैंने सुना', 'ta': ' நான் கேட்டது', 'kn': ' ನಾನು ಕೇಳಿದ್ದು', 'ur': ' میں نے سنا'}
                    self.notifier.send_whatsapp_text(sender_id, f"{_heard_prefix.get(best_lang, ' I heard')}: \"{transcript}\"")

                    # Process the transcript
                    session = self._get_session(sender_id)
                    data = session.get('data', {})
                    try:
                        if self._booking_engine.try_handle(sender_id, transcript, session):
                            return
                    except Exception as e:
                        logger.error(f"SmartBookingEngine error in lang_select voice: {e}")
                    self._process_sarvam_conversation(sender_id, transcript, data, best_lang)
                else:
                    # Default to Hindi
                    self._transition_to(sender_id, STATE_VOICE_CHAT, {'language': 'hi', 'messages': []})
                    self.notifier.send_whatsapp_text(
                        sender_id,
                        " वॉइस बुकिंग एक्टिवेट!\n️ कृपया साफ़ बोलें। _Please speak clearly._"
                    )
                return

            # 4. Transcribe purely using the established lang_code (do not overwrite with 'en' translation)
            # PRIORITY: Use Sarvam STT - local Whisper is unreliable for Indian languages
            stt_result = None
            detected_lang = lang_code  # keep session language

            if self.sarvam and self.sarvam.is_available():
                try:
                    if lang_code == 'en':
                        # Language is "English" but user might speak Indian language
                        # Try Sarvam with common Indian languages first
                        LANG_PRIORITY = ['hi', 'kn', 'te', 'ta', 'ur', 'en']
                        best_result = None
                        best_lang = 'en'

                        for try_lang in LANG_PRIORITY:
                            try:
                                temp_stt = self.sarvam.speech_to_text(audio_path, try_lang)
                                if temp_stt and temp_stt.get('transcript'):
                                    transcript_text = temp_stt['transcript'].strip()
                                    if transcript_text and len(transcript_text) > 2:
                                        if try_lang != 'en':
                                            has_native_script = any(ord(c) > 127 for c in transcript_text)
                                            if has_native_script:
                                                best_result = temp_stt
                                                best_lang = try_lang
                                                logger.info(f" Re-detect found native script for {try_lang}")
                                                break
                                            else:
                                                detected = detect_language(transcript_text)
                                                if detected == try_lang:
                                                    best_result = temp_stt
                                                    best_lang = try_lang
                                                    break
                                                elif not best_result:
                                                    best_result = temp_stt
                                                    best_lang = try_lang
                                        else:
                                            if not best_result:
                                                best_result = temp_stt
                                                best_lang = 'en'
                            except Exception as e:
                                logger.warning(f"Sarvam STT {try_lang} re-detect failed: {e}")
                                continue

                        if best_result:
                            stt_result = best_result
                            detected_lang = best_lang
                            lang_code = best_lang
                            logger.info(f" Re-detect selected {lang_code}: '{stt_result['transcript'][:60]}'")
                    else:
                        # Transcribe directly in the known native language
                        stt_result = self.sarvam.speech_to_text(audio_path, lang_code)
                        if stt_result and stt_result.get('transcript'):
                            logger.info(f" Sarvam native STT [{lang_code}]: '{stt_result['transcript']}'")
                        else:
                            stt_result = None
                except Exception as e:
                    logger.warning(f"Sarvam STT failed: {e}")
                    stt_result = None

            # Only use local Whisper as last resort if Sarvam completely failed
            if not stt_result and self.local_voice:
                logger.warning("️ Sarvam STT failed, trying local Whisper as last resort")
                stt_result = self.local_voice.speech_to_text(audio_path, lang_code)
                if stt_result and stt_result.get('transcript'):
                    logger.info(f" Local STT last-resort fallback: '{stt_result['transcript'][:60]}'")

            # Update session language if it changed
            if detected_lang != lang_code:
                lang_code = detected_lang
                self.db.whatsapp_sessions.update_one(
                    {'sender_id': sender_id},
                    {'$set': {'data.language': detected_lang}}
                )
                logger.info(f" Updated session language to {detected_lang} ({get_language_name(detected_lang)}) for {sender_id}")

            # Clean up audio file
            try:
                os.remove(audio_path)
            except Exception:
                pass

            if not stt_result or not stt_result.get('transcript'):
                _cant_understand = {
                    'te': '️ మీ వాయిస్ మెసేజ్ అర్థం కాలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.',
                    'hi': '️ आपका वॉइस मैसेज समझ नहीं आया। कृपया फिर से कोशिश करें।',
                    'ta': '️ உங்கள் குரல் செய்தி புரியவில்லை. மீண்டும் முயற்சிக்கவும்.',
                    'kn': '️ ನಿಮ್ಮ ಧ್ವನಿ ಸಂದೇಶ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
                    'ur': '️ آپ کا وائس پیغام سمجھ نہیں آیا۔ دوبارہ کوشش کریں۔'
                }
                self.notifier.send_whatsapp_text(
                    sender_id,
                    _cant_understand.get(lang_code, "️ Could not understand your voice message. Please try again or type your request.")
                )
                return

            transcript = stt_result['transcript']
            logger.info(f" Sarvam STT [{lang_code}]: '{transcript}'")

            # 4b. VALIDATE: Reject transcripts with unsupported language scripts
            is_valid, issue = is_transcript_valid(transcript)
            if not is_valid:
                logger.warning(f"️ INVALID TRANSCRIPT in VOICE_CHAT: {issue} - '{transcript[:60]}'")
                _lang_not_detected = {
                    'te': '️ భాష గుర్తించబడలేదు. దయచేసి తెలుగు, హిందీ, ఇంగ్లీష్, తమిళం లేదా కన్నడలో మాట్లాడండి.',
                    'hi': '️ भाषा पहचान नहीं हुई। कृपया हिंदी, अंग्रेजी, तेलुगु, तमिल या कन्नड़ में बोलें।',
                    'ta': '️ மொழி கண்டறியப்படவில்லை. தயவுசெய்து தமிழ், இந்தி, ஆங்கிலம், தெலுங்கு அல்லது கன்னடம் பேசுங்கள்.',
                    'kn': '️ ಭಾಷೆ ಪತ್ತೆಯಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಕನ್ನಡ, ಹಿಂದಿ, ಇಂಗ್ಲಿಷ್, ತೆಲುಗು ಅಥವಾ ತಮಿಳುನಲ್ಲಿ ಮಾತನಾಡಿ.',
                }
                self.notifier.send_whatsapp_text(
                    sender_id,
                    _lang_not_detected.get(lang_code, "️ Language not detected. Please speak in Telugu, Hindi, English, Tamil, or Kannada.")
                )
                return

            # 4c. Quality check — reject garbage transcriptions
            # Skip this check during active voice conversations where the AI
            # may be expecting short answers (e.g., a patient name, yes/no)
            has_active_conversation = len(data.get('messages', [])) > 0
            if not has_active_conversation and self._is_garbage_transcript(transcript):
                logger.warning(f"️ Rejected garbage transcription: '{transcript}'")
                self.notifier.send_whatsapp_text(
                    sender_id,
                    "️ I couldn't understand that clearly. Please speak closer to the mic and try again."
                )
                return

            # Echo transcription in user's language
            _heard_prefix = {'te': ' నేను విన్నది', 'hi': ' मैंने सुना', 'ta': ' நான் கேட்டது', 'kn': ' ನಾನು ಕೇಳಿದ್ದು', 'ur': ' میں نے سنا'}
            self.notifier.send_whatsapp_text(sender_id, f"{_heard_prefix.get(lang_code, ' I heard')}: \"{transcript}\"")

            # 5. Check for global commands
            text_lower = transcript.lower().strip()
            voice_booking_active = data.get('booking_state', BK_IDLE) != BK_IDLE
            if text_lower in ['hi', 'hello', 'menu', 'reset', 'start']:
                if voice_booking_active and text_lower not in ['reset', 'menu']:
                    logger.info(f" Ignoring voice reset command '{text_lower}' during active booking for {sender_id}")
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
            # BUT ONLY if we are NOT already in Voice Chat mode!
            # If we are in Voice Chat, the AI must handle everything to prevent
            # the deterministic engine from getting stuck in a loop.
            try:
                if current_state != STATE_VOICE_CHAT and self._booking_engine.try_handle(sender_id, transcript, session):
                    logger.info(f" SmartBookingEngine handled voice transcript from {sender_id}")
                    return
            except Exception as e:
                logger.error(f"SmartBookingEngine voice error: {e}", exc_info=True)
                if voice_booking_active:
                    self.notifier.send_whatsapp_text(
                        sender_id,
                        "️ Something went wrong. Please try again or type *reset* to start over."
                    )
                    return

            # 7. Fallback to Sarvam AI conversation (LLM)
            self._process_sarvam_conversation(sender_id, transcript, data, lang_code)

        except Exception as e:
            logger.error(f" Sarvam voice processing error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            _fail_msgs = {
                'te': '️ వాయిస్ ప్రాసెసింగ్ విఫలమైంది. దయచేసి టెక్స్ట్ ద్వారా ప్రయత్నించండి.',
                'hi': '️ वॉइस प्रोसेसिंग विफल हुई। कृपया टेक्स्ट से प्रयास करें।',
                'ta': '️ குரல் செயலாக்கம் தோல்வி. உரை மூலம் முயற்சிக்கவும்.',
                'kn': '️ ಧ್ವನಿ ಪ್ರಕ್ರಿಯೆ ವಿಫಲ. ದಯವಿಟ್ಟು ಪಠ್ಯ ಮೂಲಕ ಪ್ರಯತ್ನಿಸಿ.',
                'ur': '️ وائس پروسیسنگ ناکام ہوئی۔ ٹیکسٹ سے کوشش کریں۔'
            }
            self.notifier.send_whatsapp_text(sender_id, _fail_msgs.get(lang_code, "️ Voice processing failed. Please try text instead."))

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

        # Convert numeric slot selection (e.g. "11") from the full slot text list.
        numeric_match = re.match(r'^\s*(?:slot\s*)?(\d{1,2})\s*$', text_lower)
        if numeric_match:
            selected_idx = numeric_match.group(1)
            slot_ctx = data.get('hybrid_slot_selection', {})
            slot_map = slot_ctx.get('slot_map', {}) if isinstance(slot_ctx, dict) else {}
            selected_time = slot_map.get(selected_idx)
            if selected_time:
                spoken = self.appt_service._time_to_spoken(selected_time)
                input_text = f"I choose slot {selected_idx} at {spoken}"
                logger.info(
                    f" Hybrid numeric slot selection: idx={selected_idx} -> {selected_time} for {sender_id}"
                )

        # Convert hybrid button IDs to natural language for the AI
        if input_text.startswith('vslot_'):
            time_str = input_text.replace('vslot_', '')
            spoken = self.appt_service._time_to_spoken(time_str)
            input_text = f"I want the {spoken} slot"

        if input_text.startswith('shift_'):
            parts = input_text.replace('shift_', '').split('_')
            if len(parts) == 2:
                if isinstance(data, dict):
                    data['_selected_shift_start'] = parts[0]
                    data['_selected_shift_end'] = parts[1]
                start_spoken = self.appt_service._time_to_spoken(parts[0])
                end_spoken = self.appt_service._time_to_spoken(parts[1])
                h = int(parts[0].split(':')[0])
                shift_name = (
                    "morning" if 7 <= h < 12
                    else ("afternoon" if 12 <= h < 17
                    else ("evening" if 17 <= h < 22 else "night"))
                )
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
        hybrid_data = {'shifts_sent': False, 'slots_sent': False, 'doctors_sent': False}

        # Tool execution callback with hybrid WhatsApp delivery
        def tool_executor(tool_name, tool_args):
            result = self._sarvam_tool_callback(sender_id, tool_name, tool_args, data, hybrid_data)
            return result

        # Inject temporary state context if available
        _temp_patient = data.get('_temp_patient_name', '')
        _temp_date = data.get('_temp_date', '')
        _temp_ctx = ''
        if _temp_patient:
            _temp_ctx += f" The patient's name is '{_temp_patient}'. Do NOT ask for the name again unless booking for someone else."
        if _temp_date:
            _temp_ctx += f" The user's preferred date is '{_temp_date}'. Use this date unless the user explicitly changes it."

        # System injection provides strict booking rules for the voice flow
        system_injection = {
            "role": "system",
            "content": (
                "IMPORTANT: You are speaking on a voice call. Do NOT use markdown (* or **). "
                "Speak times naturally (e.g. '9 AM' not '09:00'). Keep it conversational and brief. "
                "If the user spoke in a specific language, reply in that EXACT same language. "
                "If the user speaks in code-mixed style (Hinglish, Kanglish, Telglish), reply in the SAME code-mixed style. "
                "TIME RULES: Convert spoken times to 24-hour HH:MM BEFORE calling tools. "
                "'X and a half' = X:30. 'half past X' = X:30. "
                "'evening'/'sham'/'night' = PM. 'morning'/'subah' = AM. "
                "'6 in the evening' = '18:00'. '6 and a half in the evening' = '18:30'. "
                "NEVER approximate — use the EXACT time the user said. "
                "DATE RULE: NEVER assume, guess, or infer a date the user did not explicitly say. "
                "If the user says 'I need an appointment' or asks about doctors without mentioning a date, "
                "do NOT default to 'tomorrow' or any other date. ASK the user which date they prefer. "
                "Only pass a date to tools if the user explicitly stated one. "
                "STEP-BY-STEP: First identify the doctor, then ask for the date, then check availability to show real slots, "
                "then confirm all details before booking. NEVER skip steps. "
                "If the user gives all info except one field, ASK for that missing field. Never skip it. "
                "CRITICAL: NEVER output raw text like <function=name>{}</function>. Use proper tool calls only. "
                "NEVER SUGGEST TIMES: Do NOT say 'Can I book X PM for you?' or 'How about 10 AM?'. "
                "Only SHOW the available slots returned by check_availability and ask 'What time works for you?'. "
                "Let the user choose their own time from the available slots. Never recommend or push a specific slot. "
                "DUPLICATE DOCTORS: If multiple doctors share the same name but have different specializations, "
                "clearly tell the user: 'There are 2 doctors named Dr. X — one in [Specialty A] and one in [Specialty B]. "
                "Which specialization do you need?' Never silently pick one. "
                "MANDATORY CONFIRMATION: Before calling book_appointment, you MUST present ALL details in this EXACT structured format and ask the user to confirm:\n"
                " Patient Name: [name]\n"
                "‍️ Doctor: Dr. [name]\n"
                " Specialization: [specialization]\n"
                " Date: [date]\n"
                " Time Slot: [start_time] – [end_time]\n\n"
                "'Should I go ahead and book this?' "
                "Only call book_appointment AFTER the user says yes, confirm, haan, avunu, or haudu."
                "LANGUAGE CONSISTENCY: ALL your responses MUST be entirely in the user's selected language. "
                "Do NOT mix English into your conversational responses. "
                "Only keep doctor names, dates (YYYY-MM-DD), times (HH:MM), and appointment IDs in English. "
                "Everything else — greetings, questions, confirmations, shift descriptions, slot listings — MUST be in the user's language."
                "SAVING DETAILS: Whenever the user mentions their name or a preferred date, IMMEDIATELY call save_temporary_details to store it. "
                "If the user wants to change the date, call save_temporary_details again with the new date."
                + _temp_ctx
            )
        }
        
        # Keep system messages that have the date context (prevents AI from losing track)
        filtered_messages = [m for m in messages if m.get('role') != 'system' or "Today's date is" in m.get('content','')]
        filtered_messages.insert(0, system_injection)

        ai_response = self.sarvam.process_conversation(
            messages=filtered_messages,
            available_services=available_services,
            available_doctors=available_doctors,
            tool_callback=tool_executor,
            language_code=lang_code
        )

        suppress_ai_reply = bool(data.pop('_suppress_next_ai_text', False))
        if suppress_ai_reply:
            logger.info(" Missing-doctor fallback already sent directly; suppressing extra Sarvam text/TTS")
            messages.append({"role": "assistant", "content": "[Missing-doctor fallback sent via direct WhatsApp messages.]"})
        else:
            messages.append({"role": "assistant", "content": ai_response})

        # Save conversation memory
        data['messages'] = messages[-15:]
        self._transition_to(sender_id, STATE_VOICE_CHAT, data)

        # Send text response to WhatsApp
        if not suppress_ai_reply:
            self.notifier.send_whatsapp_text(sender_id, ai_response)

        # Generate and send TTS audio response
        if not suppress_ai_reply and self.sarvam and self.sarvam.is_available():
            audio_path = self.sarvam.text_to_speech(ai_response, lang_code)
            if audio_path:
                self._send_whatsapp_audio(sender_id, audio_path)

    def _sarvam_tool_callback(self, sender_id, tool_name, tool_args, session_data, hybrid_data):
        """
        Execute tools for Sarvam conversation and trigger hybrid WhatsApp delivery.
        When slots are found, sends a visual WhatsApp list alongside the voice response.
        """
        try:
            # Get session language for translating tool results
            _lang_code = session_data.get('language', 'en') if isinstance(session_data, dict) else 'en'

            def _translate(text):
                """Translate tool result into user's language."""
                if _lang_code == 'en' or not self.sarvam:
                    return text
                try:
                    return self.sarvam.translate_tool_result(text, _lang_code)
                except Exception:
                    return text


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
                    return _translate("No active doctors found.")

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
                        return _translate(f"No doctors are available on {date_str}. Try another date.")

                    # Send visual WhatsApp list
                    if not hybrid_data.get('doctors_sent'):
                        items = []
                        for doc in available_doctors[:10]:
                            items.append((
                                f"doc_pick_{doc['name'].replace(' ', '_')}",
                                f"‍️ {doc['name']}",
                                f"{doc['specialization']} | {', '.join(doc['shifts'])}"
                            ))
                        self.notifier.send_whatsapp_list(
                            sender_id,
                            f" Doctors available on {date_str}:",
                            items,
                            title="Available Doctors",
                            button_text="Choose Doctor"
                        )
                        hybrid_data['doctors_sent'] = True

                    result = f"On {date_str}, these doctors are available:\n"
                    for doc in available_doctors:
                        result += f"- Dr. {doc['name']} ({doc['specialization']}) — {', '.join(doc['shifts'])}\n"
                    return _translate(result)
                else:
                    # No date — just list all active doctors
                    items = []
                    for doc in doctors[:10]:
                        items.append((
                            f"doc_pick_{doc['full_name'].replace(' ', '_')}",
                            f"‍️ {doc['full_name']}",
                            doc.get('specialization', 'General')
                        ))
                    self.notifier.send_whatsapp_list(
                        sender_id,
                        " Our available doctors:",
                        items,
                        title="Doctors",
                        button_text="Choose Doctor"
                    )
                    result = "Our available doctors:\n"
                    for doc in doctors[:10]:
                        result += f"- Dr. {doc['full_name']} ({doc.get('specialization', 'General')})\n"
                    return _translate(result)

            elif tool_name == "check_availability":
                doctor_name = tool_args.get("doctor_name", "").strip()
                date_input = tool_args.get("date", "").strip()
                time_str = tool_args.get("time")

                if not doctor_name:
                    return _translate("I need a doctor name to check availability.")
                if not date_input:
                    return _translate("Please provide a date to check availability.")

                # Resolve and validate date (reject past/today)
                today = datetime.now().date()
                date_str, date_err = resolve_date(date_input, today)
                if date_err:
                    return _translate(date_err)
                if not date_str:
                    date_str = self._parse_natural_date(date_input)
                if not date_str:
                    is_valid, err = validate_booking_date(date_input, today)
                    if not is_valid:
                        return _translate(err or f"Invalid date '{date_input}'.")
                    date_str = date_input

                # Match Doctor — handle multiple matches
                specialization_hint = tool_args.get("specialization")
                doctors = self.appt_service.get_active_doctors()
                matched_doctors = self._match_doctors_with_specialization(
                    doctor_name,
                    doctors,
                    specialization_hint
                )

                if not matched_doctors:
                    missing_line, present_doctors = self._send_missing_doctor_two_step_messages(
                        sender_id,
                        doctors,
                        doctor_name
                    )
                    if isinstance(session_data, dict):
                        session_data['_suppress_next_ai_text'] = True
                    return _translate(f"{missing_line}\n{present_doctors}")

                if len(matched_doctors) > 1:
                    return self._build_doctor_disambiguation_message(doctor_name, matched_doctors)

                matched_doctor = matched_doctors[0]
                doctor_id = matched_doctor['user_id']
                doc_name = matched_doctor['full_name']
                doctor_specialization = matched_doctor.get('specialization', 'General')

                try:
                    datetime.strptime(date_str, "%Y-%m-%d")
                except ValueError:
                    return _translate(f"Invalid date format. Please use a valid date.")

                # Get spoken shift data
                spoken_shifts, shifts = self.appt_service.get_spoken_shifts(doctor_id, date_str)

                if not shifts:
                    weekly = get_doctor_weekly_schedule(doctor_id, self.appt_service)
                    return _translate(
                        f"Dr. {doc_name} ({doctor_specialization}) is NOT available on {date_str}. "
                        f"Their weekly schedule: {weekly}"
                    )

                # If user explicitly tapped a shift button, prioritize that shift and avoid
                # re-sending the same shift picker again.
                selected_shift = None
                selected_shift_start = None
                selected_shift_end = None
                if isinstance(session_data, dict):
                    selected_shift_start = session_data.pop('_selected_shift_start', None)
                    selected_shift_end = session_data.pop('_selected_shift_end', None)

                if selected_shift_start and selected_shift_end:
                    selected_shift = next(
                        (
                            s for s in shifts
                            if s.get('start') == selected_shift_start and s.get('end') == selected_shift_end
                        ),
                        None
                    )

                    if selected_shift:
                        selected_slots = self.appt_service.get_shift_slots(
                            doctor_id,
                            date_str,
                            selected_shift_start,
                            selected_shift_end
                        )
                        if selected_slots and not hybrid_data.get('slots_sent'):
                            self._send_hybrid_slots(
                                sender_id,
                                selected_slots,
                                selected_shift.get('shift_name', self.appt_service._classify_shift(selected_shift_start)),
                                doc_name,
                                date_str,
                                session_data=session_data,
                                lang_code=_lang_code
                            )
                            hybrid_data['slots_sent'] = True

                        # Mark shifts as already handled for this turn so we don't repeat
                        # the same shift picker after a user taps a shift.
                        hybrid_data['shifts_sent'] = True

                # ── HYBRID: Send WhatsApp visual list of shifts ──
                if not hybrid_data.get('shifts_sent'):
                    self._send_hybrid_shifts(sender_id, shifts, doc_name, date_str, _lang_code)
                    hybrid_data['shifts_sent'] = True

                # If a specific time is requested
                if time_str:
                    requested_time = resolve_time(time_str) or time_str
                    all_slots = []
                    for s in shifts:
                        slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                        for sl in slots:
                            slot_copy = dict(sl)
                            slot_copy['shift_name'] = s['shift_name']
                            slot_copy['shift_start'] = s['start']
                            slot_copy['shift_end'] = s['end']
                            all_slots.append(slot_copy)

                    matching_slot = next((sl for sl in all_slots if sl['start'] == requested_time), None)
                    if matching_slot:
                        return _translate(
                            f"Yes, {self._format_time_display(requested_time)} – {self._format_time_display(matching_slot['end'])} is available on {date_str} "
                            f"with Dr. {doc_name} ({doctor_specialization}). The appointment duration is {self._format_time_display(requested_time)} to {self._format_time_display(matching_slot['end'])}."
                        )

                    # Requested time is not available: send this notice first, then slot picker + full slot list.
                    preferred_shift = None
                    if ':' in requested_time:
                        try:
                            req_hour = int(requested_time.split(':')[0])
                            req_shift_name = self.appt_service._classify_shift(f"{req_hour:02d}:00")
                            preferred_shift = next(
                                (s for s in shifts if s.get('shift_name', '').lower() == req_shift_name.lower()),
                                None
                            )
                        except Exception:
                            preferred_shift = None

                    if not preferred_shift and shifts:
                        preferred_shift = shifts[0]

                    preferred_slots = []
                    if preferred_shift:
                        preferred_slots = self.appt_service.get_shift_slots(
                            doctor_id,
                            date_str,
                            preferred_shift['start'],
                            preferred_shift['end']
                        )

                    self.notifier.send_whatsapp_text(
                        sender_id,
                        (
                            f"️ Dr. {doc_name} ({doctor_specialization}) is not available at {self._format_time_display(requested_time)} on {date_str}. "
                            f"Please choose another slot from the available options below."
                        )
                    )

                    if preferred_slots and not hybrid_data.get('slots_sent'):
                        self._send_hybrid_slots(
                            sender_id,
                            preferred_slots,
                            preferred_shift['shift_name'],
                            doc_name,
                            date_str,
                            session_data=session_data,
                            lang_code=_lang_code
                        )
                        hybrid_data['slots_sent'] = True

                    available_starts = ', '.join(
                        self._format_time_display(sl['start']) for sl in all_slots
                    )
                    return _translate(
                        f"{self._format_time_display(requested_time)} is not available. "
                        f"Available slots are: {available_starts}. "
                        f"Please ask the user to select a slot or tell a time."
                    )

                # No specific time
                if selected_shift:
                    spoken_slots, _ = self.appt_service.get_spoken_slots(
                        doctor_id,
                        date_str,
                        selected_shift.get('start', selected_shift_start),
                        selected_shift.get('end', selected_shift_end),
                        selected_shift.get('shift_name', '')
                    )
                    return _translate(spoken_slots)

                # If only one shift exists, send full slots immediately (all in text + first 10 interactive rows).
                if len(shifts) == 1 and not hybrid_data.get('slots_sent'):
                    only_shift = shifts[0]
                    shift_slots = self.appt_service.get_shift_slots(
                        doctor_id,
                        date_str,
                        only_shift['start'],
                        only_shift['end']
                    )
                    if shift_slots:
                        self._send_hybrid_slots(
                            sender_id,
                            shift_slots,
                            only_shift['shift_name'],
                            doc_name,
                            date_str,
                            session_data=session_data,
                            lang_code=_lang_code
                        )
                        hybrid_data['slots_sent'] = True

                return _translate(spoken_shifts)

            elif tool_name == "book_appointment":
                patient_name_input = tool_args.get("patient_name", "").strip()
                doctor_name = tool_args.get("doctor_name", "").strip()
                date_input = tool_args.get("date", "").strip()
                time_input = tool_args.get("time", "").strip()

                if not all([doctor_name, date_input, time_input]):
                    return _translate("I need doctor name, date, and time to book.")

                # Resolve and validate date (reject past/today)
                today = datetime.now().date()
                date_str, date_err = resolve_date(date_input, today)
                if date_err:
                    return _translate(date_err)
                if not date_str:
                    date_str = self._parse_natural_date(date_input)
                if not date_str:
                    is_valid, err = validate_booking_date(date_input, today)
                    if not is_valid:
                        return _translate(err or f"Invalid date '{date_input}'.")
                    date_str = date_input

                # Match Doctor — handle multiple matches
                specialization_hint = tool_args.get("specialization")
                doctors = self.appt_service.get_active_doctors()
                matched_doctors = self._match_doctors_with_specialization(
                    doctor_name,
                    doctors,
                    specialization_hint
                )

                if not matched_doctors:
                    missing_line, present_doctors = self._send_missing_doctor_two_step_messages(
                        sender_id,
                        doctors,
                        doctor_name
                    )
                    if isinstance(session_data, dict):
                        session_data['_suppress_next_ai_text'] = True
                    return _translate(f"{missing_line}\n{present_doctors}")

                if len(matched_doctors) > 1:
                    return self._build_doctor_disambiguation_message(doctor_name, matched_doctors)

                matched_doctor = matched_doctors[0]
                doctor_id = matched_doctor['user_id']
                doctor_specialization = matched_doctor.get('specialization', 'General')

                # Smart time resolution using doctor's schedule
                resolved_time, time_err = resolve_ambiguous_time(
                    time_input, doctor_id, date_str, self.appt_service
                )
                if time_err and not resolved_time:
                    return _translate(time_err)
                time_str = resolved_time or resolve_time(time_input) or time_input

                # Look up actual slot to get real end_time from doctor's schedule
                end_time_str = None
                shifts = self.appt_service.get_available_shifts(doctor_id, date_str)
                for s in shifts:
                    slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                    if slots:
                        matching_slot = next((sl for sl in slots if sl['start'] == time_str), None)
                        if matching_slot:
                            end_time_str = matching_slot['end']
                            break

                if not end_time_str:
                    # Slot not found — collect all available slots and report them
                    all_available = []
                    for s in shifts:
                        slots = self.appt_service.get_shift_slots(doctor_id, date_str, s['start'], s['end'])
                        if slots:
                            all_available.extend([sl['start'] for sl in slots])
                    slots_str = (
                        ', '.join(self._format_time_display(slot_time) for slot_time in all_available[:10])
                        if all_available else 'No slots available'
                    )
                    return _translate(
                        f"The slot at {self._format_time_display(time_str)} is NOT available with Dr. {matched_doctor['full_name']} ({doctor_specialization}) on {date_str}. "
                        f"Available slots: {slots_str}. "
                        f"Please ask the user which slot they want."
                    )

                # Determine Patient
                clean_phone = sender_id.replace('+', '').replace(' ', '')
                patient_rec = self.patient_service.get_patient_by_phone(clean_phone)

                if not patient_rec:
                    return _translate("Error: Patient not registered. Please register first.")

                patient_id = patient_rec['patient_id']
                booked_for_name = patient_rec.get('patient_name', 'Unknown')

                if patient_name_input and patient_name_input.lower() not in ['self', '', 'me', booked_for_name.lower()]:
                    booked_for_name = patient_name_input

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
                    _confirm_labels = {
                        'te': {'title': ' *అపాయింట్‌మెంట్ బుక్ అయింది!*', 'patient': 'రోగి', 'doctor': 'డాక్టర్', 'spec': 'స్పెషలైజేషన్', 'date': 'తేదీ', 'time': 'సమయం', 'status': 'డాక్టర్ ఆమోదం పెండింగ్‌'},
                        'hi': {'title': ' *अपॉइंटमेंट बुक हो गई!*', 'patient': 'मरीज', 'doctor': 'डॉक्टर', 'spec': 'विशेषज्ञता', 'date': 'तारीख', 'time': 'समय', 'status': 'डॉक्टर अनुमोदन पेंडिंग'},
                        'ta': {'title': ' *நேரம் பதிவு செய்யப்பட்டது!*', 'patient': 'நோயாளி', 'doctor': 'மருத்துவர்', 'spec': 'சிறப்பு', 'date': 'தேதி', 'time': 'நேரம்', 'status': 'மருத்துவர் அனுமதி நிலுவையில்'},
                        'kn': {'title': ' *ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಆಗಿದೆ!*', 'patient': 'ರೋಗಿ', 'doctor': 'ಡಾಕ್ಟರ್', 'spec': 'ವಿಶೇಷತೆ', 'date': 'ದಿನಾಂಕ', 'time': 'ಸಮಯ', 'status': 'ಡಾಕ್ಟರ್ ಅನುಮೋದನೆ ಬಾಕಿ'},
                        'ur': {'title': ' *اپائنٹمنٹ بک ہو گئی!*', 'patient': 'مریض', 'doctor': 'ڈاکٹر', 'spec': 'ماہر', 'date': 'تاریخ', 'time': 'وقت', 'status': 'ڈاکٹر منظوری باقی'}
                    }
                    _cl = _confirm_labels.get(_lang_code, {
                        'title': ' *Appointment Booked!*',
                        'patient': 'Patient', 'doctor': 'Doctor', 'spec': 'Specialization',
                        'date': 'Date', 'time': 'Time', 'status': 'Pending Doctor Approval'
                    })
                    confirm_msg = (
                        f"{_cl['title']}\n\n"
                        f" {_cl['patient']}: {booked_for_name}\n"
                        f"‍️ {_cl['doctor']}: Dr. {matched_doctor['full_name']}\n"
                        f" {_cl['spec']}: {doctor_specialization}\n"
                        f" {_cl['date']}: {date_str}\n"
                        f" {_cl['time']}: {self._format_time_display(time_str)} – {self._format_time_display(end_time_str)}\n\n"
                        f" {_cl['status']}"
                    )
                    self.notifier.send_whatsapp_text(sender_id, confirm_msg)

                    return _translate(
                        f"SUCCESS. Appointment booked for patient {booked_for_name} with "
                        f"Dr. {matched_doctor['full_name']} ({doctor_specialization}) on {date_str} "
                        f"at {self._format_time_display(time_str)}-{self._format_time_display(end_time_str)}. Inform the user and ask if they need anything else."
                    )
                else:
                    return _translate("FAILED to book. There was a conflict or error. Ask user to try another time.")

            elif tool_name == "list_my_appointments":
                clean_phone = sender_id.replace('+', '').replace(' ', '')
                patient_rec = self.patient_service.get_patient_by_phone(clean_phone)
                if not patient_rec:
                    return _translate("User has no patient record. They have no appointments.")
                appts = self.appt_service.get_patient_appointments(patient_rec['patient_id'])
                active = [a for a in appts if a.get('status') in ('pending_doctor_approval', 'confirmed')]
                if not active:
                    return _translate("User has no active appointments.")
                
                result = "Active appointments:\n"
                for a in active:
                    doc_name = a.get('doctor_name', '?')
                    result += f"- ID: {a['appointment_id']}, Date: {a['date']} {self._format_time_display(a['start_time'])}, Doctor: Dr. {doc_name}\n"
                return result

            elif tool_name == "cancel_appointment":
                appt_id = tool_args.get("appointment_id", "")
                reason = tool_args.get("reason", "Cancelled by user via AI")
                if not appt_id or appt_id.lower() == 'auto':
                    return _translate("You must provide a specific appointment_id to cancel.")

                clean_phone = sender_id.replace('+', '').replace(' ', '')
                patient_rec = self.patient_service.get_patient_by_phone(clean_phone)
                patient_id = patient_rec['patient_id'] if patient_rec else ''

                try:
                    self.appt_service.cancel_appointment(appt_id, patient_id, 'patient', reason)
                    return _translate(f"SUCCESS. Appointment {appt_id} was cancelled successfully. Tell the user it is done.")
                except Exception as e:
                    return _translate(f"FAILED to cancel. Error: {str(e)}")

            elif tool_name == "save_temporary_details":
                patient_name = tool_args.get('patient_name', '').strip()
                date_val = tool_args.get('date', '').strip()
                if isinstance(session_data, dict):
                    if patient_name:
                        session_data['_temp_patient_name'] = patient_name
                        logger.info(f" Saved temp patient name: '{patient_name}' for {sender_id}")
                    if date_val:
                        resolved = self._parse_natural_date(date_val)
                        session_data['_temp_date'] = resolved or date_val
                        logger.info(f" Saved temp date: '{resolved or date_val}' for {sender_id}")
                saved_parts = []
                if patient_name:
                    saved_parts.append(f"patient name: {patient_name}")
                if date_val:
                    saved_parts.append(f"preferred date: {session_data.get('_temp_date', date_val)}")
                return _translate(f"Saved {', '.join(saved_parts)}. Continue the conversation." if saved_parts else "Nothing to save.")

            else:
                return _translate(f"Error: Tool '{tool_name}' is not recognized.")

        except Exception as e:
            logger.error(f"Sarvam tool execution failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return _translate(f"System error: {e}")

    # ═══════════════════════════════════════════
    #  HYBRID WHATSAPP DELIVERY
    # ═══════════════════════════════════════════

    def _send_hybrid_shifts(self, sender_id, shifts, doctor_name, date_str, lang_code='en'):
        """
        Send available shifts as a WhatsApp interactive list while the AI speaks them.
        This is the 'hybrid' feature — voice + visual simultaneously.
        """
        try:
            if not shifts:
                return

            _shift_labels = {
                'te': {'header': f" Dr. {doctor_name} — {date_str}\nఅందుబాటులో ఉన్న షిఫ్ట్‌లు (ఎంచుకోండి):", 'title': 'షిఫ్ట్‌లు', 'btn': 'చూడండి'},
                'hi': {'header': f" Dr. {doctor_name} — {date_str}\nउपलब्ध शिफ्ट (चुनें):", 'title': 'शिफ्ट', 'btn': 'देखें'},
                'ta': {'header': f" Dr. {doctor_name} — {date_str}\nகிடைக்கும் ஷிஃப்ட்ஸ் (தேர்வு செய்யவும்):", 'title': 'ஷிஃப்ட்ஸ்', 'btn': 'பார்க்க'},
                'kn': {'header': f" Dr. {doctor_name} — {date_str}\nಲಭ್ಯವಿರುವ ಶಿಫ್ಟ್‌ಗಳು (ಆಯ್ಕೆ ಮಾಡಿ):", 'title': 'ಶಿಫ್ಟ್‌ಗಳು', 'btn': 'ನೋಡಿ'},
                'ur': {'header': f" Dr. {doctor_name} — {date_str}\nدستیاب شفٹیں (منتخب کریں):", 'title': 'شفٹیں', 'btn': 'دیکھیں'}
            }
            _sl = _shift_labels.get(lang_code, {
                'header': f" Dr. {doctor_name} — {date_str}\nAvailable shifts (tap to select):",
                'title': 'Shifts', 'btn': 'View Shifts'
            })

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
                    _sl['header'],
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
                    f" Dr. {doctor_name} — {date_str}\n{_sl['title']}:",
                    items,
                    title=_sl['title'],
                    button_text=_sl['btn']
                )

            logger.info(f" Hybrid: Sent shift list to {sender_id} for {doctor_name} on {date_str}")

        except Exception as e:
            logger.error(f"Hybrid shift delivery error: {e}")

    def _send_hybrid_slots(self, sender_id, slots, shift_name, doctor_name, date_str, session_data=None, lang_code='en'):
        """
        Send available time slots in hybrid mode:
        1) full numbered text list (all slots),
        2) WhatsApp interactive list (first 10 due API limit).
        """
        try:
            if not slots:
                return

            _slot_labels = {
                'te': {'header': f"\u23f0 *\u0c05\u0c02\u0c26\u0c41\u0c2c\u0c3e\u0c1f\u0c41\u0c32\u0c4b \u0c09\u0c28\u0c4d\u0c28 \u0c38\u0c4d\u0c32\u0c3e\u0c1f\u0c4d\u0c32\u0c41 ({count})*", 'footer': '_\u0c28\u0c02\u0c2c\u0c30\u0c4d \u0c1a\u0c46\u0c2a\u0c4d\u0c2a\u0c02\u0c21\u0c3f \u0c32\u0c47\u0c26\u0c3e \u0c35\u0c3e\u0c2f\u0c3f\u0c38\u0c4d \u0c26\u0c4d\u0c35\u0c3e\u0c30\u0c3e \u0c38\u0c2e\u0c2f\u0c02 \u0c1a\u0c46\u0c2a\u0c4d\u0c2a\u0c02\u0c21\u0c3f._', 'tap': '_\u0c38\u0c4d\u0c32\u0c3e\u0c1f\u0c4d \u0c0e\u0c02\u0c1a\u0c41\u0c15\u0c4b\u0c02\u0c21\u0c3f._', 'title': '\u0c38\u0c4d\u0c32\u0c3e\u0c1f\u0c4d\u0c32\u0c41', 'btn': '\u0c38\u0c4d\u0c32\u0c3e\u0c1f\u0c4d\u0c32\u0c41 \u0c1a\u0c42\u0c21\u0c02\u0c21\u0c3f'},
                'hi': {'header': f"\u23f0 *\u0909\u092a\u0932\u092c\u094d\u0927 \u0938\u094d\u0932\u0949\u091f ({count})*", 'footer': '_\u0928\u0902\u092c\u0930 \u092c\u0924\u093e\u090f\u0902 \u092f\u093e \u0935\u0949\u0907\u0938 \u0938\u0947 \u0938\u092e\u092f \u092c\u0924\u093e\u090f\u0902\u0964_', 'tap': '_\u0938\u094d\u0932\u0949\u091f \u091a\u0941\u0928\u0947\u0902\u0964_', 'title': '\u0938\u094d\u0932\u0949\u091f', 'btn': '\u0938\u094d\u0932\u0949\u091f \u0926\u0947\u0916\u0947\u0902'},
                'ta': {'header': f"\u23f0 *\u0b95\u0bbf\u0b9f\u0bc8\u0b95\u0bcd\u0b95\u0bc1\u0bae\u0bcd \u0bb8\u0bcd\u0bb2\u0bbe\u0b9f\u0bcd\u0b95\u0bb3\u0bcd ({count})*", 'footer': '_\u0b8e\u0ba3\u0bcd \u0b85\u0bb2\u0bcd\u0bb2\u0ba4\u0bc1 \u0b95\u0bc1\u0bb0\u0bb2\u0bbf\u0bb2\u0bcd \u0ba8\u0bc7\u0bb0\u0bae\u0bcd \u0b9a\u0bca\u0bb2\u0bcd\u0bb2\u0bb5\u0bc1\u0bae\u0bcd._', 'tap': '_\u0bb8\u0bcd\u0bb2\u0bbe\u0b9f\u0bcd \u0ba4\u0bc7\u0bb0\u0bcd\u0bb5\u0bc1 \u0b9a\u0bc6\u0baf\u0bcd\u0baf\u0bb5\u0bc1\u0bae\u0bcd._', 'title': '\u0bb8\u0bcd\u0bb2\u0bbe\u0b9f\u0bcd\u0b95\u0bb3\u0bcd', 'btn': '\u0bb8\u0bcd\u0bb2\u0bbe\u0b9f\u0bcd\u0b95\u0bb3\u0bcd \u0baa\u0bbe\u0bb0\u0bcd\u0b95\u0bcd\u0b95'},
                'kn': {'header': f"\u23f0 *\u0cb2\u0cad\u0ccd\u0caf\u0cb5\u0cbf\u0cb0\u0cc1\u0cb5 \u0cb8\u0ccd\u0cb2\u0cbe\u0c9f\u0ccd\u200c\u0c97\u0cb3\u0cc1 ({count})*", 'footer': '_\u0cb8\u0c82\u0c96\u0ccd\u0caf\u0cc6 \u0cb9\u0cc7\u0cb3\u0cbf \u0c85\u0ca5\u0cb5\u0cbe \u0ca7\u0ccd\u0cb5\u0ca8\u0cbf\u0caf\u0cb2\u0ccd\u0cb2\u0cbf \u0cb8\u0cae\u0caf \u0cb9\u0cc7\u0cb3\u0cbf._', 'tap': '_\u0cb8\u0ccd\u0cb2\u0cbe\u0c9f\u0ccd \u0c86\u0caf\u0ccd\u0c95\u0cc6 \u0cae\u0cbe\u0ca1\u0cbf._', 'title': '\u0cb8\u0ccd\u0cb2\u0cbe\u0c9f\u0ccd\u200c\u0c97\u0cb3\u0cc1', 'btn': '\u0cb8\u0ccd\u0cb2\u0cbe\u0c9f\u0ccd\u200c\u0c97\u0cb3\u0cc1 \u0ca8\u0ccb\u0ca1\u0cbf'},
                'ur': {'header': f"\u23f0 *\u062f\u0633\u062a\u06cc\u0627\u0628 \u0633\u0644\u0627\u0679 ({count})*", 'footer': '_\u0646\u0645\u0628\u0631 \u0628\u062a\u0627\u0626\u06cc\u06ba \u06cc\u0627 \u0648\u0627\u0626\u0633 \u0633\u06d2 \u0648\u0642\u062a \u0628\u062a\u0627\u0626\u06cc\u06ba\u06d4_', 'tap': '_\u0633\u0644\u0627\u0679 \u0645\u0646\u062a\u062e\u0628 \u06a9\u0631\u06cc\u06ba\u06d4_', 'title': '\u0633\u0644\u0627\u0679', 'btn': '\u0633\u0644\u0627\u0679 \u062f\u06cc\u06a9\u06be\u06cc\u06ba'}
            }
            _default_slot_labels = {
                'header': f"\u23f0 *Available Slots ({'{count}'})*",
                'footer': '_Reply with a number (e.g. 11), tap View Slots, or tell me the time by voice._',
                'tap': '_Tap a slot to select, or tell me the time by voice._',
                'title': 'Available Slots', 'btn': 'View Slots'
            }
            _sll = _slot_labels.get(lang_code, _default_slot_labels)

            # Preserve schedule-generated order from get_shift_slots().
            # Do NOT lexicographically sort by HH:MM here, or overnight shifts
            # (e.g. 22:0007:00) will incorrectly appear AM-first.
            slots_ordered = list(slots)

            # Save slot index mapping so user can reply with a number like "11".
            if isinstance(session_data, dict):
                slot_map = {
                    str(idx): slot.get('start')
                    for idx, slot in enumerate(slots_ordered, 1)
                    if slot.get('start')
                }
                session_data['hybrid_slot_selection'] = {
                    'date': date_str,
                    'doctor_name': doctor_name,
                    'shift_name': shift_name,
                    'slot_map': slot_map
                }

            # 1) Send complete slot list in text (all slots, not limited to 10)
            lines = [
                _sll['header'].replace('{count}', str(len(slots_ordered))),
                f"Dr. {doctor_name} | {date_str} | {shift_name}",
                ""
            ]
            for idx, slot in enumerate(slots_ordered, 1):
                lines.append(
                    f"{idx}. {self._format_time_display(slot['start'])} – {self._format_time_display(slot['end'])}"
                )
            lines.append("")
            lines.append(_sll['footer'])
            self.notifier.send_whatsapp_text(sender_id, '\n'.join(lines))

            items = []
            for slot in slots_ordered[:10]:
                start_spoken = self.appt_service._time_to_spoken(slot['start'])
                end_spoken = self.appt_service._time_to_spoken(slot['end'])
                items.append((
                    f"vslot_{slot['start']}",
                    f" {start_spoken}",
                    f"{start_spoken} – {end_spoken}"
                ))

            header = (
                f" {shift_name} — Dr. {doctor_name}\n"
                f" {date_str}\n\n"
                f"{_sll['tap']}"
            )
            if len(slots_ordered) > 10:
                _more_label = {
                    'te': '\n(\u0c2e\u0c46\u0c28\u0c41\u0c32\u0c4b \u0c2e\u0c4a\u0c26\u0c1f\u0c3f 10 \u0c2e\u0c3e\u0c24\u0c4d\u0c30\u0c2e\u0c47. \u0c2a\u0c42\u0c30\u0c4d\u0c24\u0c3f \u0c1c\u0c3e\u0c2c\u0c3f\u0c24\u0c3e \u0c2a\u0c48\u0c28 \u0c09\u0c02\u0c26\u0c3f.)',
                    'hi': '\n(\u092e\u0947\u0928\u0942 \u092e\u0947\u0902 \u092a\u0939\u0932\u0947 10 \u0926\u093f\u0916\u093e\u090f \u0917\u090f \u0939\u0948\u0902\u0964 \u092a\u0942\u0930\u0940 \u0932\u093f\u0938\u094d\u091f \u090a\u092a\u0930 \u0939\u0948\u0964)',
                    'ta': '\n(\u0bae\u0bc6\u0ba9\u0bc1\u0bb5\u0bbf\u0bb2\u0bcd \u0bae\u0bc1\u0ba4\u0bb2\u0bcd 10 \u0b95\u0bbe\u0b9f\u0bcd\u0b9f\u0baa\u0bcd\u0baa\u0b9f\u0bcd\u0b9f\u0ba4\u0bc1. \u0bae\u0bc1\u0bb4\u0bc1 \u0baa\u0b9f\u0bcd\u0b9f\u0bbf\u0baf\u0bb2\u0bcd \u0bae\u0bc7\u0bb2\u0bc7 \u0b89\u0bb3\u0bcd\u0bb3\u0ba4\u0bc1.)',
                    'kn': '\n(\u0cae\u0cc6\u0ca8\u0cc1\u0cb5\u0cbf\u0ca8\u0cb2\u0ccd\u0cb2\u0cbf \u0cae\u0cca\u0ca6\u0cb2 10 \u0ca4\u0ccb\u0cb0\u0cbf\u0cb8\u0cb2\u0cbe\u0c97\u0cbf\u0ca6\u0cc6. \u0caa\u0cc2\u0cb0\u0ccd\u0ca3 \u0caa\u0c9f\u0ccd\u0c9f\u0cbf \u0cae\u0cc7\u0cb2\u0cbf\u0ca6\u0cc6.)',
                    'ur': '\n(\u0645\u06cc\u0646\u0648 \u0645\u06cc\u06ba \u067e\u06c1\u0644\u06d2 10 \u062f\u06a9\u06be\u0627\u0626\u06d2 \u06af\u0626\u06d2 \u06c1\u06cc\u06ba\u06d4 \u0645\u06a9\u0645\u0644 \u0641\u06c1\u0631\u0633\u062a \u0627\u0648\u067e\u0631 \u06c1\u06d2\u06d4)'
                }
                header += _more_label.get(lang_code, '\n(Showing first 10 in the menu. Full slot list is above.)')

            self.notifier.send_whatsapp_list(
                sender_id,
                header,
                items,
                title=_sll['title'],
                button_text=_sll['btn']
            )

            logger.info(f" Hybrid: Sent slot list to {sender_id} for {shift_name} shift")

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
                    'file': (os.path.basename(audio_file_path), audio_file, 'audio/ogg; codecs=opus')
                }
                data = {
                    'messaging_product': 'whatsapp',
                    'type': 'audio/ogg; codecs=opus'
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
                logger.info(f" Audio sent to {sender_id}")
                return True
            else:
                logger.error(f"Audio send failed: {send_response.status_code} {send_response.text}")
                return False

        except Exception as e:
            logger.error(f" WhatsApp audio send error: {e}")
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
        t_lower = clean.lower()

        # 1. Mostly non-alphanumeric (fractions, symbols, control chars)
        alpha_chars = sum(1 for c in clean if c.isalpha())
        if len(clean) > 5 and alpha_chars / len(clean) < 0.3:
            return True

        # 2. Excessive repetition (same word repeated 3+ times)
        words = clean.split()
        if len(words) >= 4:
            from collections import Counter
            word_counts = Counter(w.lower().strip('.,!?') for w in words)
            filler = {'the', 'of', 'a', 'an', 'is', 'to', 'and', 'in', 'on', 'it', 'i'}
            for most_common_word, most_common_count in word_counts.most_common(5):
                if most_common_word in filler:
                    continue
                if most_common_count >= 3 and most_common_count / len(words) > 0.25:
                    return True
                break

        # 3. Very short with no real words (less than 2 alphabetic words)
        # Allow known short valid inputs: greetings, commands, booking terms, multilingual
        short_valid = {
            # English commands and responses
            'hi', 'hello', 'menu', 'yes', 'no', 'ok', 'book', 'help',
            'call', 'voice', 'reset', 'start', 'back', 'exit',
            'cancel', 'confirm', 'done', 'thanks', 'thank you',
            'morning', 'evening', 'afternoon', 'night', 'today', 'tomorrow',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            # Hindi
            'haan', 'nahi', 'haa', 'ji', 'theek', 'sahi', 'kal', 'parson', 'aaj',
            'subah', 'sham', 'dopahar', 'raat',
            # Telugu
            'avunu', 'kaadu', 'repu', 'eeroju', 'udayam', 'sayantram',
            # Kannada
            'haudu', 'illa', 'naale', 'beligge', 'sanje',
        }
        if t_lower.strip() in short_valid:
            return False

        # Allow transcripts containing time patterns (e.g. "10 am", "at 3 pm", "9:30")
        if _re.search(r'\d{1,2}\s*(?:am|pm|a\.m|p\.m|baje|gantalaku|gantege)', t_lower):
            return False
        if _re.search(r'\d{1,2}:\d{2}', t_lower):
            return False

        # Allow transcripts containing date-like content
        if _re.search(r'\d{1,2}(?:st|nd|rd|th)', t_lower):
            return False

        # Allow if it contains known appointment/doctor keywords
        booking_keywords = {'doctor', 'dr', 'appointment', 'book', 'slot', 'available',
                            'specialist', 'cardio', 'ortho', 'dental', 'eye',
                            'डॉक्टर', 'अपॉइंटमेंट', 'డాక్టర్', 'అపాయింట్మెంట్',
                            'ಡಾಕ್ಟರ್', 'ಅಪಾಯಿಂಟ್ಮೆಂಟ್'}
        if any(kw in t_lower for kw in booking_keywords):
            return False

        real_words = [w for w in words if _re.match(r'^[a-zA-Z\u0900-\u097F\u0C00-\u0C7F\u0600-\u06FF]{2,}$', w)]
        if len(real_words) < 2 and len(clean) < 20:
            return True

        # 4. Contains fraction characters or other STT artifacts
        fraction_chars = sum(1 for c in clean if ord(c) in range(0x2150, 0x2190))
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
