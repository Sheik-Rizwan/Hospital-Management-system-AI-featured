# db/models/doctor_profile.py — Doctor-specific extension fields

from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base


class DoctorProfile(Base):
    __tablename__ = 'doctor_profiles'

    user_id        = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    specialization = Column(String(100), nullable=True)
    license_number = Column(String(50), unique=True, nullable=True)
    department     = Column(String(100), nullable=True)

    user = relationship('User', back_populates='doctor_profile')

    def to_dict(self) -> dict:
        return {
            'specialization': self.specialization or '',
            'license_number': self.license_number or '',
            'department': self.department or '',
        }
