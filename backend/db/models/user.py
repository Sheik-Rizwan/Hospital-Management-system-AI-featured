# db/models/user.py — Unified User model for all 9 roles

import uuid
import bcrypt
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base, TimestampMixin, SoftDeleteMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = 'users'

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email         = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name     = Column(String(255), nullable=False)
    phone         = Column(String(20), nullable=True)
    role_id       = Column(Integer, ForeignKey('roles.id'), nullable=False, index=True)

    # Relationships
    role_rel         = relationship('Role', back_populates='users', lazy='joined')
    doctor_profile   = relationship('DoctorProfile', back_populates='user', uselist=False, cascade='all, delete-orphan')
    nurse_profile    = relationship('NurseProfile', back_populates='user', uselist=False, cascade='all, delete-orphan')
    staff_profile    = relationship('StaffProfile', back_populates='user', uselist=False, cascade='all, delete-orphan')
    patient_profile  = relationship('PatientProfile', back_populates='user', uselist=False, cascade='all, delete-orphan')

    # ── Password helpers ──

    def set_password(self, password: str):
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    def check_password(self, password: str) -> bool:
        if not self.password_hash:
            return False
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    # ── Convenience ──

    @property
    def role_key(self) -> str:
        return self.role_rel.key if self.role_rel else ''

    @property
    def user_id(self) -> str:
        """String representation for JWT identity (backward compat)."""
        return str(self.id)

    def to_dict(self) -> dict:
        """Safe dict without password."""
        return {
            'user_id': str(self.id),
            'email': self.email or '',
            'full_name': self.full_name,
            'phone': self.phone or '',
            'role': self.role_key,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<User {self.full_name} ({self.role_key})>"
