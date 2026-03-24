import logging
import re

logger = logging.getLogger(__name__)

def post_process_stt(transcript: str, language_code: str = 'en') -> str:
    """
    Clean up or post-process speech-to-text transcripts.
    Removes common hallucinated noises or normalizes based on language.
    """
    if not transcript:
        return ""
        
    text = transcript.strip()
    
    # Remove common STT hallucinations (e.g. from Whisper on silence)
    hallucinations = [
        r"^\s*\[silence\]\s*$",
        r"^\s*\[.*\]\s*$",
        r"^\s*\(.*\)\s*$"
    ]
    
    for pattern in hallucinations:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        
    return text.strip()
