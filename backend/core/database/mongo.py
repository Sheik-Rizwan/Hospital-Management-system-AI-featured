# core/database/mongo.py — MongoDB connection wrapper
# This is a thin re-export of the existing MongoDatabase class.
# Phase 1: We import from the original file to avoid duplicating 1500 lines.
# Phase 4 will move the business methods into module repositories.

from mongodb_config import MongoDatabase  # noqa: F401

__all__ = ['MongoDatabase']
