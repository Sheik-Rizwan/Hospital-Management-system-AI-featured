# core/auth/helpers.py — JWT helper functions
# Extracted from auth.py — get_current_user and PG credential validation.

import logging
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

logger = logging.getLogger(__name__)


def get_current_user():
    """Get current user information from JWT."""
    try:
        verify_jwt_in_request()
        claims = get_jwt()
        return {
            'user_id': get_jwt_identity(),
            'role': claims.get('role'),
            'email': claims.get('email', ''),
            'full_name': claims.get('full_name', ''),
            'patient_id': claims.get('patient_id', ''),
            'patient_name': claims.get('patient_name', ''),
            'specialization': claims.get('specialization', ''),
            'department': claims.get('department', ''),
            'permissions': claims.get('permissions', []),
        }
    except Exception:
        return None


def validate_credentials_pg(email: str, password: str, role_key: str = None):
    """Generic credential validation using PostgreSQL.
    Returns User ORM object if valid, None otherwise."""
    try:
        from db import get_session_factory
        from db.models.user import User as PgUser
        from db.models.role import Role

        session = get_session_factory()()
        try:
            q = session.query(PgUser).filter(PgUser.email == email.lower())
            if role_key:
                q = q.join(Role).filter(Role.key == role_key)
            user = q.first()
            if not user or not user.is_active or not user.check_password(password):
                return None
            return user
        finally:
            session.close()
    except Exception as e:
        logger.error(f"PostgreSQL auth error: {e}")
        return None
