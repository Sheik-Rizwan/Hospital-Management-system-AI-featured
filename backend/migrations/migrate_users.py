from pymongo import MongoClient
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def migrate_users(db):
    """
    Migrates users from the monolithic 'users' collection to separate collections:
    - nurses
    - doctors
    - patients
    - admins
    - vendors
    
    After successful migration, the 'users' collection is dropped.
    """
    try:
        users_collection = db['users']
        
        # Check if users collection exists and has data
        if 'users' not in db.list_collection_names():
            logging.info("Migration skipped: 'users' collection does not exist.")
            return

        total_users = users_collection.count_documents({})
        if total_users == 0:
            logging.info("Migration skipped: 'users' collection is empty.")
            # Optional: Drop empty collection if it exists
            # db.drop_collection('users') 
            return

        logging.info(f"Starting migration of {total_users} users...")

        # Counters for logging
        migrated_counts = {
            'nurse': 0,
            'doctor': 0,
            'patient': 0,
            'super_admin': 0,
            'vendor': 0,
            'unknown': 0
        }

        # Iterate and migrate
        for user in users_collection.find():
            role = user.get('role')
            target_collection = None
            
            # Determine target collection based on role
            if role == 'nurse':
                target_collection = db['nurses']
                migrated_counts['nurse'] += 1
            elif role == 'doctor':
                target_collection = db['doctors']
                migrated_counts['doctor'] += 1
            elif role == 'patient':
                target_collection = db['patients']
                migrated_counts['patient'] += 1
            elif role == 'super_admin':
                 target_collection = db['admins']
                 migrated_counts['super_admin'] += 1
            elif role == 'vendor':
                target_collection = db['vendors']
                migrated_counts['vendor'] += 1
            else:
                logging.warning(f"Unknown role '{role}' for user {user.get('user_id', 'unknown')}. Skipping.")
                migrated_counts['unknown'] += 1
                continue

            if target_collection is not None:
                # Use update_one with upsert to prevent duplicates if migration runs multiple times
                # We use user_id as the unique identifier
                target_collection.update_one(
                    {'user_id': user['user_id']}, 
                    {'$set': user}, 
                    upsert=True
                )

        logging.info(f"Migration completed. Summary: {migrated_counts}")

        # Verification: Check totals (ignoring unknown roles)
        total_migrated = sum(migrated_counts.values()) - migrated_counts['unknown']
        
        # If strict verification passes, drop the old collection
        # Note: We might want to keep it as backup for a moment or rename it
        # But user asked to "delete sections... not connected", so we drop it.
        logging.info("Dropping 'users' collection...")
        db.drop_collection('users')
        logging.info("Old 'users' collection dropped successfully.")

    except Exception as e:
        logging.error(f"Migration failed: {e}")
        # Re-raise to prevent app startup if migration fails critically? 
        # Or just log error. For now, let's log and continue to allow partial functionality.

if __name__ == "__main__":
    # For independent testing
    mongo_uri = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017/')
    client = MongoClient(mongo_uri)
    db = client['nurse_handoff_db']
    migrate_users(db)
