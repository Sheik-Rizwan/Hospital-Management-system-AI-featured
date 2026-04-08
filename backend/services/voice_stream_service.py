# voice_stream_service.py — Real-Time Twilio Media Stream WebSocket Handler
# Handles bi-directional audio: Twilio mulaw ↔ Sarvam AI (STT → LLM → TTS)

import os
import json
import base64
import struct
import io
import time
import threading
import tempfile
from datetime import datetime
from logger_config import logger

from services.sarvam_service import SarvamService
from services.sarvam_prompts import VOICE_BOT_PROMPT, OUTBOUND_APPROVAL_PROMPT
from services.voice_booking_service import VoiceBookingService


# ═══════════════════════════════════════════
#  AUDIO FORMAT CONVERSION UTILITIES
# ═══════════════════════════════════════════

# mulaw ↔ linear PCM lookup tables
MULAW_BIAS = 0x84
MULAW_MAX = 0x7FFF
MULAW_CLIP = 32635


def _linear_to_mulaw(sample):
    """Convert a 16-bit signed PCM sample to 8-bit mulaw."""
    sign = (sample >> 8) & 0x80
    if sign:
        sample = -sample
    if sample > MULAW_CLIP:
        sample = MULAW_CLIP
    sample += MULAW_BIAS
    exponent = 7
    mask = 0x4000
    while exponent > 0:
        if sample & mask:
            break
        exponent -= 1
        mask >>= 1
    mantissa = (sample >> (exponent + 3)) & 0x0F
    mulaw_byte = ~(sign | (exponent << 4) | mantissa) & 0xFF
    return mulaw_byte


def _mulaw_to_linear(mulaw_byte):
    """Convert an 8-bit mulaw byte to 16-bit signed PCM sample."""
    mulaw_byte = ~mulaw_byte & 0xFF
    sign = mulaw_byte & 0x80
    exponent = (mulaw_byte >> 4) & 0x07
    mantissa = mulaw_byte & 0x0F
    sample = ((mantissa << 3) + MULAW_BIAS) << exponent
    sample -= MULAW_BIAS
    if sign:
        sample = -sample
    return sample


def mulaw_bytes_to_pcm16(mulaw_data):
    """Convert mulaw byte array to 16-bit PCM byte array."""
    pcm_samples = []
    for byte in mulaw_data:
        pcm_samples.append(_mulaw_to_linear(byte))
    return struct.pack(f'<{len(pcm_samples)}h', *pcm_samples)


def pcm16_to_mulaw_bytes(pcm_data):
    """Convert 16-bit PCM byte array to mulaw byte array."""
    samples = struct.unpack(f'<{len(pcm_data) // 2}h', pcm_data)
    mulaw = bytearray()
    for sample in samples:
        mulaw.append(_linear_to_mulaw(sample))
    return bytes(mulaw)


def wav_to_mulaw_8k(wav_path):
    """
    Read a WAV/OGG file and convert to 8kHz mulaw bytes for Twilio streaming.
    Uses soundfile for reading, then resamples + converts to mulaw.
    """
    try:
        import soundfile as sf
        import numpy as np

        data, samplerate = sf.read(wav_path, dtype='float32')

        # Convert stereo to mono
        if len(data.shape) > 1:
            data = data.mean(axis=1)

        # Resample to 8000 Hz if needed
        if samplerate != 8000:
            duration = len(data) / samplerate
            new_length = int(duration * 8000)
            data = np.interp(
                np.linspace(0, len(data), new_length),
                np.arange(len(data)),
                data
            )

        # Convert float32 to int16
        pcm16 = (data * 32767).astype(np.int16).tobytes()

        # Convert PCM16 to mulaw
        return pcm16_to_mulaw_bytes(pcm16)

    except Exception as e:
        logger.error(f"wav_to_mulaw_8k conversion error: {e}")
        return None


def audio_base64_to_mulaw_8k(audio_b64):
    """
    Convert base64 audio from Sarvam TTS (WAV format) to 8kHz mulaw bytes.
    Saves to a temp file, converts, then cleans up.
    """
    try:
        audio_bytes = base64.b64decode(audio_b64)

        temp_dir = os.path.join(os.getcwd(), 'uploads', 'tts')
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"tts_stream_{int(time.time() * 1000)}.wav")

        with open(temp_path, 'wb') as f:
            f.write(audio_bytes)

        mulaw_data = wav_to_mulaw_8k(temp_path)

        # Cleanup temp file
        try:
            os.remove(temp_path)
        except Exception:
            pass

        return mulaw_data

    except Exception as e:
        logger.error(f"audio_base64_to_mulaw_8k error: {e}")
        return None


