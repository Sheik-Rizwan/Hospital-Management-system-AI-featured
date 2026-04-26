# core/utils/serializers.py — JSON serialization helpers for MongoDB documents
# Handles datetime and ObjectId conversion that is needed across all modules.

from datetime import datetime
from bson import ObjectId


def serialize_doc(doc: dict) -> dict:
    """Convert a MongoDB document to JSON-safe dict.
    - ObjectId → str
    - datetime → ISO string
    """
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = serialize_doc(value)
        elif isinstance(value, list):
            result[key] = [serialize_doc(v) if isinstance(v, dict) else
                           v.isoformat() if isinstance(v, datetime) else
                           str(v) if isinstance(v, ObjectId) else v
                           for v in value]
        else:
            result[key] = value
    return result


def serialize_datetime(obj):
    """Convert datetime to ISO string if it has isoformat, otherwise return as-is."""
    if obj and hasattr(obj, 'isoformat'):
        return obj.isoformat()
    return obj
