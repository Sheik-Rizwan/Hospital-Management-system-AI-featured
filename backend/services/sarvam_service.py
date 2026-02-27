# sarvam_service.py — Sarvam AI Integration Service
# Handles STT, TTS, Chat Completions with tool calling, and language support

import os
import json
import requests
import base64
import tempfile
from datetime import datetime
from logger_config import logger

try:
    from config.settings import (
        SARVAM_API_KEY, SARVAM_BASE_URL, SARVAM_STT_URL, SARVAM_TTS_URL,
        SARVAM_TRANSLATE_URL, SARVAM_CHAT_URL, SARVAM_MODEL,
        SARVAM_SUPPORTED_LANGUAGES, SARVAM_DEFAULT_LANGUAGE
    )
except ImportError:
    SARVAM_API_KEY = os.getenv('SARVAM_API_KEY', '')
    SARVAM_BASE_URL = os.getenv('SARVAM_BASE_URL', '')
    SARVAM_STT_URL = f"{SARVAM_BASE_URL}/speech-to-text-translate"
    SARVAM_TTS_URL = f"{SARVAM_BASE_URL}/text-to-speech"
    SARVAM_TRANSLATE_URL = f"{SARVAM_BASE_URL}/translate"
    SARVAM_CHAT_URL = f"{SARVAM_BASE_URL}/v2/chat/completions"
    SARVAM_MODEL = os.getenv('SARVAM_MODEL', 'sarvam-m')
    SARVAM_SUPPORTED_LANGUAGES = {
        'te': {'name': 'Telugu', 'tts_code': 'te-IN', 'display': 'తెలుగు'},
        'hi': {'name': 'Hindi', 'tts_code': 'hi-IN', 'display': 'हिन्दी'},
        'ur': {'name': 'Urdu', 'tts_code': 'ur-IN', 'display': 'اردو'},
        'kn': {'name': 'Kannada', 'tts_code': 'kn-IN', 'display': 'ಕನ್ನಡ'},
        'en': {'name': 'English', 'tts_code': 'en-IN', 'display': 'English'},
    }
    SARVAM_DEFAULT_LANGUAGE = 'en'


