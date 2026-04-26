# core/database/mongo_helpers.py — Safe index creation utilities for MongoDB
# Extracted from mongodb_config.py — no business logic, pure infrastructure.

import logging
from pymongo.errors import OperationFailure

logger = logging.getLogger(__name__)


def get_index_name(keys, kwargs):
    """Derive the auto-generated index name MongoDB would use."""
    name = kwargs.get('name')
    if name:
        return name
    if isinstance(keys, str):
        return f"{keys}_1"
    if isinstance(keys, list):
        return "_".join(f"{k}_{v}" for k, v in keys)
    return None


def unset_null_field(collection, field):
    """
    Convert documents where `field` is explicitly null → field is absent.
    Sparse unique indexes skip *missing* fields but NOT null ones, so this is
    required before building a sparse unique index on optional fields like email.
    """
    result = collection.update_many(
        {field: None},
        {"$unset": {field: ""}}
    )
    if result.modified_count:
        logger.info(f"Unset {result.modified_count} null '{field}' value(s) in "
              f"'{collection.name}' so unique sparse index can be created.")


def safe_create_index(collection, keys, **kwargs):
    """
    Create a MongoDB index safely, automatically fixing two common errors:

    • code 86 → IndexKeySpecsConflict — an index with the same name exists but
      with different options (e.g. was created without unique=True).
      Fix: drop the stale index and recreate it with the correct options.

    • code 11000 / DuplicateKey — duplicate values block a unique index build.
      Most common cause: optional fields stored as null instead of being absent.
      For sparse unique indexes on a single field, nulls are unset first so the
      index builds cleanly.  If non-null duplicates exist a warning is printed
      but the app still starts (index created without unique constraint).
    """
    from pymongo.errors import DuplicateKeyError as _DKE

    is_sparse_unique = kwargs.get('unique') and kwargs.get('sparse') and isinstance(keys, str)

    # Pre-emptively unset null values before building sparse unique indexes.
    if is_sparse_unique:
        unset_null_field(collection, keys)

    def _try_create():
        collection.create_index(keys, **kwargs)

    try:
        _try_create()

    except OperationFailure as e:
        index_name = get_index_name(keys, kwargs)

        # ── Case 1: conflicting index options ──
        if e.code == 86:
            try:
                collection.drop_index(index_name)
                logger.warning(f"  Dropped conflicting index '{index_name}' on "
                      f"'{collection.name}' — recreating with updated options...")
                try:
                    _try_create()
                    logger.info(f" Index '{index_name}' recreated on '{collection.name}'")
                except _DKE:
                    fallback = {k: v for k, v in kwargs.items() if k != 'unique'}
                    collection.create_index(keys, **fallback)
                    logger.warning(f"  Index '{index_name}' on '{collection.name}' created "
                          f"WITHOUT unique — non-null duplicates exist. Fix them to "
                          f"enforce uniqueness.")
            except Exception as drop_err:
                logger.error(f" Failed to recreate index '{index_name}' "
                      f"on '{collection.name}': {drop_err}")
                raise

        # ── Case 2: duplicate data still blocks unique index ──
        elif e.code == 11000 or isinstance(e, _DKE):
            fallback = {k: v for k, v in kwargs.items() if k != 'unique'}
            try:
                collection.create_index(keys, **fallback)
            except Exception:
                pass
            logger.warning(f"  Could not create UNIQUE index '{index_name}' on "
                  f"'{collection.name}' — non-null duplicate values exist. "
                  f"App will start without uniqueness enforcement on this field.")

        else:
            raise