# ═══════════════════════════════════════════
#  VOICE STREAM SESSION
# ═══════════════════════════════════════════

class VoiceStreamSession:
    """
    Manages one active phone call's state:
    - Audio buffer for accumulating user speech
    - Conversation history for the LLM
    - Silence detection (VAD) for turn-taking
    """

    # How long silence must last before we consider the user done speaking (seconds)
    SILENCE_THRESHOLD_SEC = 1.5
    # Minimum audio duration to process (avoids processing noise bursts)
    MIN_AUDIO_DURATION_SEC = 0.3
    # Max audio buffer before forced processing (60s of 8kHz mulaw = 480000 bytes)
    MAX_BUFFER_BYTES = 480000

    def __init__(self, call_sid, stream_sid, call_type='inbound', appointment_context=None):
        self.call_sid = call_sid
        self.stream_sid = stream_sid
        self.call_type = call_type  # 'inbound' or 'outbound'
        self.appointment_context = appointment_context or {}

        # Audio buffer (mulaw 8kHz bytes)
        self.audio_buffer = bytearray()
        self.last_audio_time = time.time()
        self.is_speaking = False

        # Bot state
        self.bot_is_playing = False
        self.interrupted = False

        # Conversation state
        self.messages = []
        self.language_code = 'en'
        self.patient_id = ''
        self.greeting_sent = False

        # Services
        self.sarvam = SarvamService()
        self.voice_booking = VoiceBookingService()

    def get_system_prompt(self):
        """Return the appropriate system prompt based on call type."""
        if self.call_type == 'outbound':
            prompt = OUTBOUND_APPROVAL_PROMPT
            if self.appointment_context:
                ctx = self.appointment_context
                prompt += (
                    f"\n\nAPPOINTMENT DETAILS:"
                    f"\nPatient: {ctx.get('patient_name', 'the patient')}"
                    f"\nDoctor: {ctx.get('doctor_name', 'the doctor')}"
                    f"\nDate: {ctx.get('date', '')}"
                    f"\nTime: {ctx.get('time', '')}"
                )
            return prompt

        prompt = VOICE_BOT_PROMPT
        prompt += f"\nToday's date is {datetime.now().strftime('%Y-%m-%d, %A')}."

        # Add available doctors context
        try:
            doctors = self.voice_booking.appt.get_active_doctors()
            doctor_names = [d.get('full_name', '') for d in doctors if d.get('full_name')]
            if doctor_names:
                prompt += f"\nAvailable Doctors: {', '.join(doctor_names)}"
        except Exception:
            pass

        return prompt

    def get_greeting(self):
        """Generate first greeting for the call."""
        if self.call_type == 'outbound' and self.appointment_context:
            ctx = self.appointment_context
            name = ctx.get('patient_name', '')
            doctor = ctx.get('doctor_name', '')
            date = ctx.get('date', '')
            time_str = ctx.get('time', '')
            return (
                f"Hello {name}! This is Ritu calling from the hospital. "
                f"I'm happy to let you know that your appointment with Doctor {doctor} "
                f"on {date} at {time_str} has been confirmed. "
                f"Please arrive 10 minutes early. Is there anything you'd like to ask?"
            )
        return (
            "Hello! Welcome to our hospital appointment service. "
            "I'm Ritu, and I can help you book a medical appointment. "
            "Which doctor or specialty would you like to see?"
        )


# ═══════════════════════════════════════════
#  WEBSOCKET HANDLER
# ═══════════════════════════════════════════

# Active sessions: stream_sid → VoiceStreamSession
_active_sessions = {}
_sessions_lock = threading.Lock()


