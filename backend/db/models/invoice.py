# db/models/invoice.py — Billing invoices and payments

import uuid
from sqlalchemy import Column, String, Float, Text, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from db.base import Base, TimestampMixin


class Invoice(Base, TimestampMixin):
    __tablename__ = 'invoices'

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id     = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    created_by     = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    invoice_number = Column(String(30), unique=True, nullable=False, index=True)
    service_code   = Column(String(50), nullable=True)
    description    = Column(Text, nullable=True)
    amount         = Column(Float, nullable=False, default=0.0)
    tax            = Column(Float, default=0.0)
    total          = Column(Float, nullable=False, default=0.0)
    status         = Column(String(30), default='unpaid', index=True)  # unpaid, paid, partial, cancelled
    due_date       = Column(Date, nullable=True)
    insurance_claim_id = Column(String(50), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'invoice_number': self.invoice_number,
            'service_code': self.service_code or '',
            'description': self.description or '',
            'amount': self.amount,
            'tax': self.tax,
            'total': self.total,
            'status': self.status,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Payment(Base, TimestampMixin):
    __tablename__ = 'payments'

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey('invoices.id'), nullable=False, index=True)
    amount     = Column(Float, nullable=False)
    method     = Column(String(50), nullable=True)  # cash, card, insurance, upi
    reference  = Column(String(100), nullable=True)
    notes      = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'invoice_id': str(self.invoice_id),
            'amount': self.amount,
            'method': self.method or '',
            'reference': self.reference or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
