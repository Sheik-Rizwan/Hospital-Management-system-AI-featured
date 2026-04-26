# db/models/prescription.py — Doctor prescriptions

import uuid
from sqlalchemy import Column, String, Integer, Text, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from db.base import Base, TimestampMixin


class Prescription(Base, TimestampMixin):
    __tablename__ = 'prescriptions'

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id  = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    doctor_id   = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    medication  = Column(String(200), nullable=False)
    dosage      = Column(String(100), nullable=True)
    frequency   = Column(String(100), nullable=True)
    duration    = Column(String(100), nullable=True)
    quantity    = Column(Integer, nullable=True)
    notes       = Column(Text, nullable=True)
    status      = Column(String(30), default='active', index=True)  # active, dispensed, cancelled
    dispensed_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    dispensed_at = Column(Date, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'doctor_id': str(self.doctor_id),
            'medication': self.medication,
            'dosage': self.dosage or '',
            'frequency': self.frequency or '',
            'duration': self.duration or '',
            'quantity': self.quantity,
            'notes': self.notes or '',
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
