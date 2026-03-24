# sarvam_service.py — Sarvam AI Integration Service
# Handles STT, TTS, Chat Completions with tool calling, and language support

import os
import json
import re
import requests
import base64
import tempfile
import subprocess
import shutil
from datetime import datetime
from logger_config import logger

# Import extracted modules
from services.sarvam_tools import BOOKING_TOOLS, normalize_tool_argument_keys
from services.sarvam_prompts import (
    BOOKING_SYSTEM_PROMPT,
    LANGUAGE_SELECTION_TEXTS,
    LANGUAGE_SELECTION_TTS,
    EMPTY_RESPONSE_RETRY_PROMPT,
    FINAL_SYNTHESIS_PROMPT,
    EMPTY_FINAL_SYNTHESIS_PROMPT,
)

try:
    from config.settings import (
        SARVAM_API_KEY, SARVAM_BASE_URL, SARVAM_STT_URL, SARVAM_TTS_URL,
        SARVAM_TRANSLATE_URL, SARVAM_CHAT_URL, SARVAM_MODEL,
        SARVAM_SUPPORTED_LANGUAGES, SARVAM_DEFAULT_LANGUAGE
    )
except ImportError:
    SARVAM_API_KEY = os.getenv('SARVAM_API_KEY', '')
    SARVAM_BASE_URL = os.getenv('SARVAM_BASE_URL', '')
    SARVAM_STT_URL = f"{SARVAM_BASE_URL}/speech-to-text"
    SARVAM_TTS_URL = f"{SARVAM_BASE_URL}/text-to-speech"
    SARVAM_TRANSLATE_URL = f"{SARVAM_BASE_URL}/translate"
    SARVAM_CHAT_URL = f"{SARVAM_BASE_URL}/v1/chat/completions"
    SARVAM_MODEL = os.getenv('SARVAM_MODEL', 'sarvam-30b')
    SARVAM_SUPPORTED_LANGUAGES = {
        'te': {'name': 'Telugu', 'tts_code': 'te-IN', 'display': 'తెలుగు'},
        'hi': {'name': 'Hindi', 'tts_code': 'hi-IN', 'display': 'हिन्दी'},
        'ur': {'name': 'Urdu', 'tts_code': 'ur-IN', 'display': 'اردو'},
        'kn': {'name': 'Kannada', 'tts_code': 'kn-IN', 'display': 'ಕನ್ನಡ'},
        'ta': {'name': 'Tamil', 'tts_code': 'ta-IN', 'display': 'தமிழ்'},
        'en': {'name': 'English', 'tts_code': 'en-IN', 'display': 'English'},
    }
    SARVAM_DEFAULT_LANGUAGE = 'en'


