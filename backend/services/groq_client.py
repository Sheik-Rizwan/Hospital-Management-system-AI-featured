# groq_client.py

from groq import Groq
from config.settings import GROQ_API_KEY

_client = None

def get_client():
    """Get or create a singleton Groq client instance."""
    global _client
    if _client is None:
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not set. Please set it in config.py")
        _client = Groq(api_key=GROQ_API_KEY)
    return _client
