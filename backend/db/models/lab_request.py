# db/models/lab_request.py — Lab test requests and results

import uuid
from sqlalchemy import Column, String, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from db.base import Base, TimestampMixin


class LabRequest(Base, TimestampMixin):
    __tablename__ = 'lab_requests'

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id    = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    doctor_id     = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    test_name     = Column(String(200), nullable=False)
    test_category = Column(String(100), nullable=True)
    urgency       = Column(String(20), default='normal')   # normal, urgent, stat
    status        = Column(String(30), default='pending', index=True)  # pending, in_progress, completed
    notes         = Column(Text, nullable=True)

    # Result fields (filled by lab technician)
    result_text     = Column(Text, nullable=True)
    result_file_url = Column(String(500), nullable=True)
    completed_by    = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    completed_at    = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'doctor_id': str(self.doctor_id),
            'test_name': self.test_name,
            'test_category': self.test_category or '',
            'urgency': self.urgency,
            'status': self.status,
            'notes': self.notes or '',
            'result_text': self.result_text or '',
            'result_file_url': self.result_file_url or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }
