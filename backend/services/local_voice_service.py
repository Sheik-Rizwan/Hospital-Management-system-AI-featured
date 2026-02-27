# local_voice_service.py — Local STT and TTS Models
# Wraps faster-whisper (STT) and Facebook MMS (TTS)

import os
import time
import uuid
import torch
import soundfile as sf
from datetime import datetime
from logger_config import logger

try:
    from faster_whisper import WhisperModel
    from transformers import VitsModel, AutoTokenizer
except ImportError:
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
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"LocalVoiceService initialized. Compute device: {self.device}")

    # ═══════════════════════════════════════════
    #  STT: Whisper Tiny
    # ═══════════════════════════════════════════
    
    def _get_stt_model(self):
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
            logger.info(f"🎤 Local STT: processing {audio_file_path}")
            
            # Whisper handles multi-lingual detection automatically, but we can hint the language
            # Faster-whisper uses 2-letter codes.
            whisper_lang = language_code if language_code in ['en', 'hi', 'te', 'kn', 'ur'] else None
            
            segments, info = model.transcribe(audio_file_path, beam_size=5, language=whisper_lang)
            
            transcript = ""
            for segment in segments:
                transcript += segment.text + " "
                
            transcript = transcript.strip()
            logger.info(f"✅ Local STT Result: '{transcript}'")
            
            return {
                'transcript': transcript,
                'language_code': info.language
            }
            
        except Exception as e:
            logger.error(f"❌ Local STT exception: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    # ═══════════════════════════════════════════
    #  TTS: Facebook MMS
    # ═══════════════════════════════════════════

    def _get_tts_model(self, mms_code: str):
        """Lazy load the TTS model for a specific language."""
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
            mms_code = MMS_LANG_MAP.get(language_code, 'eng')
            
            model, tokenizer = self._get_tts_model(mms_code)
            if not model:
                return None

            logger.info(f"🔊 Local TTS: '{text[:60]}...' lang={mms_code}")
            
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
                f"local_tts_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.wav"
            )
            
            # Write to .wav using soundfile
            sf.write(audio_path, audio_data, sample_rate)
            
            logger.info(f"✅ Local TTS saved: {audio_path}")
            return audio_path

        except Exception as e:
            logger.error(f"❌ Local TTS exception: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
