# db/config.py — Environment-based database configuration

import os
from dotenv import load_dotenv

load_dotenv()

ENV = os.getenv('FLASK_ENV', 'development')

# PostgreSQL connection URL — override via DATABASE_URL env var
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/hospital_db'
)

# Per-environment overrides
_ENV_URLS = {
    'development': os.getenv('DEV_DATABASE_URL', DATABASE_URL),
    'staging':     os.getenv('STAGING_DATABASE_URL', DATABASE_URL),
    'production':  os.getenv('PROD_DATABASE_URL', DATABASE_URL),
}


def get_database_url() -> str:
    """Return the database URL for the current environment."""
    return _ENV_URLS.get(ENV, DATABASE_URL)


# SQLAlchemy engine kwargs per environment
ENGINE_OPTIONS = {
    'development': {
        'echo': True,
        'pool_size': 5,
        'max_overflow': 10,
        'pool_pre_ping': True,
    },
    'staging': {
        'echo': False,
        'pool_size': 10,
        'max_overflow': 20,
        'pool_pre_ping': True,
    },
    'production': {
        'echo': False,
        'pool_size': 20,
        'max_overflow': 40,
        'pool_pre_ping': True,
        'pool_recycle': 3600,
    },
}


def get_engine_options() -> dict:
    """Return SQLAlchemy engine options for the current environment."""
    return ENGINE_OPTIONS.get(ENV, ENGINE_OPTIONS['development'])