class SarvamService:
    """
    Sarvam AI service for multilingual voice-based appointment booking.
    Supports STT, TTS, Chat with tool calling, and language selection.
    """

    def __init__(self):
        self.api_key = SARVAM_API_KEY
        self.base_url = SARVAM_BASE_URL
        self.model = SARVAM_MODEL
        self.supported_languages = SARVAM_SUPPORTED_LANGUAGES
        self.default_language = SARVAM_DEFAULT_LANGUAGE

        if not self.api_key:
            logger.warning("⚠️ SARVAM_API_KEY not set. Sarvam AI features will be unavailable.")

        # Tool definitions for appointment booking
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "check_availability",
                    "description": "Check doctor availability on a specific date. Returns available shifts and time slots. Always call this before booking.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "doctor_name": {
                                "type": "string",
                                "description": "The name of the doctor (e.g., 'Dr. Smith', 'Ali')"
                            },
                            "date": {
                                "type": "string",
                                "description": "The target date in YYYY-MM-DD format"
                            },
                            "time": {
                                "type": "string",
                                "description": "Optional specific time in HH:MM 24-hour format. If null, returns all available slots."
                            }
                        },
                        "required": ["doctor_name", "date"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "book_appointment",
                    "description": "Book an appointment for a patient with a doctor at a confirmed available date and time.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "patient_name": {
                                "type": "string",
                                "description": "The patient's name. Use 'self' if booking for themselves."
                            },
                            "doctor_name": {
                                "type": "string",
                                "description": "The name of the doctor"
                            },
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format"
                            },
                            "time": {
                                "type": "string",
                                "description": "The time in HH:MM 24-hour format"
                            }
                        },
                        "required": ["patient_name", "doctor_name", "date", "time"]
                    }
                }
            }
        ]

        # System prompt optimized for spoken conversation in multiple languages
        self.system_prompt = """You are a friendly, natural-sounding hospital receptionist having a phone conversation to help book appointments.

CRITICAL RULES FOR SPOKEN CONVERSATION:
1. Speak naturally as if on a phone call — short sentences, warm tone, conversational.
2. NEVER use markdown, bullet points, asterisks, or any formatting. This will be read aloud.
3. Only ask for ONE piece of information at a time.
4. When presenting available shifts, speak them naturally:
   - Say "Doctor Sharma is available on Monday. He has a morning shift from 9 AM to 1 PM, and an evening shift from 5 PM to 8 PM. Which shift would you prefer?"
   - NEVER say raw times like "09:00-13:00". Convert to spoken form: "9 AM to 1 PM"
5. When presenting specific time slots, group and speak them:
   - Say "In the morning shift, slots are available at 9, 9:30, 10, and 10:30. What time works for you?"
6. Always call check_availability BEFORE suggesting any times.
7. After confirming all details, call book_appointment to finalize.
8. If the user mentions a language preference, respond in that language naturally.
9. Keep responses concise — this is a phone call, not an email.
10. If the user says hi or greets, warmly greet back and ask how you can help with appointment booking.
11. If booking for someone else, ask for the patient's name.
12. Respond in the SAME LANGUAGE the user is speaking in. If they speak Telugu, respond in Telugu. If Hindi, respond in Hindi. Match their language."""

    # ═══════════════════════════════════════════
    #  HEADERS
    # ═══════════════════════════════════════════

    def _get_headers(self):
        """Get standard API headers."""
        return {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json"
        }

    def _get_multipart_headers(self):
        """Get headers for multipart/form-data requests (no Content-Type, requests sets it)."""
        return {
            "api-subscription-key": self.api_key
        }

    # ═══════════════════════════════════════════
    #  LANGUAGE
    # ═══════════════════════════════════════════

    def get_supported_languages(self):
        """Return dict of supported languages."""
        return self.supported_languages

    def get_language_selection_text(self, language_code='en'):
        """Generate the language selection prompt text."""
        texts = {
            'en': "Welcome! Please select your preferred language:\n1. Telugu (తెలుగు)\n2. Hindi (हिन्दी)\n3. Urdu (اردو)\n4. Kannada (ಕನ್ನಡ)\n5. English\n\nPlease say or type the language name or number.",
            'hi': "नमस्ते! कृपया अपनी पसंदीदा भाषा चुनें:\n1. తెలుగు (Telugu)\n2. हिन्दी (Hindi)\n3. اردو (Urdu)\n4. ಕನ್ನಡ (Kannada)\n5. English",
            'te': "స్వాగతం! దయచేసి మీ భాషను ఎంచుకోండి:\n1. తెలుగు (Telugu)\n2. हिन्दी (Hindi)\n3. اردو (Urdu)\n4. ಕನ್ನಡ (Kannada)\n5. English",
        }
        return texts.get(language_code, texts['en'])

    def get_language_selection_tts(self):
        """Generate a multilingual TTS prompt listing all languages."""
        # Speak the selection in English first, then mention each language in its native form
        return (
            "Welcome to our hospital booking service. "
            "Please select your preferred language. "
            "For Telugu, press 1 or say Telugu. "
            "For Hindi, press 2 or say Hindi. "
            "For Urdu, press 3 or say Urdu. "
            "For Kannada, press 4 or say Kannada. "
            "For English, press 5 or say English."
        )

    def resolve_language_from_input(self, user_input):
        """
        Resolve language code from user's text/voice input.
        Returns language code ('te', 'hi', etc.) or None.
        """
        text = user_input.lower().strip()

        # Number-based selection
        number_map = {'1': 'te', '2': 'hi', '3': 'ur', '4': 'kn', '5': 'en'}
        if text in number_map:
            return number_map[text]

        # Name-based selection (multiple aliases)
        language_aliases = {
            'te': ['telugu', 'తెలుగు', 'telgu', 'telugu language'],
            'hi': ['hindi', 'हिन्दी', 'हिंदी', 'hindi language'],
            'ur': ['urdu', 'اردو', 'urdu language'],
            'kn': ['kannada', 'ಕನ್ನಡ', 'kannad', 'kannada language'],
            'en': ['english', 'eng', 'inglis', 'inglish', 'english language'],
        }

        for lang_code, aliases in language_aliases.items():
            for alias in aliases:
                if alias in text:
                    return lang_code

        return None

    # ═══════════════════════════════════════════
    #  SPEECH-TO-TEXT (STT)
    # ═══════════════════════════════════════════

    def speech_to_text(self, audio_file_path, language_code='en'):
        """
        Transcribe audio using Sarvam STT API.
        Supports multilingual transcription.
        Returns: dict with 'transcript' and 'language_code'
        """
        if not self.api_key:
            logger.error("Sarvam API key not configured")
            return None

        try:
            with open(audio_file_path, 'rb') as audio_file:
                files = {
                    'file': (os.path.basename(audio_file_path), audio_file, 'audio/ogg')
                }
                data = {
                    'model': 'saaras:v2',
                    'language_code': f"{language_code}-IN" if '-' not in language_code else language_code,
                    'with_timestamps': 'false'
                }

                logger.info(f"🎤 Sarvam STT: Sending audio {audio_file_path}, lang={language_code}")

                response = requests.post(
                    SARVAM_STT_URL,
                    headers=self._get_multipart_headers(),
                    files=files,
                    data=data,
                    timeout=30
                )

                if response.status_code == 200:
                    result = response.json()
                    transcript = result.get('transcript', '')
                    logger.info(f"✅ Sarvam STT result: '{transcript}'")
                    return {
                        'transcript': transcript,
                        'language_code': result.get('language_code', language_code)
                    }
                else:
                    logger.error(f"❌ Sarvam STT error {response.status_code}: {response.text}")
                    return None

        except Exception as e:
            logger.error(f"❌ Sarvam STT exception: {e}")
            return None

    # ═══════════════════════════════════════════
    #  TEXT-TO-SPEECH (TTS)
    # ═══════════════════════════════════════════

    def text_to_speech(self, text, language_code='en', speaker='meera'):
        """
        Convert text to speech using Sarvam TTS API.
        Returns: path to generated audio file, or None on failure.
        
        Speakers: meera (female), arvind (male), etc.
        """
        if not self.api_key:
            logger.error("Sarvam API key not configured")
            return None

        try:
            lang_info = self.supported_languages.get(language_code, {})
            target_lang = lang_info.get('tts_code', 'en-IN')

            payload = {
                "inputs": [text],
                "target_language_code": target_lang,
                "speaker": speaker,
                "model": "bulbul:v1",
                "pitch": 0,
                "pace": 1.0,
                "loudness": 1.5,
                "enable_preprocessing": True
            }

            logger.info(f"🔊 Sarvam TTS: '{text[:60]}...' lang={target_lang}")

            response = requests.post(
                SARVAM_TTS_URL,
                headers=self._get_headers(),
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                audios = result.get('audios', [])

                if audios and audios[0]:
                    # Decode base64 audio
                    audio_bytes = base64.b64decode(audios[0])

                    # Save to temp file
                    temp_dir = os.path.join(os.getcwd(), 'uploads', 'tts')
                    os.makedirs(temp_dir, exist_ok=True)
                    audio_path = os.path.join(
                        temp_dir,
                        f"tts_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{language_code}.wav"
                    )

                    with open(audio_path, 'wb') as f:
                        f.write(audio_bytes)

                    logger.info(f"✅ Sarvam TTS saved: {audio_path}")
                    return audio_path
                else:
                    logger.error("❌ Sarvam TTS: No audio in response")
                    return None
            else:
                logger.error(f"❌ Sarvam TTS error {response.status_code}: {response.text}")
                return None

        except Exception as e:
            logger.error(f"❌ Sarvam TTS exception: {e}")
            return None

    # ═══════════════════════════════════════════
    #  TRANSLATE
    # ═══════════════════════════════════════════

    def translate_text(self, text, source_lang='en', target_lang='hi'):
        """
        Translate text between languages using Sarvam Translate API.
        """
        if not self.api_key:
            return text

        try:
            src_code = f"{source_lang}-IN" if '-' not in source_lang else source_lang
            tgt_code = f"{target_lang}-IN" if '-' not in target_lang else target_lang

            payload = {
                "input": text,
                "source_language_code": src_code,
                "target_language_code": tgt_code,
                "model": "mayura:v1",
                "enable_preprocessing": True
            }

            response = requests.post(
                SARVAM_TRANSLATE_URL,
                headers=self._get_headers(),
                json=payload,
                timeout=15
            )

            if response.status_code == 200:
                result = response.json()
                translated = result.get('translated_text', text)
                logger.info(f"🌐 Translated [{source_lang}→{target_lang}]: '{text[:40]}' → '{translated[:40]}'")
                return translated
            else:
                logger.error(f"❌ Sarvam Translate error {response.status_code}: {response.text}")
                return text

        except Exception as e:
            logger.error(f"❌ Sarvam Translate exception: {e}")
            return text

    # ═══════════════════════════════════════════
    #  CHAT COMPLETION WITH TOOL CALLING
    # ═══════════════════════════════════════════

    def process_conversation(self, messages, available_services=None, available_doctors=None,
                              tool_callback=None, language_code='en'):
        """
        Process conversation using Sarvam sarvam-m model with tool calling support.
        
        Args:
            messages: List of message dicts [{"role": "user/assistant/system", "content": "..."}]
            available_services: List of service names for context
            available_doctors: List of doctor names for context
            tool_callback: Function(tool_name, tool_args) -> str that executes tools
            language_code: Current language for the conversation
            
        Returns:
            str: The AI's text response
        """
        if not self.api_key:
            return "I'm sorry, the voice service is currently unavailable. Please try again later."

        try:
            # Build system prompt with context
            lang_info = self.supported_languages.get(language_code, {})
            lang_name = lang_info.get('name', 'English')

            system_content = self.system_prompt + f"\n\nIMPORTANT: The user is speaking in {lang_name}. Respond in {lang_name}."
            system_content += f"\nToday's date is {datetime.now().strftime('%Y-%m-%d, %A')}."

            if available_services:
                system_content += f"\nAvailable Services: {', '.join(available_services)}"
            if available_doctors:
                system_content += f"\nAvailable Doctors: {', '.join(available_doctors)}"

            # Build messages array
            chat_messages = [{"role": "system", "content": system_content}]

            # Add conversation history (skip any existing system messages in the input)
            for msg in messages:
                if msg.get('role') != 'system':
                    chat_messages.append(msg)
                elif msg.get('role') == 'system' and msg.get('content', '').startswith("Today's date"):
                    # Keep date context from session
                    chat_messages.append(msg)

            # First API call
            payload = {
                "model": self.model,
                "messages": chat_messages,
                "tools": self.tools,
                "tool_choice": "auto",
                "temperature": 0.3,
                "max_tokens": 512
            }

            headers = {
                "api-subscription-key": self.api_key,
                "Content-Type": "application/json"
            }

            logger.info(f"🤖 Sarvam Chat: Sending {len(chat_messages)} messages, model={self.model}")

            response = requests.post(
                SARVAM_CHAT_URL,
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code != 200:
                logger.error(f"❌ Sarvam Chat error {response.status_code}: {response.text}")
                return "I'm having trouble connecting right now. Can we try again in a moment?"

            result = response.json()
            response_message = result.get('choices', [{}])[0].get('message', {})

            # Check for tool calls
            tool_calls = response_message.get('tool_calls', [])

            if tool_calls and tool_callback:
                # Add assistant message with tool_calls to context
                chat_messages.append(response_message)

                for tool_call in tool_calls:
                    function_info = tool_call.get('function', {})
                    function_name = function_info.get('name', '')
                    function_args_str = function_info.get('arguments', '{}')

                    try:
                        function_args = json.loads(function_args_str)
                    except json.JSONDecodeError:
                        function_args = {}

                    logger.info(f"🔧 Sarvam tool call: {function_name}({function_args})")

                    # Execute tool
                    tool_result = tool_callback(function_name, function_args)

                    # Add tool result to messages
                    chat_messages.append({
                        "tool_call_id": tool_call.get('id', ''),
                        "role": "tool",
                        "name": function_name,
                        "content": str(tool_result)
                    })

                # Second API call with tool results
                payload2 = {
                    "model": self.model,
                    "messages": chat_messages,
                    "temperature": 0.3,
                    "max_tokens": 512
                }

                response2 = requests.post(
                    SARVAM_CHAT_URL,
                    headers=headers,
                    json=payload2,
                    timeout=30
                )

                if response2.status_code == 200:
                    result2 = response2.json()
                    final_content = result2.get('choices', [{}])[0].get('message', {}).get('content', '')
                    return final_content.strip() if final_content else "I processed your request but couldn't formulate a response."
                else:
                    logger.error(f"❌ Sarvam Chat (tool follow-up) error: {response2.status_code}: {response2.text}")
                    return "I had trouble processing the results. Let me try again."

            # No tool calls — return direct response
            content = response_message.get('content', '')
            return content.strip() if content else "I'm here to help with appointment booking. How can I assist you?"

        except Exception as e:
            logger.error(f"❌ Sarvam conversation error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return "I'm having a little trouble connecting right now. Can we try again in a moment?"

    # ═══════════════════════════════════════════
    #  SPOKEN SHIFT FORMATTING
    # ═══════════════════════════════════════════

    @staticmethod
    def format_shifts_for_speech(shifts, doctor_name, date_str, language_code='en'):
        """
        Format shift data into natural spoken language.
        
        Args:
            shifts: List of dicts [{'shift_name': 'Morning', 'start': '09:00', 'end': '13:00', 'free_slots': 5}]
            doctor_name: str
            date_str: str (YYYY-MM-DD)
            language_code: str
            
        Returns:
            str: Natural language description of availability
        """
        if not shifts:
            return f"Doctor {doctor_name} has no available shifts on {date_str}."

        try:
            from datetime import datetime as dt
            date_obj = dt.strptime(date_str, '%Y-%m-%d')
            day_name = date_obj.strftime('%A')
        except ValueError:
            day_name = date_str

        def time_spoken(t):
            """Convert '09:00' to '9 AM', '13:00' to '1 PM'."""
            try:
                h, m = map(int, t.split(':'))
                period = 'AM' if h < 12 else 'PM'
                spoken_h = h if h <= 12 else h - 12
                if spoken_h == 0:
                    spoken_h = 12
                if m > 0:
                    return f"{spoken_h}:{m:02d} {period}"
                return f"{spoken_h} {period}"
            except Exception:
                return t

        shift_parts = []
        for s in shifts:
            name = s.get('shift_name', 'a')
            start = time_spoken(s.get('start', ''))
            end = time_spoken(s.get('end', ''))
            slots = s.get('free_slots', 0)
            shift_parts.append(
                f"{name.lower()} shift from {start} to {end} with {slots} available slots"
            )

        if len(shift_parts) == 1:
            shifts_str = shift_parts[0]
        elif len(shift_parts) == 2:
            shifts_str = f"{shift_parts[0]}, and {shift_parts[1]}"
        else:
            shifts_str = ', '.join(shift_parts[:-1]) + f", and {shift_parts[-1]}"

        return f"Doctor {doctor_name} is available on {day_name}. There is a {shifts_str}. Which shift would you prefer?"

    @staticmethod
    def format_slots_for_speech(slots, shift_name='', language_code='en'):
        """
        Format time slots into natural spoken language.
        
        Args:
            slots: List of dicts [{'start': '09:00', 'end': '09:30'}, ...]
            shift_name: str
            language_code: str
            
        Returns:
            str: Natural language description of available slots
        """
        if not slots:
            return "There are no available slots in this shift."

        def time_spoken(t):
            try:
                h, m = map(int, t.split(':'))
                period = 'AM' if h < 12 else 'PM'
                spoken_h = h if h <= 12 else h - 12
                if spoken_h == 0:
                    spoken_h = 12
                if m > 0:
                    return f"{spoken_h}:{m:02d}"
                return f"{spoken_h}"
            except Exception:
                return t

        slot_times = [time_spoken(s['start']) for s in slots[:8]]  # Limit to 8 for speech

        if len(slot_times) == 1:
            times_str = slot_times[0]
        elif len(slot_times) == 2:
            times_str = f"{slot_times[0]} and {slot_times[1]}"
        else:
            times_str = ', '.join(slot_times[:-1]) + f", and {slot_times[-1]}"

        # Determine AM/PM suffix for the group
        first_slot = slots[0]['start']
        h = int(first_slot.split(':')[0])
        period = 'AM' if h < 12 else 'PM'

        prefix = f"In the {shift_name.lower()} shift, " if shift_name else ""
        return f"{prefix}available slots are at {times_str} {period}. What time works for you?"

    # ═══════════════════════════════════════════
    #  UTILITY
    # ═══════════════════════════════════════════

    def is_available(self):
        """Check if Sarvam service is configured and ready."""
        return bool(self.api_key)
