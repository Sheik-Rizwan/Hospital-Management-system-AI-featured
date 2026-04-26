# db/utils/pagination.py — Pagination helper for list queries

from dataclasses import dataclass
from typing import List, Any
from sqlalchemy.orm import Query


@dataclass
class PaginatedResult:
    items: List[Any]
    total: int
    page: int
    per_page: int
    pages: int

    def to_dict(self) -> dict:
        return {
            'items': [item.to_dict() if hasattr(item, 'to_dict') else item for item in self.items],
            'total': self.total,
            'page': self.page,
            'per_page': self.per_page,
            'pages': self.pages,
        }


def paginate(query: Query, page: int = 1, per_page: int = 20) -> PaginatedResult:
    """Apply pagination to a SQLAlchemy query."""
    page = max(1, page)
    per_page = min(max(1, per_page), 100)

    total = query.count()
    pages = (total + per_page - 1) // per_page
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return PaginatedResult(items=items, total=total, page=page, per_page=per_page, pages=pages)
