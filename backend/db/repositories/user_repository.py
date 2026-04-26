# db/repositories/user_repository.py — User-specific queries

from typing import Optional
from sqlalchemy.orm import Session

from db.models.user import User
from db.models.role import Role
from db.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """User-specific data access methods."""

    def __init__(self, session: Session):
        super().__init__(session, User)

    def get_by_email(self, email: str) -> Optional[User]:
        return (
            self.session.query(User)
            .filter(User.email == email.lower())
            .first()
        )

    def get_by_role(self, role_key: str, active_only: bool = True):
        q = (
            self.session.query(User)
            .join(Role)
            .filter(Role.key == role_key)
        )
        if active_only:
            q = q.filter(User.is_active == True)
        return q.all()

    def authenticate(self, email: str, password: str) -> Optional[User]:
        """Validate credentials. Returns User if valid, None otherwise."""
        user = self.get_by_email(email)
        if not user:
            return None
        if not user.is_active:
            return None
        if not user.check_password(password):
            return None
        return user

    def create_user(self, role_key: str, password: str, **kwargs) -> User:
        """Create a user with the given role. Hashes password automatically."""
        role = self.session.query(Role).filter(Role.key == role_key).first()
        if not role:
            raise ValueError(f"Unknown role: {role_key}")

        user = User(role_id=role.id, **kwargs)
        user.set_password(password)

        if kwargs.get('email'):
            user.email = kwargs['email'].lower()

        self.session.add(user)
        self.session.flush()
        return user

    def get_system_stats(self) -> dict:
        """Get user counts by role for admin dashboard."""
        stats = {}
        roles = self.session.query(Role).all()
        for role in roles:
            count = (
                self.session.query(User)
                .filter(User.role_id == role.id, User.is_active == True)
                .count()
            )
            stats[f'total_{role.key}s'] = count
        stats['total_users'] = self.session.query(User).filter(User.is_active == True).count()
        return stats
