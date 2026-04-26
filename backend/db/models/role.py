# db/models/role.py — Role, Permission, and RolePermission models

from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, Table
from sqlalchemy.orm import relationship
from db.base import Base, TimestampMixin


# Association table (many-to-many)
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True),
)


class Role(Base, TimestampMixin):
    __tablename__ = 'roles'

    id       = Column(Integer, primary_key=True, autoincrement=True)
    key      = Column(String(50), unique=True, nullable=False, index=True)   # 'doctor', 'nurse', etc.
    display  = Column(String(100), nullable=False)                            # 'Doctor'
    category = Column(String(50), nullable=False)                             # 'clinical', 'admin', ...
    is_active = Column(Boolean, default=True, nullable=False)

    permissions = relationship('Permission', secondary=role_permissions, back_populates='roles', lazy='selectin')
    users       = relationship('User', back_populates='role_rel', lazy='dynamic')

    def __repr__(self):
        return f"<Role {self.key}>"

    def has_permission(self, perm_key: str) -> bool:
        """Check if this role has a specific permission (supports wildcards)."""
        for p in self.permissions:
            if p.key == perm_key:
                return True
            # Wildcard: 'patient.*' matches 'patient.read'
            if p.key.endswith('.*'):
                prefix = p.key[:-2]
                if perm_key.startswith(prefix):
                    return True
        return False


class Permission(Base):
    __tablename__ = 'permissions'

    id          = Column(Integer, primary_key=True, autoincrement=True)
    key         = Column(String(100), unique=True, nullable=False, index=True)  # 'patient.read'
    description = Column(Text, nullable=True)

    roles = relationship('Role', secondary=role_permissions, back_populates='permissions', lazy='selectin')

    def __repr__(self):
        return f"<Permission {self.key}>"
