# db/models/nurse_profile.py — Nurse-specific extension fields

from sqlalchemy import Column, String, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base


class NurseProfile(Base):
    __tablename__ = 'nurse_profiles'

    user_id          = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    employee_id      = Column(String(50), unique=True, nullable=True)
    department       = Column(String(100), nullable=True)
    shift            = Column(String(20), default='Day')
    is_available     = Column(Boolean, default=True)
    current_workload = Column(Integer, default=0)

    user = relationship('User', back_populates='nurse_profile')

    def to_dict(self) -> dict:
        return {
            'employee_id': self.employee_id or '',
            'department': self.department or '',
            'shift': self.shift or 'Day',
            'is_available': self.is_available,
            'current_workload': self.current_workload,
        }