def handle_voice_stream(ws):
    """
    Main WebSocket handler for Twilio Media Streams.
    Receives JSON messages from Twilio containing audio chunks.
    Protocol: https://www.twilio.com/docs/voice/media-streams
    """
    session = None
    stream_sid = None

    try:
        while True:
            raw_message = ws.receive()
            if raw_message is None:
                break

            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            event = message.get('event')

            # ── Connected: Twilio tells us the stream is ready
            if event == 'connected':
                logger.info("Twilio Media Stream: connected")
                continue

            # ── Start: Contains metadata about the stream
            if event == 'start':
                start_data = message.get('start', {})
                stream_sid = start_data.get('streamSid', '')
                call_sid = start_data.get('callSid', '')
                custom_params = start_data.get('customParameters', {})

                call_type = custom_params.get('callType', 'inbound')
                patient_id = custom_params.get('patientId', '')

                # Parse appointment context for outbound calls
                appointment_context = {}
                if call_type == 'outbound':
                    appointment_context = {
                        'patient_name': custom_params.get('patientName', ''),
                        'doctor_name': custom_params.get('doctorName', ''),
                        'date': custom_params.get('appointmentDate', ''),
                        'time': custom_params.get('appointmentTime', ''),
                    }

                session = VoiceStreamSession(
                    call_sid=call_sid,
                    stream_sid=stream_sid,
                    call_type=call_type,
                    appointment_context=appointment_context
                )
                session.patient_id = patient_id

                with _sessions_lock:
                    _active_sessions[stream_sid] = session

                logger.info(f"Voice stream started: call={call_sid}, stream={stream_sid}, type={call_type}")

                # Send initial greeting
                _send_greeting(ws, session)
                continue

            # ── Media: Audio data from the caller
            if event == 'media' and session:
                media = message.get('media', {})
                payload_b64 = media.get('payload', '')
                if not payload_b64:
                    continue

                audio_chunk = base64.b64decode(payload_b64)

                # If bot is currently playing audio and user speaks, interrupt
                if session.bot_is_playing:
                    session.interrupted = True
                    session.bot_is_playing = False
                    # Send clear message to stop Twilio playback
                    _send_clear(ws, session.stream_sid)
                    # Reset audio buffer for new utterance
                    session.audio_buffer = bytearray()
                    logger.info("User interrupted bot — cleared playback")

                # Accumulate audio
                session.audio_buffer.extend(audio_chunk)
                session.last_audio_time = time.time()
                session.is_speaking = True

                # Check for silence (process if threshold exceeded)
                # Twilio sends ~20ms chunks at 8kHz = 160 bytes
                # We check in the main loop, but also handle max buffer
                if len(session.audio_buffer) >= session.MAX_BUFFER_BYTES:
                    _process_user_audio(ws, session)

                continue

            # ── Mark: Twilio confirms audio playback completed
            if event == 'mark' and session:
                mark_name = message.get('mark', {}).get('name', '')
                if mark_name == 'bot_audio_done':
                    session.bot_is_playing = False
                    logger.info("Bot audio playback completed")
                continue

            # ── Stop: Call ended
            if event == 'stop':
                logger.info(f"Voice stream stopped: {stream_sid}")
                break

        # Check for silence timeout periodically
        if session and session.is_speaking:
            elapsed = time.time() - session.last_audio_time
            if elapsed >= session.SILENCE_THRESHOLD_SEC and len(session.audio_buffer) > 0:
                _process_user_audio(ws, session)

    except Exception as e:
        logger.error(f"Voice stream error: {e}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        if stream_sid:
            with _sessions_lock:
                _active_sessions.pop(stream_sid, None)
            logger.info(f"Voice stream session cleaned up: {stream_sid}")


def _send_greeting(ws, session):
    """Send the initial greeting TTS to the caller."""
    try:
        greeting_text = session.get_greeting()
        session.greeting_sent = True

        # Initialize conversation history
        session.messages = [
            {"role": "system", "content": session.get_system_prompt()},
            {"role": "assistant", "content": greeting_text}
        ]

        # Convert greeting to speech and stream to Twilio
        audio_b64 = session.sarvam.text_to_speech_raw(greeting_text, language_code='en')
        if audio_b64:
            _stream_audio_to_twilio(ws, session, audio_b64)
        else:
            logger.warning("Failed to generate greeting TTS")

    except Exception as e:
        logger.error(f"Greeting error: {e}")


def _process_user_audio(ws, session):
    """
    Process accumulated user audio:
    1. Convert mulaw buffer → WAV file
    2. STT transcription
    3. LLM conversation
    4. TTS response
    5. Stream back to Twilio
    """
    if not session.audio_buffer:
        return

    # Check minimum audio duration (8kHz mulaw = 8000 bytes/sec)
    audio_duration = len(session.audio_buffer) / 8000.0
    if audio_duration < session.MIN_AUDIO_DURATION_SEC:
        session.audio_buffer = bytearray()
        session.is_speaking = False
        return

    # Grab the buffer and reset
    audio_data = bytes(session.audio_buffer)
    session.audio_buffer = bytearray()
    session.is_speaking = False

    try:
        # Step 1: Convert mulaw → PCM16 → WAV file for STT
        pcm_data = mulaw_bytes_to_pcm16(audio_data)

        temp_dir = os.path.join(os.getcwd(), 'uploads', 'tts')
        os.makedirs(temp_dir, exist_ok=True)
        wav_path = os.path.join(temp_dir, f"stt_{session.call_sid}_{int(time.time() * 1000)}.wav")

        import soundfile as sf
        import numpy as np
        pcm_array = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32) / 32768.0
        sf.write(wav_path, pcm_array, 8000, format='WAV')

        # Step 2: Transcribe
        stt_result = session.sarvam.speech_to_text(wav_path, language_code=session.language_code)

        # Cleanup wav file
        try:
            os.remove(wav_path)
        except Exception:
            pass

        if not stt_result or not stt_result.get('transcript', '').strip():
            logger.info("STT returned empty transcript — ignoring")
            return

        transcript = stt_result['transcript'].strip()
        detected_lang = stt_result.get('language_code', session.language_code)

        # Update language if detected differently
        if detected_lang and '-' in detected_lang:
            detected_lang = detected_lang.split('-')[0]
        if detected_lang in session.sarvam.supported_languages:
            session.language_code = detected_lang

        logger.info(f"User said [{session.language_code}]: '{transcript}'")

        # Step 3: Add user message and get LLM response
        session.messages.append({"role": "user", "content": transcript})

        # Use the voice booking service for tool-enabled conversation
        result = session.voice_booking.process_turn(
            messages=session.messages,
            language_code=session.language_code,
            patient_id=session.patient_id
        )

        reply_text = result.get('reply_text', '')
        if not reply_text:
            reply_text = "I'm sorry, could you please repeat that?"

        logger.info(f"Bot reply: '{reply_text[:80]}...'")

        # Add assistant reply to history
        session.messages.append({"role": "assistant", "content": reply_text})

        # Step 4: Convert reply to TTS and stream
        audio_b64 = session.sarvam.text_to_speech_raw(reply_text, language_code=session.language_code)
        if audio_b64:
            _stream_audio_to_twilio(ws, session, audio_b64)
        else:
            logger.warning("Failed to generate reply TTS")

    except Exception as e:
        logger.error(f"Process user audio error: {e}")
        import traceback
        logger.error(traceback.format_exc())


