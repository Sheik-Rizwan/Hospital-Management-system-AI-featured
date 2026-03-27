import sys
import os

# Add parent directory to path to import backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mongodb_config import MongoDatabase
from models.user_models import User
from bson import ObjectId

class DBUtils:
    def __init__(self):
        self.db_handler = MongoDatabase()
        self.db = self.db_handler.db

    def debug_user_login(self, identifier, password=None):
        """Debugs login issues for a user (Patient, Nurse, Doctor, Admin, Vendor)"""
        print(f"\n--- Debugging Login for '{identifier}' ---")
        
        # Check all user collections
        collections = {
            'patients': self.db.patients,
            'nurses': self.db.nurses,
            'doctors': self.db.doctors,
            'admins': self.db.admins,
            'vendors': self.db.vendors
        }
        
        found = False
        for role, col in collections.items():
            query = {'$or': [{'user_id': identifier}, {'email': identifier}]}
            if role == 'patients':
                query['$or'].append({'patient_id': identifier})
                
            user = col.find_one(query)
            if user:
                print(f" Found user in '{role}' collection.")
                print(f"   User ID: {user.get('user_id')}")
                print(f"   Email: {user.get('email')}")
                if role == 'patients':
                    print(f"   Patient ID: {user.get('patient_id')}")
                
                if password:
                    self._check_password(user, password)
                found = True
                break
        
        if not found:
            print(" User NOT FOUND in any active collection.")
            # Check legacy
            if 'users' in self.db.list_collection_names():
                legacy = self.db.users.find_one({'$or': [{'user_id': identifier}, {'email': identifier}]})
                if legacy:
                    print(f"️ User found in LEGACY 'users' collection. Migration might be needed.")

    def _check_password(self, user_doc, password):
        stored_hash = user_doc.get('password')
        if not stored_hash:
            print(" User has no password field!")
            return

        try:
            is_valid = User.check_password(stored_hash, password)
            if is_valid:
                print(" Password validation SUCCESSFUL")
            else:
                print(" Password validation FAILED (Hash mismatch)")
        except ValueError as e:
            print(f" Password validation ERROR: {e}")
            print("️ Stored password might be corrupted/plaintext.")

    def fix_user_password(self, identifier, new_password):
        """Fixes/Resets password for a user"""
        print(f"\n--- Fixing Password for '{identifier}' ---")
        new_hash = User.hash_password(new_password)
        
        updated = False
        # Try all active collections
        for colName in ['patients', 'nurses', 'doctors', 'admins', 'vendors']:
            col = self.db[colName]
            query = {'$or': [{'user_id': identifier}, {'email': identifier}]}
            if colName == 'patients':
                query['$or'].append({'patient_id': identifier})
                
            result = col.update_one(query, {'$set': {'password': new_hash}})
            if result.matched_count > 0:
                print(f" Updated password in '{colName}' collection.")
                updated = True
        
        if not updated:
            print(" User not found.")

    def list_active_collections(self):
        """Lists all collections currently in the database"""
        print("\n--- Active Database Collections ---")
        cols = self.db.list_collection_names()
        for c in sorted(cols):
            count = self.db[c].count_documents({})
            print(f"- {c} ({count} docs)")

if __name__ == "__main__":
    utils = DBUtils()
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "login" and len(sys.argv) >= 3:
            utils.debug_user_login(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        elif cmd == "fix_password" and len(sys.argv) >= 4:
            utils.fix_user_password(sys.argv[2], sys.argv[3])
        elif cmd == "list":
            utils.list_active_collections()
        else:
            print("Usage:")
            print("  python db_utils.py login <identifier> [password]")
            print("  python db_utils.py fix_password <identifier> <new_password>")
            print("  python db_utils.py list")
    else:
        utils.list_active_collections()
