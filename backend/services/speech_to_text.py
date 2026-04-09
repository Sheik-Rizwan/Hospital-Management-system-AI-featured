# speech_to_text.py

import logging
import speech_recognition as sr
from typing import Optional

logger = logging.getLogger(__name__)

class SpeechToTextRecorder:
    """Handle speech-to-text recording for nurse handoff transcripts."""
    
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 4000
        self.recognizer.dynamic_energy_threshold = True

    def record_handoff(self, mic_index: Optional[int] = None,
                       timeout: int = 60, phrase_time_limit: int = 300) -> str:
        """Record nurse handoff speech and convert to text."""
        try:
            if mic_index is not None:
                microphone = sr.Microphone(device_index=mic_index)
            else:
                microphone = sr.Microphone()

            with microphone as source:
                logger.info(" Adjusting for ambient noise... Please wait.")
                self.recognizer.adjust_for_ambient_noise(source, duration=2)
                logger.info(" Ready to record!")
                logger.info(f"RECORDING STARTED (max {phrase_time_limit}s)")
                logger.info("Speak your handoff report now...")
                
                audio = self.recognizer.listen(
                    source,
                    timeout=timeout,
                    phrase_time_limit=phrase_time_limit
                )

            logger.info(" Recording stopped. Processing...")
            logger.info(" Transcribing audio...")
            text = self.recognizer.recognize_google(audio)
            logger.info(" Transcription complete!")
            return text

        except sr.WaitTimeoutError:
            raise Exception("No speech detected. Please try again and speak clearly.")
        except sr.UnknownValueError:
            raise Exception("Could not understand audio. Please speak more clearly.")
        except sr.RequestError as e:
            raise Exception(f"Speech recognition service error: {e}")
        except Exception as e:
            raise Exception(f"Recording error: {e}")

    def record_with_pause_detection(self, mic_index: Optional[int] = None,
                                     pause_threshold: float = 2.0) -> str:
        """Record with automatic pause detection (stops after long silence)."""
        try:
            if mic_index is not None:
                microphone = sr.Microphone(device_index=mic_index)
            else:
                microphone = sr.Microphone()

            with microphone as source:
                logger.info(" Adjusting for ambient noise...")
                self.recognizer.adjust_for_ambient_noise(source, duration=2)
                self.recognizer.pause_threshold = pause_threshold
                logger.info(" Ready! Recording will auto-stop after silence.")
                logger.info(" RECORDING STARTED - Speak now...")
                
                audio = self.recognizer.listen(source)

            logger.info(" Recording stopped. Processing...")
            logger.info(" Transcribing...")
            text = self.recognizer.recognize_google(audio)
            logger.info(" Transcription complete!")
            return text

        except Exception as e:
            raise Exception(f"Recording error: {e}")

    def transcribe_audio_file(self, audio_file_path: str, language_code: str = 'en') -> str:
        """Transcribe an audio file using Groq Whisper API with multilingual support.
        language_code: 'en', 'hi', 'te', 'kn' — passed to Whisper for higher accuracy.
        """
        try:
            import os
            from groq import Groq
            
            api_key = os.getenv('GROQ_API_KEY')
            if not api_key:
                logger.warning(" GROQ_API_KEY not found. Fallback to Google Speech Recognition.")
                return self._transcribe_fallback(audio_file_path)

            client = Groq(api_key=api_key)
            
            # Open the file in binary mode
            with open(audio_file_path, "rb") as file:
                logger.info(f"Sending audio to Groq Whisper: {audio_file_path}")
                
                # Check file size (optional safety)
                file.seek(0, 2)
                size = file.tell()
                file.seek(0)
                if size == 0:
                     raise Exception("Audio file is empty")

                # Map common 2-letter codes that Whisper natively understands
                whisper_lang_map = {'kn': 'kn', 'te': 'te', 'hi': 'hi', 'en': 'en', 'ur': 'ur'}
                whisper_lang = whisper_lang_map.get(language_code, 'en')

                transcription = client.audio.transcriptions.create(
                    file=(os.path.basename(audio_file_path), file.read()),
                    model="whisper-large-v3",
                    language=whisper_lang,
                    response_format="json",
                    temperature=0.0
                )
                logger.info(" Transcription complete!")
                return transcription.text

        except Exception as e:
            logger.error(f"Groq Transcription error: {e}")
            # Fallback to local if Groq fails
            return self._transcribe_fallback(audio_file_path)

    def _transcribe_fallback(self, audio_file_path: str) -> str:
        """Fallback to speech_recognition if Groq fails."""
        try:
            with sr.AudioFile(audio_file_path) as source:
                logger.warning(f"Processing with fallback (Google SR): {audio_file_path}")
                audio = self.recognizer.record(source)
                text = self.recognizer.recognize_google(audio)
                return text
        except Exception as e:
             raise Exception(f"Transcription failed: {str(e)}")
