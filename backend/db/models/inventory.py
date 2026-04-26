# db/models/inventory.py — Medication and supply inventory

import uuid
from sqlalchemy import Column, String, Integer, Float, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from db.base import Base, TimestampMixin


class InventoryItem(Base, TimestampMixin):
    __tablename__ = 'inventory_items'

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name           = Column(String(200), nullable=False, index=True)
    category       = Column(String(100), nullable=True, index=True)
    sku            = Column(String(50), unique=True, nullable=True)
    quantity       = Column(Integer, default=0, nullable=False)
    unit           = Column(String(30), nullable=True)       # tablet, ml, piece
    unit_price     = Column(Float, default=0.0)
    reorder_level  = Column(Integer, default=10)
    supplier       = Column(String(200), nullable=True)
    description    = Column(Text, nullable=True)
    expiry_date    = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'name': self.name,
            'category': self.category or '',
            'sku': self.sku or '',
            'quantity': self.quantity,
            'unit': self.unit or '',
            'unit_price': self.unit_price,
            'reorder_level': self.reorder_level,
            'supplier': self.supplier or '',
            'description': self.description or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
