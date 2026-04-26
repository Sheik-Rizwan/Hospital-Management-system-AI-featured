# db/repositories/base_repository.py — Generic CRUD for any SQLAlchemy model

from typing import TypeVar, Generic, Type, Optional, List
from sqlalchemy.orm import Session

from db.base import Base

T = TypeVar('T', bound=Base)


class BaseRepository(Generic[T]):
    """Generic repository providing CRUD operations for any model."""

    def __init__(self, session: Session, model: Type[T]):
        self.session = session
        self.model = model

    def get_by_id(self, id) -> Optional[T]:
        return self.session.get(self.model, id)

    def get_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        return (
            self.session.query(self.model)
            .limit(limit)
            .offset(offset)
            .all()
        )

    def create(self, **kwargs) -> T:
        instance = self.model(**kwargs)
        self.session.add(instance)
        self.session.flush()  # get ID without committing
        return instance

    def update(self, id, **kwargs) -> Optional[T]:
        instance = self.get_by_id(id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if hasattr(instance, key):
                setattr(instance, key, value)
        self.session.flush()
        return instance

    def delete(self, id) -> bool:
        instance = self.get_by_id(id)
        if not instance:
            return False
        self.session.delete(instance)
        self.session.flush()
        return True

    def soft_delete(self, id) -> bool:
        """Set is_active=False instead of hard delete."""
        instance = self.get_by_id(id)
        if not instance or not hasattr(instance, 'is_active'):
            return False
        instance.is_active = False
        self.session.flush()
        return True

    def count(self, **filters) -> int:
        q = self.session.query(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                q = q.filter(getattr(self.model, key) == value)
        return q.count()

    def find_by(self, **filters) -> List[T]:
        """Find all records matching the given field=value filters."""
        q = self.session.query(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                q = q.filter(getattr(self.model, key) == value)
        return q.all()

    def find_one(self, **filters) -> Optional[T]:
        """Find first record matching the given filters."""
        q = self.session.query(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                q = q.filter(getattr(self.model, key) == value)
        return q.first()
