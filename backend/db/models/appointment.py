# db/models/appointment.py — Appointment scheduling

import uuid
from sqlalchemy import Column, String, Date, Time, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from db.base import Base, TimestampMixin, SoftDeleteMixin


class Appointment(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = 'appointments'

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id   = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    doctor_id    = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    service_name = Column(String(200), nullable=True)
    date         = Column(Date, nullable=False, index=True)
    start_time   = Column(Time, nullable=False)
    end_time     = Column(Time, nullable=True)
    status       = Column(String(30), default='pending', nullable=False, index=True)
    notes        = Column(Text, nullable=True)
    booked_for   = Column(String(50), default='self')
    created_by   = Column(String(50), default='portal')

    __table_args__ = (
        Index('ix_appt_doctor_date', 'doctor_id', 'date'),
    )

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'doctor_id': str(self.doctor_id),
            'service_name': self.service_name or '',
            'date': self.date.isoformat() if self.date else '',
            'start_time': self.start_time.isoformat() if self.start_time else '',
            'end_time': self.end_time.isoformat() if self.end_time else '',
            'status': self.status,
            'notes': self.notes or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
