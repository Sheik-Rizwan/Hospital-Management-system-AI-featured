# db/seeds/seed_admin.py — Create default system admin account

import logging
from sqlalchemy.orm import Session
from db.models.user import User
from db.models.role import Role

logger = logging.getLogger(__name__)

DEFAULT_ADMIN = {
    'email': 'admin@hospital.com',
    'password': 'admin123',
    'full_name': 'System Administrator',
    'phone': '',
}


def seed_default_admin(session: Session):
    """Create the default system admin if none exists. Safe to run multiple times."""
    role = session.query(Role).filter(Role.key == 'system_admin').first()
    if not role:
        logger.warning("Cannot seed admin — 'system_admin' role not found. Run seed_roles first.")
        return

    existing = session.query(User).filter(User.email == DEFAULT_ADMIN['email']).first()
    if existing:
        logger.info("Default admin already exists — skipping")
        return

    admin = User(
        email=DEFAULT_ADMIN['email'],
        full_name=DEFAULT_ADMIN['full_name'],
        phone=DEFAULT_ADMIN['phone'],
        role_id=role.id,
    )
    admin.set_password(DEFAULT_ADMIN['password'])
    session.add(admin)
    session.commit()
    logger.info(f"Default system admin created: {DEFAULT_ADMIN['email']}")
