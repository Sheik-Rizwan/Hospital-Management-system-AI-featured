# db/models/vital_sign.py — Patient vital sign recordings

import uuid
from sqlalchemy import Column, String, Float, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from db.base import Base, TimestampMixin


class VitalSign(Base, TimestampMixin):
    __tablename__ = 'vital_signs'

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id       = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    recorded_by      = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    heart_rate       = Column(Float, nullable=True)
    blood_pressure_s = Column(Float, nullable=True)   # systolic
    blood_pressure_d = Column(Float, nullable=True)   # diastolic
    temperature      = Column(Float, nullable=True)
    oxygen_saturation = Column(Float, nullable=True)
    respiratory_rate = Column(Float, nullable=True)
    weight           = Column(Float, nullable=True)
    notes            = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'recorded_by': str(self.recorded_by),
            'heart_rate': self.heart_rate,
            'blood_pressure': f"{self.blood_pressure_s}/{self.blood_pressure_d}" if self.blood_pressure_s else None,
            'temperature': self.temperature,
            'oxygen_saturation': self.oxygen_saturation,
            'respiratory_rate': self.respiratory_rate,
            'weight': self.weight,
            'notes': self.notes or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