def _stream_audio_to_twilio(ws, session, audio_b64):
    """
    Convert Sarvam TTS output (base64 WAV) to mulaw 8kHz and
    stream it to Twilio as media events.
    """
    try:
        mulaw_data = audio_base64_to_mulaw_8k(audio_b64)
        if not mulaw_data:
            logger.warning("Failed to convert TTS audio to mulaw")
            return

        session.bot_is_playing = True
        session.interrupted = False

        # Twilio expects chunks of ~20ms at 8kHz = 160 bytes
        CHUNK_SIZE = 160
        for i in range(0, len(mulaw_data), CHUNK_SIZE):
            if session.interrupted:
                logger.info("Stopping audio stream — user interrupted")
                break

            chunk = mulaw_data[i:i + CHUNK_SIZE]
            chunk_b64 = base64.b64encode(chunk).decode('utf-8')

            media_message = json.dumps({
                "event": "media",
                "streamSid": session.stream_sid,
                "media": {
                    "payload": chunk_b64
                }
            })

            try:
                ws.send(media_message)
            except Exception:
                break

        # Send mark to know when playback is done
        if not session.interrupted:
            mark_message = json.dumps({
                "event": "mark",
                "streamSid": session.stream_sid,
                "mark": {"name": "bot_audio_done"}
            })
            try:
                ws.send(mark_message)
            except Exception:
                pass

    except Exception as e:
        logger.error(f"Stream audio to Twilio error: {e}")
        session.bot_is_playing = False


def _send_clear(ws, stream_sid):
    """Send a clear message to Twilio to stop any queued audio."""
    try:
        clear_message = json.dumps({
            "event": "clear",
            "streamSid": stream_sid
        })
        ws.send(clear_message)
        logger.info("Sent clear event to Twilio")
    except Exception as e:
        logger.error(f"Failed to send clear: {e}")
