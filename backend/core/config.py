# core/config.py — Centralized Application Configuration
# All secrets loaded from environment variables — no hardcoded values.
# Usage: from core.config import Config

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Centralized configuration — reads from environment variables only."""

    # ── Flask ──
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    FLASK_SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'change-me-in-production')

    # ── JWT ──
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'change-me-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 86400))

    # ── MongoDB ──
    MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017/')

    # ── PostgreSQL ──
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/hospital_db')

    # ── Groq AI ──
    GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
    GROQ_MODEL = os.getenv('GROQ_MODEL', 'llama-3.3-70b-versatile')
    GENERATION_CONFIG = {
        'temperature': 0.2,
        'max_tokens': 8192,
        'top_p': 0.95,
    }

    # ── Sarvam AI (Voice & Translation) ──
    SARVAM_API_KEY = os.getenv('SARVAM_API_KEY', '')
    SARVAM_BASE_URL = os.getenv('SARVAM_BASE_URL', 'https://api.sarvam.ai')
    SARVAM_MODEL = os.getenv('SARVAM_MODEL', 'sarvam-30b')
    SARVAM_SUPPORTED_LANGUAGES = {
        'te': {'name': 'Telugu', 'tts_code': 'te-IN', 'display': 'తెలుగు'},
        'hi': {'name': 'Hindi', 'tts_code': 'hi-IN', 'display': 'हिन्दी'},
        'kn': {'name': 'Kannada', 'tts_code': 'kn-IN', 'display': 'ಕನ್ನಡ'},
        'ta': {'name': 'Tamil', 'tts_code': 'ta-IN', 'display': 'தமிழ்'},
        'en': {'name': 'English', 'tts_code': 'en-IN', 'display': 'English'},
    }
    SARVAM_DEFAULT_LANGUAGE = 'en'

    # ── WhatsApp Cloud API ──
    WHATSAPP_TOKEN = os.getenv('WHATSAPP_TOKEN', '')
    PHONE_NUMBER_ID = os.getenv('PHONE_NUMBER_ID', '')
    VERIFY_TOKEN = os.getenv('VERIFY_TOKEN', 'my_verify_token')

    # ── Email ──
    GMAIL_SENDER_EMAIL = os.getenv('GMAIL_SENDER_EMAIL', '')
    GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD', '')
    HOSPITAL_NAME = os.getenv('HOSPITAL_NAME', 'Hospital Management System')

    # ── Upload ──
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

    @classmethod
    def sarvam_url(cls, endpoint: str) -> str:
        """Build a Sarvam API URL: Config.sarvam_url('speech-to-text')"""
        return f'{cls.SARVAM_BASE_URL}/{endpoint}'