class SarvamService:
    """
    Sarvam AI service for multilingual voice-based appointment booking.
    Supports STT, TTS, Chat with tool calling, and language selection.
    """

    # TTS configuration
    LANGUAGE_SPEAKERS = {
        'hi': 'manisha',
        'en': 'anushka',
        'kn': 'vidya',
        'te': 'manisha',
        'ta': 'anushka',
        'ur': 'anushka',
    }

    TTS_MODEL = os.getenv('SARVAM_TTS_MODEL', 'bulbul:v2')
    MODEL_ALLOWED_SPEAKERS = {
        'bulbul:v2': {'anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', 'hitesh'}
    }
    LEGACY_SPEAKER_COMPAT_MAP = {
        'simran': 'anushka',
        'ritu': 'manisha',
        'ishita': 'vidya',
    }
    DEFAULT_MODEL_SPEAKER = {
        'bulbul:v2': 'anushka'
    }

    def __init__(self):
        self.api_key = SARVAM_API_KEY
        self.base_url = SARVAM_BASE_URL
        self.model = SARVAM_MODEL
        self.supported_languages = SARVAM_SUPPORTED_LANGUAGES
        self.default_language = SARVAM_DEFAULT_LANGUAGE
        self.tools = BOOKING_TOOLS
        self.system_prompt = BOOKING_SYSTEM_PROMPT

        if not self.api_key:
            logger.warning("SARVAM_API_KEY not set. Sarvam AI features will be unavailable.")

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
        """Get headers for multipart/form-data requests."""
        return {"api-subscription-key": self.api_key}

    # ═══════════════════════════════════════════
    #  LANGUAGE
    # ═══════════════════════════════════════════

    def get_supported_languages(self):
        """Return dict of supported languages."""
        return self.supported_languages

    def get_language_selection_text(self, language_code='en'):
        """Generate the language selection prompt text."""
        return LANGUAGE_SELECTION_TEXTS.get(language_code, LANGUAGE_SELECTION_TEXTS['en'])

    def get_language_selection_tts(self):
        """Generate a multilingual TTS prompt listing all languages."""
        return LANGUAGE_SELECTION_TTS

    def resolve_language_from_input(self, user_input):
        """
        Resolve language code from user's text/voice input.
        Returns language code ('te', 'hi', etc.) or None.
        """
        text = user_input.lower().strip()

        number_map = {'1': 'te', '2': 'hi', '3': 'ur', '4': 'kn', '5': 'ta', '6': 'en'}
        if text in number_map:
            return number_map[text]

        language_aliases = {
            'te': ['telugu', 'తెలుగు', 'telgu', 'telugu language'],
            'hi': ['hindi', 'हिन्दी', 'हिंदी', 'hindi language'],
            'ur': ['urdu', 'اردو', 'urdu language'],
            'kn': ['kannada', 'ಕನ್ನಡ', 'kannad', 'kannada language'],
            'ta': ['tamil', 'தமிழ்', 'thamizh', 'tamil language'],
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

    def _convert_audio_to_wav(self, input_path):
        """
        Convert audio file to WAV format for better STT accuracy.
        Tries multiple methods: ffmpeg, pydub, soundfile.
        Returns: (output_path, was_converted)
        """
        # Skip if already WAV
        if input_path.lower().endswith('.wav'):
            return input_path, False

        output_path = input_path.rsplit('.', 1)[0] + '_converted.wav'

        # Method 1: Try ffmpeg (most reliable)
        ffmpeg_path = shutil.which('ffmpeg')

        # Check Windows-specific ffmpeg paths
        if not ffmpeg_path:
            windows_ffmpeg_paths = [
                os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe'),
                r'C:\ProgramData\WinGet\Links\ffmpeg.exe',
                r'C:\ffmpeg\bin\ffmpeg.exe',
                r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
            ]
            for path in windows_ffmpeg_paths:
                if os.path.exists(path):
                    ffmpeg_path = path
                    logger.info(f"🎤 Found ffmpeg at: {ffmpeg_path}")
                    break
        if ffmpeg_path:
            try:
                cmd = [
                    ffmpeg_path, '-y', '-i', input_path,
                    '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le',
                    output_path
                ]
                result = subprocess.run(cmd, capture_output=True, timeout=30)
                if result.returncode == 0 and os.path.exists(output_path):
                    logger.info(f"✅ Audio converted via ffmpeg: {input_path} -> {output_path}")
                    return output_path, True
            except Exception as e:
                logger.warning(f"ffmpeg conversion failed: {e}")

        # Method 2: Try pydub (requires ffmpeg but handles it better)
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(input_path)
            audio = audio.set_frame_rate(16000).set_channels(1)
            audio.export(output_path, format='wav')
            if os.path.exists(output_path):
                logger.info(f"✅ Audio converted via pydub: {input_path} -> {output_path}")
                return output_path, True
        except ImportError:
            logger.debug("pydub not available")
        except Exception as e:
            logger.warning(f"pydub conversion failed: {e}")

        # Method 3: Try soundfile (if OGG codec available)
        try:
            import soundfile as sf
            import numpy as np
            data, sr = sf.read(input_path)
            # Resample to 16kHz if needed
            if sr != 16000:
                # Simple resample using numpy
                duration = len(data) / sr
                new_length = int(duration * 16000)
                if len(data.shape) > 1:
                    data = data.mean(axis=1)  # Convert to mono
                data = np.interp(
                    np.linspace(0, len(data), new_length),
                    np.arange(len(data)),
                    data
                )
                sr = 16000
            elif len(data.shape) > 1:
                data = data.mean(axis=1)  # Convert to mono
            sf.write(output_path, data.astype(np.float32), sr)
            if os.path.exists(output_path):
                logger.info(f"✅ Audio converted via soundfile: {input_path} -> {output_path}")
                return output_path, True
        except Exception as e:
            logger.warning(f"soundfile conversion failed: {e}")

        # Method 4: No conversion possible
        logger.warning(f"⚠️ Audio conversion NOT possible. Install ffmpeg: winget install ffmpeg")
        logger.warning(f"⚠️ Sending original OGG audio to Sarvam (may cause issues)")
        return input_path, False

    def speech_to_text(self, audio_file_path, language_code='en'):
        """
        Transcribe audio using Sarvam STT API.
        Automatically converts OGG/Opus to WAV for better accuracy.
        Returns: dict with 'transcript' and 'language_code'
        """
        if not self.api_key:
            logger.error("Sarvam API key not configured")
            return None

        converted_path = None
        try:
            # Log file info for debugging
            file_size = os.path.getsize(audio_file_path)
            logger.info(f"🎤 STT Input: {audio_file_path}, size={file_size} bytes, requested_lang={language_code}")

            # Convert audio to WAV for better STT accuracy
            audio_to_use, was_converted = self._convert_audio_to_wav(audio_file_path)
            if was_converted:
                converted_path = audio_to_use
                converted_size = os.path.getsize(audio_to_use)
                logger.info(f"🎤 Converted audio: {audio_to_use}, size={converted_size} bytes")

            # Determine MIME type
            mime_type = 'audio/wav' if audio_to_use.endswith('.wav') else 'audio/ogg'

            with open(audio_to_use, 'rb') as audio_file:
                files = {
                    'file': (os.path.basename(audio_to_use), audio_file, mime_type)
                }
                # Use proper language code format for Sarvam API
                lang_code_full = f"{language_code}-IN" if '-' not in language_code else language_code
                data = {
                    'model': 'saaras:v2.5',
                    'language_code': lang_code_full,
                    'with_timestamps': 'false'
                }

                logger.info(f"🎤 Sarvam STT: POST {SARVAM_STT_URL}")
                logger.info(f"🎤 Sarvam STT: file={audio_to_use}, lang={lang_code_full}, mime={mime_type}")

                response = requests.post(
                    SARVAM_STT_URL,
                    headers=self._get_multipart_headers(),
                    files=files,
                    data=data,
                    timeout=30
                )

                logger.info(f"🎤 Sarvam STT: Response status={response.status_code}")

                if response.status_code == 200:
                    result = response.json()
                    transcript = result.get('transcript', '')
                    detected_lang = result.get('language_code', language_code)
                    logger.info(f"🎤 Sarvam STT SUCCESS [{detected_lang}]: '{transcript}'")
                    return {
                        'transcript': transcript,
                        'language_code': detected_lang
                    }
                else:
                    logger.error(f"🎤 Sarvam STT FAILED {response.status_code}: {response.text[:500]}")
                    return None

        except Exception as e:
            logger.error(f"🎤 Sarvam STT exception: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
        finally:
            # Clean up converted file
            if converted_path and os.path.exists(converted_path):
                try:
                    os.remove(converted_path)
                except Exception:
                    pass

    # ═══════════════════════════════════════════
    #  TEXT-TO-SPEECH (TTS)
    # ═══════════════════════════════════════════

    def _resolve_tts_speaker(self, language_code='en', speaker=None, model_name=None):
        """Resolve a TTS speaker that is compatible with the configured model."""
        model_name = model_name or self.TTS_MODEL
        allowed_speakers = self.MODEL_ALLOWED_SPEAKERS.get(model_name, set())

        requested_speaker = speaker if speaker is not None else self.LANGUAGE_SPEAKERS.get(language_code)
        normalized_requested = str(requested_speaker).strip().lower() if requested_speaker else ''

        if not allowed_speakers:
            return normalized_requested or self.DEFAULT_MODEL_SPEAKER.get(model_name, 'anushka')

        if normalized_requested and normalized_requested in allowed_speakers:
            return normalized_requested

        if normalized_requested:
            mapped_speaker = self.LEGACY_SPEAKER_COMPAT_MAP.get(normalized_requested)
            if mapped_speaker and mapped_speaker in allowed_speakers:
                logger.info(f"TTS speaker '{normalized_requested}' mapped to '{mapped_speaker}' for {model_name}")
                return mapped_speaker

        fallback_speaker = self.DEFAULT_MODEL_SPEAKER.get(model_name)
        if not fallback_speaker or fallback_speaker not in allowed_speakers:
            fallback_speaker = sorted(allowed_speakers)[0]

        if normalized_requested:
            logger.warning(f"TTS speaker '{normalized_requested}' incompatible with {model_name}; using '{fallback_speaker}'")

        return fallback_speaker

    def text_to_speech(self, text, language_code='en', speaker=None):
        """
        Convert text to speech using Sarvam TTS API.
        Returns: path to generated audio file, or None on failure.
        """
        if not self.api_key:
            logger.error("Sarvam API key not configured")
            return None

        tts_model = self.TTS_MODEL
        speaker = self._resolve_tts_speaker(language_code=language_code, speaker=speaker, model_name=tts_model)

        try:
            lang_info = self.supported_languages.get(language_code, {})
            target_lang = lang_info.get('tts_code', 'en-IN')

            payload = {
                "inputs": [text],
                "target_language_code": target_lang,
                "speaker": speaker,
                "model": tts_model,
                "pitch": 0,
                "pace": 1.0,
                "loudness": 1.5,
                "enable_preprocessing": True
            }

            logger.info(f"Sarvam TTS: '{text[:60]}...' lang={target_lang} speaker={speaker}")

            response = requests.post(
                SARVAM_TTS_URL,
                headers=self._get_headers(),
                json=payload,
                timeout=30
            )

            # Retry with fallback speaker if model rejects current speaker
            if response.status_code == 400 and "not compatible with model" in response.text.lower():
                retry_speaker = self.DEFAULT_MODEL_SPEAKER.get(tts_model, 'anushka')
                if payload.get("speaker") != retry_speaker:
                    logger.warning(f"Retrying TTS with fallback speaker '{retry_speaker}'")
                    payload["speaker"] = retry_speaker
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
                    audio_bytes = base64.b64decode(audios[0])

                    import soundfile as sf
                    import io
                    import audioop
                    import numpy as np

                    data, samplerate = sf.read(io.BytesIO(audio_bytes), dtype='int16')

                    # Opus requires specific sample rates
                    supported_rates = [8000, 12000, 16000, 24000, 48000]
                    if samplerate not in supported_rates:
                        target_rate = 24000
                        audio_resampled, _ = audioop.ratecv(data.tobytes(), 2, 1, samplerate, target_rate, None)
                        data = np.frombuffer(audio_resampled, dtype=np.int16)
                        samplerate = target_rate

                    temp_dir = os.path.join(os.getcwd(), 'uploads', 'tts')
                    os.makedirs(temp_dir, exist_ok=True)
                    audio_path = os.path.join(
                        temp_dir,
                        f"tts_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{language_code}.ogg"
                    )

                    sf.write(audio_path, data, samplerate, format='OGG', subtype='OPUS')
                    logger.info(f"Sarvam TTS saved (Ogg Opus): {audio_path}")
                    return audio_path
                else:
                    logger.error("Sarvam TTS: No audio in response")
                    return None
            else:
                logger.error(f"Sarvam TTS error {response.status_code}: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Sarvam TTS exception: {e}")
            return None

    # ═══════════════════════════════════════════
    #  TRANSLATE
    # ═══════════════════════════════════════════

    def translate_text(self, text, source_lang='en', target_lang='hi'):
        """Translate text between languages using Sarvam Translate API."""
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
                logger.info(f"Translated [{source_lang}->{target_lang}]: '{text[:40]}' -> '{translated[:40]}'")
                return translated
            else:
                logger.error(f"Sarvam Translate error {response.status_code}: {response.text}")
                return text

        except Exception as e:
            logger.error(f"Sarvam Translate exception: {e}")
            return text

    # ═══════════════════════════════════════════
    #  CHAT COMPLETION WITH TOOL CALLING
    # ═══════════════════════════════════════════

    @staticmethod
    def _extract_text_content(response_message):
        """Safely extract text from Sarvam message payloads."""
        def _collect_text(value):
            parts = []
            if isinstance(value, str):
                text = value.strip()
                if text:
                    parts.append(text)
                return parts

            if isinstance(value, list):
                for item in value:
                    parts.extend(_collect_text(item))
                return parts

            if isinstance(value, dict):
                for key in ('text', 'content', 'output_text', 'value'):
                    if key in value:
                        parts.extend(_collect_text(value.get(key)))
                if not parts:
                    for nested in value.values():
                        if isinstance(nested, (str, list, dict)):
                            parts.extend(_collect_text(nested))
            return parts

        content = response_message.get('content', '')
        text_parts = _collect_text(content)

        if not text_parts:
            text_parts = _collect_text(response_message.get('refusal', ''))

        unique_parts = []
        seen = set()
        for part in text_parts:
            if part not in seen:
                unique_parts.append(part)
                seen.add(part)

        return ' '.join(unique_parts).strip()

    @staticmethod
    def _normalize_tool_calls(response_message, round_idx=0):
        """Normalize tool calls from various provider formats."""
        tool_calls = response_message.get('tool_calls', []) or []
        if tool_calls:
            return tool_calls

        function_call = response_message.get('function_call')
        if isinstance(function_call, dict) and function_call.get('name'):
            function_name = function_call.get('name', 'tool_call')
            return [{
                "id": f"function_call_{round_idx}_{function_name}",
                "type": "function",
                "function": {
                    "name": function_name,
                    "arguments": function_call.get('arguments', '{}')
                }
            }]

        # Parse leaked textual tool calls
        text_tool_calls = SarvamService._parse_textual_tool_calls(response_message, round_idx)
        if text_tool_calls:
            cleaned = SarvamService._strip_leaked_tool_markup(
                SarvamService._extract_text_content(response_message)
            )
            response_message['tool_calls'] = text_tool_calls
            response_message['content'] = cleaned or ''
            logger.warning("Parsed leaked textual tool-call markup into structured tool_calls")
            return text_tool_calls

        return []

    @staticmethod
    def _parse_textual_tool_calls(response_message, round_idx=0):
        """Parse tool calls leaked as plain text instead of structured tool_calls."""
        text = SarvamService._extract_text_content(response_message)
        if not text:
            return []

        parsed_calls = []

        # Format 1: <function=name>{json}</function>
        function_matches = re.findall(
            r'<function\s*=\s*([a-zA-Z_][\w]*)\s*>\s*(\{.*?\})\s*</function>',
            text,
            flags=re.IGNORECASE | re.DOTALL
        )
        for idx, (fn_name, fn_args_raw) in enumerate(function_matches):
            try:
                fn_args = json.loads(fn_args_raw)
            except Exception:
                fn_args = {}

            parsed_calls.append({
                "id": f"text_function_call_{round_idx}_{idx}_{fn_name}",
                "type": "function",
                "function": {
                    "name": fn_name,
                    "arguments": json.dumps(fn_args, ensure_ascii=False)
                }
            })

        if parsed_calls:
            return parsed_calls

        # Format 2: line-based <tool_call> + arg_key/arg_value tags
        lines = [ln.strip() for ln in text.splitlines() if ln and ln.strip()]
        function_name = None
        tool_line_idx = None

        for idx, line in enumerate(lines):
            match = re.match(r'<tool_call>\s*([a-zA-Z_][\w]*)\s*(?:</tool_call>)?\s*$', line, flags=re.IGNORECASE)
            if match:
                function_name = match.group(1).strip()
                tool_line_idx = idx
                break

        if not function_name:
            inline_match = re.search(r'<tool_call>\s*([a-zA-Z_][\w]*)\s*(?:</tool_call>)?', text, flags=re.IGNORECASE)
            if inline_match:
                function_name = inline_match.group(1).strip()

        if not function_name:
            return []

        args = {}
        pending_key = None
        scan_lines = lines[(tool_line_idx + 1):] if tool_line_idx is not None else lines

        for line in scan_lines:
            key_match = re.match(r'<arg_key>\s*([^<]+?)\s*(?:</arg_key>)?\s*$', line, flags=re.IGNORECASE)
            if key_match:
                pending_key = key_match.group(1).strip().strip('"').strip("'")
                continue

            value_match = re.match(r'<arg_value>\s*([^<]+?)\s*(?:</arg_value>)?\s*$', line, flags=re.IGNORECASE)
            if value_match and pending_key:
                args[pending_key] = value_match.group(1).strip()
                pending_key = None
                continue

            inline_kv_match = re.match(r'<arg_key>\s*([^<:]+?)\s*:\s*([^<]+)$', line, flags=re.IGNORECASE)
            if inline_kv_match:
                args[inline_kv_match.group(1).strip()] = inline_kv_match.group(2).strip()
                pending_key = None
                continue

            if pending_key and not line.startswith('<'):
                args[pending_key] = line.strip()
                pending_key = None

        return [{
            "id": f"text_tool_call_{round_idx}_{function_name}",
            "type": "function",
            "function": {
                "name": function_name,
                "arguments": json.dumps(args, ensure_ascii=False)
            }
        }]

    @staticmethod
    def _strip_leaked_tool_markup(text):
        """Remove leaked tool-call markup from model text."""
        if not text:
            return ''

        cleaned = str(text)

        cleaned = re.sub(r'<function\s*=\s*[^>]+>\s*\{.*?\}\s*</function>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'</?function[^>]*>', ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^\s*<tool_call>.*$', ' ', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'^\s*<arg_key>.*$', ' ', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'^\s*<arg_value>.*$', ' ', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'</?tool_call[^>]*>', ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'</?arg_key[^>]*>', ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'</?arg_value[^>]*>', ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^\s*(list_available_doctors|check_availability|book_appointment)\s*$', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'[ \t]+', ' ', cleaned)
        cleaned = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned)
        return cleaned.strip()

    def _run_final_synthesis(self, chat_messages, headers, synthesis_prompt):
        """Execute one final no-tools synthesis turn and return extracted text."""
        final_messages = chat_messages + [{"role": "system", "content": synthesis_prompt}]

        final_payload = {
            "model": self.model,
            "messages": final_messages,
            "temperature": 0.3,
            "max_tokens": 512
        }

        final_response = requests.post(
            SARVAM_CHAT_URL,
            headers=headers,
            json=final_payload,
            timeout=30
        )

        if final_response.status_code != 200:
            logger.warning(f"Sarvam final synthesis failed {final_response.status_code}: {final_response.text}")
            return None

        final_result = final_response.json()
        final_message = final_result.get('choices', [{}])[0].get('message', {})
        final_content = self._strip_leaked_tool_markup(self._extract_text_content(final_message))
        if final_content:
            return final_content

        logger.warning("Sarvam final synthesis returned empty content")
        return None

    def process_conversation(self, messages, available_services=None, available_doctors=None,
                              tool_callback=None, language_code='en'):
        """
        Process conversation using Sarvam model with tool calling support.

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
            lang_info = self.supported_languages.get(language_code, {})
            lang_name = lang_info.get('name', 'English')

            system_content = self.system_prompt + f"\n\nIMPORTANT: The user is speaking in {lang_name}. Respond in {lang_name}."
            system_content += f"\nToday's date is {datetime.now().strftime('%Y-%m-%d, %A')}."

            if available_services:
                system_content += f"\nAvailable Services: {', '.join(available_services)}"
            if available_doctors:
                system_content += f"\nAvailable Doctors: {', '.join(available_doctors)}"

            chat_messages = [{"role": "system", "content": system_content}]

            for msg in messages:
                chat_messages.append(msg)

            headers = {
                "api-subscription-key": self.api_key,
                "Content-Type": "application/json"
            }

            max_tool_rounds = max(1, int(os.getenv('SARVAM_MAX_TOOL_ROUNDS', '6')))
            final_synthesis_prompt = None

            for round_idx in range(max_tool_rounds):
                payload = {
                    "model": self.model,
                    "messages": chat_messages,
                    "tools": self.tools,
                    "tool_choice": "auto",
                    "temperature": 0.3,
                    "max_tokens": 512
                }

                logger.info(f"Sarvam Chat: round {round_idx + 1}/{max_tool_rounds}, messages={len(chat_messages)}")

                response = requests.post(
                    SARVAM_CHAT_URL,
                    headers=headers,
                    json=payload,
                    timeout=30
                )

                if response.status_code != 200:
                    logger.error(f"Sarvam Chat error {response.status_code}: {response.text}")
                    return "I'm having trouble connecting right now. Can we try again in a moment?"

                result = response.json()
                response_message = result.get('choices', [{}])[0].get('message', {})
                tool_calls = self._normalize_tool_calls(response_message, round_idx)

                if tool_calls:
                    if not tool_callback:
                        logger.warning("Tool calls returned but no tool callback was provided")
                        content = self._extract_text_content(response_message)
                        return content or "I couldn't access booking tools just now. Please try again."

                    chat_messages.append(response_message)

                    for tool_idx, tool_call in enumerate(tool_calls):
                        function_info = tool_call.get('function', {})
                        function_name = function_info.get('name', '')
                        function_args_raw = function_info.get('arguments', '{}')
                        tool_call_id = tool_call.get('id') or f"tool_call_{round_idx}_{tool_idx}_{function_name or 'unknown'}"

                        if isinstance(function_args_raw, dict):
                            function_args = function_args_raw
                        else:
                            try:
                                function_args = json.loads(function_args_raw or '{}')
                            except json.JSONDecodeError:
                                function_args = {}

                        function_args = normalize_tool_argument_keys(function_name, function_args)
                        logger.info(f"Sarvam tool call: {function_name}({function_args})")

                        tool_result = tool_callback(function_name, function_args)

                        chat_messages.append({
                            "tool_call_id": tool_call_id,
                            "role": "tool",
                            "name": function_name,
                            "content": str(tool_result)
                        })

                    if round_idx >= (max_tool_rounds - 1):
                        final_synthesis_prompt = FINAL_SYNTHESIS_PROMPT
                        logger.info("Sarvam reached tool-call round limit; running final synthesis")
                        break

                    continue

                content = self._strip_leaked_tool_markup(self._extract_text_content(response_message))
                if content:
                    return content

                is_last_round = round_idx >= (max_tool_rounds - 1)
                if not is_last_round:
                    logger.warning(f"Sarvam returned empty content (round {round_idx + 1}/{max_tool_rounds}); retrying")
                    chat_messages.append({"role": "system", "content": EMPTY_RESPONSE_RETRY_PROMPT})
                    continue

                logger.warning(f"Sarvam returned empty content (round {round_idx + 1}/{max_tool_rounds})")
                final_synthesis_prompt = EMPTY_FINAL_SYNTHESIS_PROMPT
                logger.info("Running final synthesis turn due to empty response")
                break

            if final_synthesis_prompt:
                final_content = self._run_final_synthesis(
                    chat_messages=chat_messages,
                    headers=headers,
                    synthesis_prompt=final_synthesis_prompt
                )
                if final_content:
                    return final_content

            logger.warning("Sarvam exceeded max tool-call rounds without final content")
            return "I processed your request but couldn't formulate a response."

        except Exception as e:
            logger.error(f"Sarvam conversation error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return "I'm having a little trouble connecting right now. Can we try again in a moment?"

    # ═══════════════════════════════════════════
    #  SPOKEN SHIFT FORMATTING
    # ═══════════════════════════════════════════

    @staticmethod
    def format_shifts_for_speech(shifts, doctor_name, date_str, language_code='en'):
        """Format shift data into natural spoken language."""
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
            shift_parts.append(f"{name.lower()} shift from {start} to {end} with {slots} available slots")

        if len(shift_parts) == 1:
            shifts_str = shift_parts[0]
        elif len(shift_parts) == 2:
            shifts_str = f"{shift_parts[0]}, and {shift_parts[1]}"
        else:
            shifts_str = ', '.join(shift_parts[:-1]) + f", and {shift_parts[-1]}"

        return f"Doctor {doctor_name} is available on {day_name}. There is a {shifts_str}. Which shift would you prefer?"

    @staticmethod
    def format_slots_for_speech(slots, shift_name='', language_code='en'):
        """Format time slots into natural spoken language."""
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

        slot_times = [time_spoken(s['start']) for s in slots[:8]]

        if len(slot_times) == 1:
            times_str = slot_times[0]
        elif len(slot_times) == 2:
            times_str = f"{slot_times[0]} and {slot_times[1]}"
        else:
            times_str = ', '.join(slot_times[:-1]) + f", and {slot_times[-1]}"

        first_slot = slots[0]['start']
        h = int(first_slot.split(':')[0])
        period = 'AM' if h < 12 else 'PM'

        prefix = f"In the {shift_name.lower()} shift, " if shift_name else ""
        return f"{prefix}available slots are at {times_str} {period}. What time works for you?"

    # ═══════════════════════════════════════════
    #  TOOL RESULT TRANSLATION
    # ═══════════════════════════════════════════

    def translate_tool_result(self, text, language_code='en'):
        """Translate an English tool callback result into the user's language."""
        if not text or language_code == 'en' or not self.api_key:
            return text

        try:
            preserved = {}
            counter = [0]

            def _preserve(match):
                placeholder = f"__PRSV{counter[0]}__"
                preserved[placeholder] = match.group(0)
                counter[0] += 1
                return placeholder

            working_text = str(text)

            working_text = re.sub(r'APT-[\w-]+', _preserve, working_text)
            working_text = re.sub(r'\d{4}-\d{2}-\d{2}', _preserve, working_text)
            working_text = re.sub(r'\d{1,2}:\d{2}\s*(?:AM|PM)?', _preserve, working_text, flags=re.IGNORECASE)
            working_text = re.sub(r'Dr\.?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*', _preserve, working_text)

            translated = self.translate_text(working_text, 'en', language_code)

            for placeholder, original in preserved.items():
                translated = translated.replace(placeholder, original)

            return translated

        except Exception as e:
            logger.warning(f"Tool result translation failed, returning English: {e}")
            return text

    # ═══════════════════════════════════════════
    #  UTILITY
    # ═══════════════════════════════════════════

    def is_available(self):
        """Check if Sarvam service is configured and ready."""
        return bool(self.api_key)
