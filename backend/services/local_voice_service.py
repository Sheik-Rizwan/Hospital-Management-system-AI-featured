# local_voice_service.py — Local STT and TTS Models
# Wraps faster-whisper (STT) and Facebook MMS (TTS)

import os
import time
import uuid
from datetime import datetime
from logger_config import logger

try:
    import torch
except ImportError:
    torch = None
    logger.warning("torch not installed. Local voice features will be disabled.")

try:
    import soundfile as sf
except ImportError:
    sf = None
    logger.warning("soundfile not installed. Local TTS features will be disabled.")

try:
    from faster_whisper import WhisperModel
    from transformers import VitsModel, AutoTokenizer
except ImportError:
    WhisperModel = None
    VitsModel = None
    AutoTokenizer = None
    logger.warning("faster-whisper or transformers not installed. Local voice will fail.")

# Map Sarvam Language codes to Facebook MMS ISO codes
MMS_LANG_MAP = {
    'en': 'eng',
    'hi': 'hin',
    'te': 'tel',
    'kn': 'kan',
    'ur': 'urd'
}

class LocalVoiceService:
    """
    Handles local STT using faster-whisper and TTS using facebook/mms-tts.
    Loads models lazily to save RAM if not in use.
    """
    
    def __init__(self):
        self.stt_model = None
        
        # Dictionary to cache TTS models/tokenizers in memory: { 'hin': (model, tokenizer) }
        self.tts_models = {}

        self.stt_available = bool(torch is not None and WhisperModel is not None)
        self.tts_available = bool(
            torch is not None and sf is not None and
            VitsModel is not None and AutoTokenizer is not None
        )
        
        self.device = "cuda" if (torch is not None and torch.cuda.is_available()) else "cpu"
        logger.info(f"LocalVoiceService initialized. Compute device: {self.device}")
        if not self.stt_available:
            logger.warning("Local STT unavailable (torch/faster-whisper missing)")
        if not self.tts_available:
            logger.warning("Local TTS unavailable (torch/transformers/soundfile missing)")

    # ═══════════════════════════════════════════
    #  STT: Whisper Tiny
    # ═══════════════════════════════════════════
    
    def _get_stt_model(self):
        if not self.stt_available:
            logger.warning("Local STT requested but dependencies are missing")
            return None
        if self.stt_model is None:
            logger.info("loading faster-whisper 'tiny' model into memory...")
            # compute_type="int8" reduces memory usage with slight accuracy drop on CPU
            self.stt_model = WhisperModel("tiny", device=self.device, compute_type="int8")
        return self.stt_model

    def speech_to_text(self, audio_file_path: str, language_code: str = 'en') -> dict:
        """
        Transcribe an audio file using local faster-whisper.
        Returns a dict matching the Sarvam STT format.
        """
        try:
            model = self._get_stt_model()
            if model is None:
                return None
            logger.info(f" Local STT: processing {audio_file_path}")
            
            # Whisper handles multi-lingual detection automatically, but we can hint the language
            # Faster-whisper uses 2-letter codes.
            whisper_lang = language_code if language_code in ['en', 'hi', 'te', 'kn', 'ur'] else None
            
            segments, info = model.transcribe(audio_file_path, beam_size=5, language=whisper_lang)
            
            transcript = ""
            for segment in segments:
                transcript += segment.text + " "
                
            transcript = transcript.strip()
            logger.info(f" Local STT Result: '{transcript}'")
            
            return {
                'transcript': transcript,
                'language_code': info.language
            }
            
        except Exception as e:
            logger.error(f" Local STT exception: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    # ═══════════════════════════════════════════
    #  TTS: Facebook MMS
    # ═══════════════════════════════════════════

    def _get_tts_model(self, mms_code: str):
        """Lazy load the TTS model for a specific language."""
        if not self.tts_available:
            logger.warning("Local TTS requested but dependencies are missing")
            return None, None

        if mms_code not in self.tts_models:
            repo_id = f"facebook/mms-tts-{mms_code}"
            logger.info(f"loading TTS model {repo_id} into memory...")
            try:
                tokenizer = AutoTokenizer.from_pretrained(repo_id)
                model = VitsModel.from_pretrained(repo_id).to(self.device)
                self.tts_models[mms_code] = (model, tokenizer)
            except Exception as e:
                logger.error(f"Failed to load TTS model {repo_id}: {e}")
                return None, None
                
        return self.tts_models[mms_code]

    def text_to_speech(self, text: str, language_code: str = 'en') -> str:
        """
        Convert text to speech using local Facebook MMS TTS.
        Returns the path to the generated .wav file.
        """
        try:
            if not self.tts_available:
                logger.warning("Skipping local TTS; required dependencies are unavailable")
                return None

            mms_code = MMS_LANG_MAP.get(language_code, 'eng')
            
            model, tokenizer = self._get_tts_model(mms_code)
            if not model:
                return None

            logger.info(f" Local TTS: '{text[:60]}...' lang={mms_code}")
            
            # Tokenize input
            inputs = tokenizer(text, return_tensors="pt").to(self.device)
            
            # Generate audio waveform
            with torch.no_grad():
                output = model(**inputs).waveform
                
            # Bring waveform back to CPU as a numpy array
            audio_data = output.squeeze().cpu().numpy()
            sample_rate = model.config.sampling_rate

            # Save to temp file
            temp_dir = os.path.join(os.getcwd(), 'uploads', 'tts')
            os.makedirs(temp_dir, exist_ok=True)
            
            audio_path = os.path.join(
                temp_dir,
                f"local_tts_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.ogg"
            )
            
            # Write as Ogg Opus (required by WhatsApp voice messages)
            sf.write(audio_path, audio_data, sample_rate, format='OGG', subtype='OPUS')
            
            logger.info(f" Local TTS saved: {audio_path}")
            return audio_path

        except Exception as e:
            logger.error(f" Local TTS exception: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
