# db/models/staff_profile.py — Generic profile for lab_technician, pharmacist, front_desk, hospital_manager

from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.base import Base


class StaffProfile(Base):
    """Shared extension for roles that have similar fields:
    hospital_manager, lab_technician, pharmacist, front_desk."""
    __tablename__ = 'staff_profiles'

    user_id        = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    employee_id    = Column(String(50), unique=True, nullable=True)
    department     = Column(String(100), nullable=True)
    certification  = Column(String(100), nullable=True)
    license_number = Column(String(50), nullable=True)
    desk_location  = Column(String(100), nullable=True)

    user = relationship('User', back_populates='staff_profile')

    def to_dict(self) -> dict:
        return {
            'employee_id': self.employee_id or '',
            'department': self.department or '',
            'certification': self.certification or '',
            'license_number': self.license_number or '',
            'desk_location': self.desk_location or '',
        }
