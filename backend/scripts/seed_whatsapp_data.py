# scripts/seed_whatsapp_data.py — Seed Services & Holidays for WhatsApp Booking
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from datetime import datetime
from mongodb_config import MongoDatabase

def seed():
    db = MongoDatabase().db

    # ── Services ──
    services = [
        {"service_id": "SVC-001", "service_name": "General Consultation", "duration_minutes": 30},
        {"service_id": "SVC-002", "service_name": "Cardiology", "duration_minutes": 30},
        {"service_id": "SVC-003", "service_name": "Dermatology", "duration_minutes": 30},
        {"service_id": "SVC-004", "service_name": "Orthopedics", "duration_minutes": 30},
        {"service_id": "SVC-005", "service_name": "Pediatrics", "duration_minutes": 30},
    ]

    db.services.delete_many({})
    db.services.insert_many(services)
    print(f" Seeded {len(services)} services")

    # ── Holidays 2026 ──
    holidays = [
        {"date": "2026-01-26", "reason": "Republic Day"},
        {"date": "2026-03-17", "reason": "Holi"},
        {"date": "2026-04-02", "reason": "Ram Navami"},
        {"date": "2026-04-14", "reason": "Dr. Ambedkar Jayanti"},
        {"date": "2026-05-01", "reason": "May Day"},
        {"date": "2026-08-15", "reason": "Independence Day"},
        {"date": "2026-10-02", "reason": "Gandhi Jayanti"},
        {"date": "2026-10-20", "reason": "Dussehra"},
        {"date": "2026-11-09", "reason": "Diwali"},
        {"date": "2026-12-25", "reason": "Christmas"},
    ]

    db.holidays.delete_many({})
    db.holidays.insert_many(holidays)
    print(f" Seeded {len(holidays)} holidays")

    # ── Link existing doctors to services (if any exist) ──
    doctors = list(db.doctors.find({'is_active': True}))
    for doc in doctors:
        spec = doc.get('specialization', 'General Consultation')
        # Find matching service
        svc = db.services.find_one({'service_name': spec})
        if svc:
            db.doctors.update_one(
                {'user_id': doc['user_id']},
                {'$set': {'service_id': svc['service_id']}}
            )
            print(f"   Linked Dr. {doc.get('full_name')}  {svc['service_name']}")
        else:
            # Default to General Consultation
            db.doctors.update_one(
                {'user_id': doc['user_id']},
                {'$set': {'service_id': 'SVC-001'}}
            )
            print(f"   Linked Dr. {doc.get('full_name')}  General Consultation (default)")

    print("\n Seeding complete!")

if __name__ == "__main__":
    seed()
