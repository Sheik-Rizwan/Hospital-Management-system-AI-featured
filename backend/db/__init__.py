# db/__init__.py — Database engine, session factory, and initialization

import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from db.config import get_database_url, get_engine_options
from db.base import Base

logger = logging.getLogger(__name__)

# Module-level singletons (initialized on first call)
_engine = None
_SessionLocal = None


def get_engine():
    """Create or return the singleton SQLAlchemy engine."""
    global _engine
    if _engine is None:
        url = get_database_url()
        opts = get_engine_options()
        _engine = create_engine(url, **opts)
        logger.info(f"PostgreSQL engine created — {url.split('@')[-1] if '@' in url else url}")
    return _engine


def get_session_factory() -> sessionmaker:
    """Return the session factory (creates one if needed)."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)
    return _SessionLocal


def get_db() -> Session:
    """Yield a database session for request-scoped usage (Flask)."""
    factory = get_session_factory()
    session = factory()
    try:
        yield session
    finally:
        session.close()


def init_db():
    """Create all tables from registered models. Call once at startup."""
    # Import all models so Base.metadata knows about them
    import db.models  # noqa: F401
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    logger.info("PostgreSQL tables created/verified")
