# Database Module (`/db`)

## Structure

```
db/
├── __init__.py         # Engine, session factory, init_db()
├── base.py             # Declarative base, TimestampMixin, SoftDeleteMixin
├── config.py           # Env-based PostgreSQL URL (dev/staging/prod)
├── migrations/         # Alembic versioned migrations
├── schemas/            # Raw SQL reference (documentation)
├── models/             # SQLAlchemy ORM models (one per file)
├── repositories/       # Data access layer (generic CRUD + domain repos)
├── seeds/              # Idempotent seed scripts for roles, admin, etc.
└── utils/              # Pagination, filters, validators
```

## Quick Start

```python
# In app.py:
from db import init_db, get_session_factory

init_db()  # Creates all tables
```

## Adding a New Module

1. Create `db/models/your_entity.py` — define the SQLAlchemy model
2. Import it in `db/models/__init__.py`
3. Create `db/repositories/your_entity_repository.py` — extend BaseRepository
4. Run `alembic revision --autogenerate -m "add your_entity"`
5. Run `alembic upgrade head`

## Environment Config

Set `DATABASE_URL` in `.env`:
- Dev: `postgresql://postgres:postgres@localhost:5432/hospital_db`
- Staging: `postgresql://user:pass@staging-host:5432/hospital_staging`
- Prod: `postgresql://user:pass@prod-host:5432/hospital_prod`
