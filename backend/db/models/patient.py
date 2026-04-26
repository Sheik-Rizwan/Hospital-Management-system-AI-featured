# db/models/patient.py — Patient profile extension

import uuid
from sqlalchemy import Column, String, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base


class PatientProfile(Base):
    __tablename__ = 'patient_profiles'

    user_id           = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    patient_id        = Column(String(20), unique=True, nullable=False, index=True)
    date_of_birth     = Column(Date, nullable=True)
    gender            = Column(String(10), nullable=True)
    blood_group       = Column(String(5), nullable=True)
    insurance_id      = Column(String(50), nullable=True)
    emergency_contact = Column(String(20), nullable=True)
    bed_number        = Column(String(20), nullable=True)

    user = relationship('User', back_populates='patient_profile')

    # Future relationships
    # appointments = relationship('Appointment', back_populates='patient')
    # invoices     = relationship('Invoice', back_populates='patient')

    def to_dict(self) -> dict:
        return {
            'patient_id': self.patient_id,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else '',
            'gender': self.gender or '',
            'blood_group': self.blood_group or '',
            'insurance_id': self.insurance_id or '',
            'emergency_contact': self.emergency_contact or '',
            'bed_number': self.bed_number or '',
        }
