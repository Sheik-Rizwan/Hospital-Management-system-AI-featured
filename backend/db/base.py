# db/base.py — SQLAlchemy declarative base with common mixins

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Boolean
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


class TimestampMixin:
    """Adds created_at / updated_at to any model."""
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class SoftDeleteMixin:
    """Adds is_active flag for soft deletion."""
    is_active = Column(Boolean, default=True, nullable=False)
