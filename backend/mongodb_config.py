from pymongo import MongoClient
from pymongo.errors import OperationFailure
from datetime import datetime
from typing import Optional, List
import os
import logging
from bson import ObjectId

logger = logging.getLogger(__name__)


def _get_index_name(keys, kwargs):
    """Derive the auto-generated index name MongoDB would use."""
    name = kwargs.get('name')
    if name:
        return name
    if isinstance(keys, str):
        return f"{keys}_1"
    if isinstance(keys, list):
        return "_".join(f"{k}_{v}" for k, v in keys)
    return None


def _unset_null_field(collection, field):
    """
    Convert documents where `field` is explicitly null    field is absent.
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


def _safe_create_index(collection, keys, **kwargs):
    """
    Create a MongoDB index safely, automatically fixing two common errors:

    • code 86  IndexKeySpecsConflict — an index with the same name exists but
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
    # This is the safe, correct fix: null  absent, so sparse index skips them.
    if is_sparse_unique:
        _unset_null_field(collection, keys)

    def _try_create():
        collection.create_index(keys, **kwargs)

    try:
        _try_create()

    except OperationFailure as e:
        index_name = _get_index_name(keys, kwargs)

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

# Ensure DB auto-migration runs only once per process (not on every instantiation)
_migration_run = False

# Add MongoDB bin to PATH if not already present (so mongod/mongosh are accessible)
_mongo_bin = r"C:\Program Files\MongoDB\Server\8.2\bin"
if _mongo_bin not in os.environ.get('PATH', ''):
    os.environ['PATH'] = _mongo_bin + os.pathsep + os.environ.get('PATH', '')

# Singleton instance — all modules share one connection
_instance = None

class MongoDatabase:
    """MongoDB database handler for hospital system — Singleton connection."""

    def __new__(cls, connection_string: str = None):
        global _instance
        if _instance is None:
            _instance = super().__new__(cls)
        return _instance

    def __init__(self, connection_string: str = None):
        # Guard: only run once across all MongoDatabase() calls
        if getattr(self, '_initialized', False):
            return
        self._initialized = True

        if connection_string is None:
            connection_string = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017/')
        
        try:
            # TRY AUTO-START IF NEEDED
            import subprocess
            import time

            # 1. Try to connect with a short timeout
            try:
                temp_client = MongoClient(connection_string, serverSelectionTimeoutMS=2000)
                temp_client.admin.command('ping')
            except Exception:
                logger.warning("MongoDB not running. Attempting to start...")
                
                # 2. Locate mongod.exe
                mongod_path = r"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
                if os.path.exists(mongod_path):
                    db_path = os.path.join(os.getcwd(), "mongo-data")
                    if not os.path.exists(db_path):
                        os.makedirs(db_path)
                    
                    # 3. Start mongod (Hidden)
                    # CREATE_NO_WINDOW = 0x08000000
                    subprocess.Popen([mongod_path, "--dbpath", db_path, "--bind_ip", "127.0.0.1"],
                                     creationflags=0x08000000,
                                     stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL)
                    logger.info(f" Started MongoDB at {db_path} (Background)")
                    
                    # 4. Wait for it to initialize
                    for _ in range(10):
                        try:
                            temp_client = MongoClient(connection_string, serverSelectionTimeoutMS=1000)
                            temp_client.admin.command('ping')
                            logger.info("MongoDB auto-started successfully")
                            break
                        except:
                            time.sleep(1)
                else:
                    logger.error(f" Could not find mongod.exe at {mongod_path}")

            self.client = MongoClient(connection_string)

            # ─────────────────────────────────────────────────────────────
            #  TWO DATABASES
            #  healthcare_db    clinical / profile data (pre-existing)
            #  nurse_handoff_db  operational / procurement / chat data
            # ─────────────────────────────────────────────────────────────
            self.healthcare_db   = self.client['healthcare_db']
            self.db              = self.client['nurse_handoff_db']   # kept as self.db for backward-compat

            # ============ HEALTHCARE_DB — PROFILE / CLINICAL COLLECTIONS ============
            # These use the original collection names that already exist in healthcare_db

            # User profiles
            self.nurses   = self.healthcare_db['nurse_profiles']       # nurse_profiles
            self.doctors  = self.healthcare_db['doctor_profiles']      # doctor_profiles
            self.admins   = self.healthcare_db['admin_profiles']       # admin_profiles
            self.patients = self.healthcare_db['patient_details']      # patient_details

            # Clinical records
            self.handoffs              = self.healthcare_db['nurse_handoffs']       # nurse_handoffs
            self.care_plans            = self.healthcare_db['doctor_care_plans']    # doctor_care_plans
            self.doctor_assigned_tasks = self.healthcare_db['doctor_assigned_tasks']# doctor_assigned_tasks
            self.meals                 = self.healthcare_db['patient_meals']        # patient_meals
            self.task_events           = self.healthcare_db['task_audit_log']       # task_audit_log

            # ============ NURSE_HANDOFF_DB — OPERATIONAL COLLECTIONS ============
            # Tasks, scheduling, procurement, vendors, chat, WhatsApp live here

            # Task management
            self.tasks = self.db['tasks']

            # Appointment & scheduling
            self.appointments     = self.db['appointments']
            self.appointment_logs = self.db['appointment_logs']
            self.doctor_schedules = self.db['doctor_schedules']
            self.medical_assignments = self.db['medical_assignments']

            # Admin
            self.system_settings = self.db['system_settings']

            # Vendor & procurement
            self.vendors              = self.db['vendors']
            self.inventory            = self.db['inventory']
            self.purchase_requests    = self.db['purchase_requests']
            self.quotations           = self.db['quotations']
            self.department_budgets   = self.db['department_budgets']
            self.purchase_orders      = self.db['purchase_orders']
            self.inventory_transactions = self.db['inventory_transactions']

            # Chat / vendor communication
            self.vendor_requests = self.db['vendor_requests']
            self.chats           = self.db['chats']
            self.messages        = self.db['messages']

            # WhatsApp
            self.whatsapp_sessions = self.db['whatsapp_sessions']
            self.services          = self.db['services']    # hospital services for booking
            self.holidays          = self.db['holidays']    # holiday calendar
            self.wa_users          = self.db['wa_users']    # WhatsApp user state

            # ============ AUTOMATIC MIGRATION (runs only once per process) ============
            global _migration_run
            if not _migration_run:
                _migration_run = True
                try:
                    from migrations.migrate_users import migrate_users
                    logger.info("Checking for user data migration...")
                    migrate_users(self.db)
                except Exception as e:
                    logger.warning(f" Migration failed: {e}")

            # ============ CREATE INDEXES (via safe helper — auto-fixes conflicts) ============

            # ── healthcare_db indexes ──

            # Patients (patient_details)
            _safe_create_index(self.patients, 'patient_id', unique=True)
            _safe_create_index(self.patients, 'user_id', unique=True, sparse=True)
            _safe_create_index(self.patients, 'email', unique=True, sparse=True)

            # Nurses (nurse_profiles)
            _safe_create_index(self.nurses, 'user_id', unique=True)
            _safe_create_index(self.nurses, 'email', unique=True, sparse=True)
            _safe_create_index(self.nurses, 'employee_id', unique=True, sparse=True)

            # Handoffs (nurse_handoffs)
            _safe_create_index(self.handoffs, 'patient_id')
            _safe_create_index(self.handoffs, 'nurse_id')
            _safe_create_index(self.handoffs, 'timestamp')

            # Care plans (doctor_care_plans)
            _safe_create_index(self.care_plans, 'patient_id')
            _safe_create_index(self.care_plans, 'doctor_id')

            # Doctor assigned tasks (doctor_assigned_tasks)
            _safe_create_index(self.doctor_assigned_tasks, 'doctor_id')
            _safe_create_index(self.doctor_assigned_tasks, 'patient_id')
            _safe_create_index(self.doctor_assigned_tasks, 'status')

            # Task audit log (task_audit_log)
            _safe_create_index(self.task_events, 'task_id')

            # Doctors (doctor_profiles)
            _safe_create_index(self.doctors, 'user_id', unique=True)
            _safe_create_index(self.doctors, 'email', unique=True, sparse=True)
            _safe_create_index(self.doctors, 'license_number', unique=True, sparse=True)

            # Admins (admin_profiles)
            _safe_create_index(self.admins, 'user_id', unique=True)
            _safe_create_index(self.admins, 'email', unique=True, sparse=True)

            # Meals (patient_meals)
            _safe_create_index(self.meals, 'patient_id')
            _safe_create_index(self.meals, 'meal_id', unique=True, sparse=True)

            # ── nurse_handoff_db indexes ──

            # Tasks
            _safe_create_index(self.tasks, 'task_id', unique=True, sparse=True)
            _safe_create_index(self.tasks, 'assigned_nurse_id')
            _safe_create_index(self.tasks, 'patient_id')
            _safe_create_index(self.tasks, 'status')

            # Appointments
            _safe_create_index(self.appointments, 'patient_id')
            _safe_create_index(self.appointments, 'doctor_id')
            _safe_create_index(self.appointments, 'appointment_date')

            # Doctor schedules & medical assignments
            _safe_create_index(self.medical_assignments, 'doctor_id')
            _safe_create_index(self.medical_assignments, 'nurse_id')

            # Vendor indexes
            _safe_create_index(self.vendors, 'user_id', unique=True)
            _safe_create_index(self.vendors, 'email', unique=True, sparse=True)
            _safe_create_index(self.vendors, 'company_name')
            _safe_create_index(self.vendors, 'category')

            # Procurement indexes
            _safe_create_index(self.inventory, 'item_id', unique=True)
            _safe_create_index(self.inventory, 'category')
            _safe_create_index(self.inventory, 'name')
            _safe_create_index(self.purchase_requests, 'request_id', unique=True)
            _safe_create_index(self.purchase_requests, 'status')
            _safe_create_index(self.purchase_requests, 'requested_by')
            _safe_create_index(self.quotations, 'quotation_id', unique=True)
            _safe_create_index(self.quotations, 'request_id')
            _safe_create_index(self.quotations, 'vendor_id')
            _safe_create_index(self.department_budgets, 'budget_id', unique=True)
            _safe_create_index(self.department_budgets, 'department')
            _safe_create_index(self.purchase_orders, 'po_id', unique=True)
            _safe_create_index(self.purchase_orders, 'vendor_id')
            _safe_create_index(self.inventory_transactions, 'item_id')
            _safe_create_index(self.inventory_transactions, 'user_id')
            _safe_create_index(self.inventory_transactions, 'timestamp')

            # Chat indexes
            _safe_create_index(self.vendor_requests, 'request_id', unique=True)
            _safe_create_index(self.vendor_requests, 'vendor_id')
            _safe_create_index(self.vendor_requests, 'target_id')
            _safe_create_index(self.vendor_requests, 'status')
            _safe_create_index(self.chats, 'chat_id', unique=True)
            _safe_create_index(self.chats, [('participant_ids', 1)])
            _safe_create_index(self.messages, 'chat_id')
            _safe_create_index(self.messages, 'timestamp')

            # WhatsApp indexes
            _safe_create_index(self.whatsapp_sessions, 'sender_id', unique=True)
            _safe_create_index(self.whatsapp_sessions, 'updated_at', expireAfterSeconds=1800)  # 30 min TTL
            _safe_create_index(self.services, 'service_id', unique=True, sparse=True)
            _safe_create_index(self.holidays, 'date', unique=True, sparse=True)
            _safe_create_index(self.wa_users, 'phone_number', unique=True, sparse=True)

            # Parse connection details for logging
            from urllib.parse import urlparse
            parsed_uri = urlparse(connection_string)
            masked_uri = connection_string.replace(parsed_uri.password, '****') if parsed_uri.password else connection_string
            
            logger.info(f" MongoDB connected successfully")
            logger.info(f" Connection URI: {masked_uri}")
            logger.info(f" Host: {parsed_uri.hostname}")
            logger.info(f" Port: {parsed_uri.port or 27017}")
            logger.info(f" DB (clinical/profiles) : healthcare_db   ({len(self.healthcare_db.list_collection_names())} collections)")
            logger.info(f" DB (operational)        : nurse_handoff_db ({len(self.db.list_collection_names())} collections)")
        except Exception as e:
            logger.error(f" MongoDB connection failed: {e}")
            raise

    # ============ USER MANAGEMENT ============
    
    def create_nurse(self, nurse_data: dict) -> str:
        """Create a new nurse"""
        try:
            result = self.nurses.insert_one(nurse_data)
            logger.info(f" Nurse {nurse_data['user_id']} created")
            return nurse_data['user_id']
        except Exception as e:
            logger.error(f" Error creating nurse: {e}")
            raise

    def create_doctor(self, doctor_data: dict) -> str:
        """Create a new doctor"""
        try:
            result = self.doctors.insert_one(doctor_data)
            logger.info(f" Doctor {doctor_data['user_id']} created")
            return doctor_data['user_id']
        except Exception as e:
            logger.error(f" Error creating doctor: {e}")
            raise

    def create_admin(self, admin_data: dict) -> str:
        """Create a new admin"""
        try:
            result = self.admins.insert_one(admin_data)
            logger.info(f" Admin {admin_data['user_id']} created")
            return admin_data['user_id']
        except Exception as e:
            logger.error(f" Error creating admin: {e}")
            raise

    def create_vendor(self, vendor_data: dict) -> str:
        """Create a new vendor"""
        try:
            result = self.vendors.insert_one(vendor_data)
            logger.info(f" Vendor {vendor_data['user_id']} created")
            return vendor_data['user_id']
        except Exception as e:
            logger.error(f" Error creating vendor: {e}")
            raise

    def create_user(self, user_data: dict) -> str:
        """Create a user in the appropriate collection based on role.
        Routes to nurses/doctors/admins/vendors/patients collection automatically."""
        role = user_data.get('role', '')
        if role == 'nurse':
            return self.create_nurse(user_data)
        elif role == 'doctor':
            return self.create_doctor(user_data)
        elif role == 'super_admin':
            return self.create_admin(user_data)
        elif role == 'vendor':
            return self.create_vendor(user_data)
        elif role == 'patient':
            return self.add_patient(user_data)
        else:
            raise ValueError(f"Unknown role: {role}")

    def get_user_by_email(self, email: str) -> Optional[dict]:
        """Get user by email - Searches all collections"""
        try:
            email = email.lower()
            # Try specific collections first
            user = self.nurses.find_one({'email': email}, {'_id': 0})
            if user: return user
            
            user = self.doctors.find_one({'email': email}, {'_id': 0})
            if user: return user
            
            user = self.admins.find_one({'email': email}, {'_id': 0})
            if user: return user

            user = self.vendors.find_one({'email': email}, {'_id': 0})
            if user: return user
            
            user = self.patients.find_one({'email': email}, {'_id': 0})
            if user: return user

            return None
        except Exception as e:
            logger.error(f" Error getting user by email: {e}")
            return None

    def get_user_by_id(self, user_id: str) -> Optional[dict]:
        """Get user by user_id - Searches all collections"""
        try:
            # Try specific collections first
            user = self.nurses.find_one({'user_id': user_id}, {'_id': 0})
            if user: return user
            
            user = self.doctors.find_one({'user_id': user_id}, {'_id': 0})
            if user: return user
            
            user = self.admins.find_one({'user_id': user_id}, {'_id': 0})
            if user: return user

            user = self.vendors.find_one({'user_id': user_id}, {'_id': 0})
            if user: return user
            
            user = self.patients.find_one({'user_id': user_id}, {'_id': 0})
            if user: return user

            return None
        except Exception as e:
            logger.error(f" Error getting user by ID: {e}")
            return None

    def get_all_nurses(self) -> List[dict]:
        """Get all nurses"""
        try:
            nurses = list(self.nurses.find(
                {},
                {'_id': 0, 'password': 0}
            ))
            return nurses
        except Exception as e:
            logger.error(f" Error getting nurses: {e}")
            return []

    def update_user(self, user_id: str, update_data: dict) -> bool:
        """Update user information (generic helper)"""
        try:
            # Try to update in all collections (inefficient but safe for generic update)
            # Or assume caller knows, but here we just try all.
            for collection in [self.nurses, self.doctors, self.admins, self.vendors, self.patients]:
                result = collection.update_one(
                    {'user_id': user_id},
                    {'$set': update_data}
                )
                if result.matched_count > 0:
                    return True
            return False
        except Exception as e:
            logger.error(f" Error updating user: {e}")
            return False

    def delete_user(self, user_id: str) -> bool:
        """Delete a user (from any collection)"""
        try:
             for collection in [self.nurses, self.doctors, self.admins, self.vendors, self.patients]:
                result = collection.delete_one({'user_id': user_id})
                if result.deleted_count > 0:
                    return True
             return False
        except Exception as e:
            logger.error(f" Error deleting user: {e}")
            return False

    def get_all_doctors(self) -> List[dict]:
        """Get all doctors"""
        try:
            doctors = list(self.doctors.find(
                {},
                {'_id': 0, 'password': 0}
            ))
            return doctors
        except Exception as e:
            logger.error(f" Error getting doctors: {e}")
            return []

    def get_system_stats(self) -> dict:
        """Get comprehensive system statistics for Super Admin"""
        try:
            return {
                'total_patients': self.patients.count_documents({}),
                'active_patients': self.patients.count_documents({'room_number': {'$exists': True, '$ne': None}}),
                'total_nurses': self.nurses.count_documents({}),
                'total_doctors': self.doctors.count_documents({}),
                'total_handoffs': self.handoffs.count_documents({}),
                'total_vendors': self.vendors.count_documents({}),
                'pending_vendors': self.vendors.count_documents({'is_approved': False, 'is_rejected': {'$ne': True}})
            }
        except Exception as e:
            logger.error(f" Error getting system stats: {e}")
            return {}

    # ============ PATIENT MANAGEMENT ============

    def add_patient(self, patient_data: dict) -> str:
        """Add a new patient (This now handles BOTH profile and auth data)"""
        try:
            patient_data['created_at'] = datetime.now()
            patient_data['updated_at'] = datetime.now()
            # Insert into patients collection (which now holds everything)
            result = self.patients.insert_one(patient_data)
            logger.info(f" Patient {patient_data['patient_id']} added to MongoDB")
            return patient_data['patient_id']
        except Exception as e:
            logger.error(f" Error adding patient: {e}")
            raise

    def get_patient(self, patient_id: str) -> Optional[dict]:
        """Get a specific patient"""
        try:
            patient = self.patients.find_one(
                {'patient_id': patient_id},
                {'_id': 0}
            )
            return patient
        except Exception as e:
            logger.error(f" Error getting patient: {e}")
            return None

    def get_all_patients(self) -> List[dict]:
        """Get all patients — excludes WhatsApp-signup accounts (created_via='whatsapp')"""
        try:
            patients = list(self.patients.find(
                {'created_via': {'$ne': 'whatsapp'}},
                {'_id': 0}
            ))
            return patients
        except Exception as e:
            logger.error(f" Error getting all patients: {e}")
            return []

    def update_patient(self, patient_id: str, update_data: dict) -> bool:
        """Update patient information"""
        try:
            update_data['updated_at'] = datetime.now()
            result = self.patients.update_one(
                {'patient_id': patient_id},
                {'$set': update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f" Error updating patient: {e}")
            return False

    def delete_patient(self, patient_id: str) -> bool:
        """Delete a patient"""
        try:
            result = self.patients.delete_one({'patient_id': patient_id})
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f" Error deleting patient: {e}")
            return False

    def search_patients(self, query: str) -> List[dict]:
        """Search patients by name or ID — excludes WhatsApp-signup accounts"""
        try:
            patients = list(self.patients.find(
                {
                    'created_via': {'$ne': 'whatsapp'},
                    '$or': [
                        {'patient_name': {'$regex': query, '$options': 'i'}},
                        {'patient_id': {'$regex': query, '$options': 'i'}}
                    ]
                },
                {'_id': 0}
            ))
            return patients
        except Exception as e:
            logger.error(f" Error searching patients: {e}")
            return []

    def get_patients_with_vitals(self) -> List[dict]:
        """Get all patients with their latest vital signs"""
        try:
            patients = self.get_all_patients()
            for patient in patients:
                latest_handoff = self.handoffs.find_one(
                    {'patient_id': patient['patient_id']},
                    {'_id': 0},
                    sort=[('timestamp', -1)]
                )
                if latest_handoff and 'structured_report' in latest_handoff:
                    raw = latest_handoff['structured_report'].get('vitals', {})
                    patient['latest_vitals'] = {
                        'heart_rate': raw.get('hr') or raw.get('heart_rate'),
                        'blood_pressure': raw.get('bp') or raw.get('blood_pressure'),
                        'temperature': raw.get('temp') or raw.get('temperature'),
                        'oxygen_saturation': raw.get('oxygen_saturation') or raw.get('spo2'),
                        'respiratory_rate': raw.get('respiratory_rate') or raw.get('resp_rate')
                    }
                    patient['last_handoff'] = latest_handoff.get('timestamp')
                else:
                    patient['latest_vitals'] = None
                    patient['last_handoff'] = None
            return patients
        except Exception as e:
            logger.error(f" Error getting patients with vitals: {e}")
            return []

    # ============ HANDOFF MANAGEMENT ============

    def add_handoff(self, handoff_data: dict) -> str:
        """Add a new handoff report"""
        try:
            handoff_id = f"handoff_{int(datetime.now().timestamp())}"
            handoff_data['handoff_id'] = handoff_id
            handoff_data['timestamp'] = datetime.now()
            self.handoffs.insert_one(handoff_data)
            logger.info(f" Handoff {handoff_id} added to MongoDB")
            return handoff_id
        except Exception as e:
            logger.error(f" Error adding handoff: {e}")
            raise

    def get_handoff(self, handoff_id: str) -> Optional[dict]:
        """Get a specific handoff"""
        try:
            handoff = self.handoffs.find_one(
                {'handoff_id': handoff_id},
                {'_id': 0}
            )
            return handoff
        except Exception as e:
            logger.error(f" Error getting handoff: {e}")
            return None

    def get_all_handoffs(self) -> List[dict]:
        """Get all handoffs"""
        try:
            handoffs = list(self.handoffs.find(
                {},
                {'_id': 0}
            ).sort('timestamp', -1))
            return handoffs
        except Exception as e:
            logger.error(f" Error getting all handoffs: {e}")
            return []

    def get_patient_handoffs(self, patient_id: str) -> List[dict]:
        """Get all handoffs for a specific patient"""
        try:
            handoffs = list(self.handoffs.find(
                {'patient_id': patient_id},
                {'_id': 0}
            ).sort('timestamp', -1))
            return handoffs
        except Exception as e:
            logger.error(f" Error getting patient handoffs: {e}")
            return []

    def delete_handoff(self, handoff_id: str) -> bool:
        """Delete a handoff report (supports handoff_id and _id)"""
        try:
            # 1. Try deleting by custom handoff_id
            result = self.handoffs.delete_one({'handoff_id': handoff_id})
            if result.deleted_count > 0:
                logger.info(f" Handoff {handoff_id} deleted (by handoff_id)")
                return True
            
            # 2. Try deleting by ObjectId (fallback)
            if ObjectId.is_valid(handoff_id):
                result = self.handoffs.delete_one({'_id': ObjectId(handoff_id)})
                if result.deleted_count > 0:
                    logger.info(f" Handoff {handoff_id} deleted (by _id)")
                    return True
            
            logger.warning(f" Handoff {handoff_id} not found for deletion")
            return False
        except Exception as e:
            logger.error(f" Error deleting handoff: {e}")
            return False

    # ============ STATISTICS & STATUS ============

    def get_stats(self) -> dict:
        """Get dashboard statistics"""
        try:
            total_patients = self.patients.count_documents({})
            active_patients = self.patients.count_documents({'room_number': {'$ne': ''}})
            total_handoffs = self.handoffs.count_documents({})
            recent_handoffs = list(self.handoffs.find(
                {},
                {'_id': 0}
            ).sort('timestamp', -1).limit(5))
            
            # Enrich with patient and nurse names
            for handoff in recent_handoffs:
                if 'patient_id' in handoff:
                    patient = self.get_patient(handoff['patient_id'])
                    if patient:
                        handoff['patient_name'] = patient.get('patient_name', 'Unknown')
                    else:
                        handoff['patient_name'] = handoff.get('structured_report', {}).get('patient_name', 'Unknown')
                if 'nurse_id' in handoff:
                    nurse = self.get_user_by_id(handoff['nurse_id'])
                    if nurse:
                        handoff['nurse_name'] = nurse.get('full_name', handoff.get('nurse_name', 'Unknown'))
            
            return {
                'total_patients': total_patients,
                'active_patients': active_patients,
                'total_handoffs': total_handoffs,
                'recent_handoffs': recent_handoffs
            }
        except Exception as e:
            logger.error(f" Error getting stats: {e}")
            return {
                'total_patients': 0,
                'active_patients': 0,
                'total_handoffs': 0,
                'recent_handoffs': []
            }

    def get_all_patients_status(self) -> dict:
        """Get comprehensive status of all patients"""
        try:
            patients = self.get_all_patients()
            patients_status = []
            
            for patient in patients:
                latest_handoff = self.handoffs.find_one(
                    {'patient_id': patient['patient_id']},
                    {'_id': 0},
                    sort=[('timestamp', -1)]
                )
                
                status = {
                    'patient_id': patient['patient_id'],
                    'patient_name': patient['patient_name'],
                    'room_number': patient.get('room_number', 'N/A'),
                    'diagnosis': patient.get('diagnosis', 'N/A'),
                    'admission_date': patient.get('admission_date', 'N/A'),
                    'allergies': patient.get('allergies', []),
                    'status': 'Active' if patient.get('room_number') else 'Pending'
                }
                
                if latest_handoff:
                    report = latest_handoff.get('structured_report', {})
                    status['latest_vitals'] = report.get('vitals', {})
                    status['latest_observations'] = report.get('patient_observations', [])
                    status['risks'] = report.get('risks_or_alerts', [])
                    status['last_update'] = latest_handoff.get('timestamp')
                else:
                    status['latest_vitals'] = None
                    status['latest_observations'] = []
                    status['risks'] = []
                    status['last_update'] = None
                
                patients_status.append(status)
            
            return {
                'total_count': len(patients_status),
                'patients': patients_status
            }
        except Exception as e:
            logger.error(f" Error getting all patients status: {e}")
            return {'total_count': 0, 'patients': []}

    def get_patient_status(self, patient_id: str) -> Optional[dict]:
        """Get detailed status for a specific patient"""
        try:
            patient = self.get_patient(patient_id)
            if not patient:
                return None
            
            latest_handoff = self.handoffs.find_one(
                {'patient_id': patient_id},
                {'_id': 0},
                sort=[('timestamp', -1)]
            )
            
            status = {
                'patient_id': patient['patient_id'],
                'patient_name': patient['patient_name'],
                'room_number': patient.get('room_number', 'N/A'),
                'diagnosis': patient.get('diagnosis', 'N/A'),
                'allergies': patient.get('allergies', []),
                'date_of_birth': patient.get('date_of_birth', 'N/A'),
                'gender': patient.get('gender', 'N/A'),
                'admission_date': patient.get('admission_date', 'N/A'),
                'status': 'Active' if patient.get('room_number') else 'Pending'
            }
            
            if latest_handoff:
                report = latest_handoff.get('structured_report', {})
                raw_vitals = report.get('vitals', {})
                status['latest_vitals'] = {
                     'heart_rate': raw_vitals.get('hr') or raw_vitals.get('heart_rate'),
                     'blood_pressure': raw_vitals.get('bp') or raw_vitals.get('blood_pressure'),
                     'temperature': raw_vitals.get('temp') or raw_vitals.get('temperature'),
                     'oxygen_saturation': raw_vitals.get('oxygen_saturation') or raw_vitals.get('spo2'),
                     'respiratory_rate': raw_vitals.get('respiratory_rate') or raw_vitals.get('resp_rate')
                }
                status['latest_observations'] = report.get('patient_observations', [])
                status['medications'] = report.get('medications_administered', [])
                status['risks'] = report.get('risks_or_alerts', [])
                status['action_items'] = report.get('action_items_for_next_shift', [])
                status['notes'] = report.get('notes', '')
                status['last_update'] = latest_handoff.get('timestamp')
            else:
                status['latest_vitals'] = None
                status['latest_observations'] = []
                status['medications'] = []
                status['risks'] = []
                status['action_items'] = []
                status['notes'] = ''
                status['last_update'] = None
            
            return status
        except Exception as e:
            logger.error(f" Error getting patient status: {e}")
            return None

    def test_connection(self) -> bool:
        """Test MongoDB connection"""
        try:
            self.client.admin.command('ping')
            logger.info("MongoDB connection test successful")
            return True
        except Exception as e:
            logger.error(f" MongoDB connection test failed: {e}")
            return False

    # ============ CARE PLAN MANAGEMENT ============

    def add_care_plan(self, plan_data: dict) -> str:
        """Add a new care plan"""
        try:
            # Check if active plan exists for patient, deactivate it
            self.care_plans.update_many(
                {'patient_id': plan_data['patient_id'], 'is_active': True},
                {'$set': {'is_active': False, 'updated_at': datetime.now()}}
            )
            
            plan_id = f"plan_{int(datetime.now().timestamp())}"
            plan_data['plan_id'] = plan_id
            plan_data['created_at'] = datetime.now()
            plan_data['updated_at'] = datetime.now()
            plan_data['is_active'] = True
            
            self.care_plans.insert_one(plan_data)
            logger.info(f" Care Plan {plan_id} added")
            return plan_id
        except Exception as e:
            logger.error(f" Error adding care plan: {e}")
            raise

    def get_care_plan(self, plan_id: str) -> Optional[dict]:
        """Get a specific care plan"""
        try:
            return self.care_plans.find_one({'plan_id': plan_id}, {'_id': 0})
        except Exception as e:
            logger.error(f" Error getting care plan: {e}")
            return None

    def get_active_care_plan(self, patient_id: str) -> Optional[dict]:
        """Get active care plan for a patient"""
        try:
            return self.care_plans.find_one(
                {'patient_id': patient_id, 'is_active': True},
                {'_id': 0}
            )
        except Exception as e:
            logger.error(f" Error getting active care plan: {e}")
            return None

    # ============ TASK MANAGEMENT ============

    def add_tasks(self, tasks: List[dict]) -> int:
        """Add multiple tasks"""
        try:
            if not tasks:
                return 0
                
            for task in tasks:
                task['created_at'] = datetime.now()
                if 'task_id' not in task or not task['task_id']:
                    task['task_id'] = f"task_{ObjectId()}"
            
            result = self.tasks.insert_many(tasks)
            logger.info(f" {len(result.inserted_ids)} tasks added")
            return len(result.inserted_ids)
        except Exception as e:
            logger.error(f" Error adding tasks: {e}")
            raise

    def get_nurse_tasks(self, nurse_id: str) -> List[dict]:
        """Get tasks assigned to a nurse"""
        try:
            # Include _id to ensure we have a fallback ID
            tasks = list(self.tasks.find(
                {'assigned_nurse_id': nurse_id, 'status': {'$ne': 'completed'}}
            ).sort('scheduled_time', 1))

            # Ensure task_id exists and _id is string, enrich names
            for task in tasks:
                 if '_id' in task:
                     task['_id'] = str(task['_id'])
                 if 'task_id' not in task or not task['task_id']:
                     task['task_id'] = task.get('_id')
                 # Enrich patient_name live so edits propagate
                 if task.get('patient_id'):
                     patient = self.get_patient(task['patient_id'])
                     if patient:
                         task['patient_name'] = patient.get('patient_name', task.get('patient_name', 'Unknown'))

            return tasks
        except Exception as e:
            logger.error(f" Error getting nurse tasks: {e}")
            return []

    def update_task_status(self, task_id: str, status: str, completed_by: str = None) -> bool:
        """Update task status"""
        try:
            update_data = {
                'status': status,
                'updated_at': datetime.now()
            }
            if status == 'completed':
                update_data['completed_at'] = datetime.now()
                if completed_by:
                    update_data['completed_by'] = completed_by
            
            # Try to update by custom task_id first
            result = self.tasks.update_one(
                {'task_id': task_id},
                {'$set': update_data}
            )
            
            if result.matched_count > 0:
                 return True

            # If not found, try by _id (if valid ObjectId)
            if ObjectId.is_valid(task_id):
                 result = self.tasks.update_one(
                    {'_id': ObjectId(task_id)},
                    {'$set': update_data}
                 )
                 return result.matched_count > 0
            
            return False
        except Exception as e:
            logger.error(f" Error updating task: {e}")
            return False
            
    def get_all_active_tasks(self) -> List[dict]:
        """Get all pending/in-progress tasks"""
        try:
            return list(self.tasks.find(
                {'status': {'$ne': 'completed'}},
                {'_id': 0}
            ))
        except Exception as e:
            logger.error(f" Error getting active tasks: {e}")
            return []
            
    def update_task_assignment(self, task_id: str, nurse_id: str, nurse_name: str) -> bool:
        """Assign task to a nurse"""
        try:
            result = self.tasks.update_one(
                {'task_id': task_id},
                {'$set': {
                    'assigned_nurse_id': nurse_id,
                    'assigned_nurse_name': nurse_name,
                    'status': 'assigned',
                    'updated_at': datetime.now()
                }}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f" Error assigning task: {e}")
            return False

    # ============ NEW METHODS FOR DOCTOR DASHBOARD ENHANCEMENTS ============

    def get_nurse_assignments_grouped(self) -> List[dict]:
        """Get all nurses with their tasks grouped by shift -> patient -> completed tasks"""
        try:
            nurses = self.get_all_nurses()
            result = []
            
            for nurse in nurses:
                nurse_id = nurse['user_id']
                
                # Get all tasks (completed and pending) for this nurse
                all_tasks = list(self.tasks.find(
                    {'assigned_nurse_id': nurse_id},
                    {'_id': 0}
                ).sort('completed_at', -1))
                
                # Get handoffs submitted by this nurse
                nurse_handoffs = list(self.handoffs.find(
                    {'nurse_id': nurse_id},
                    {'_id': 0}
                ).sort('timestamp', -1))
                
                # Group tasks by shift
                shifts_data = {}
                for task in all_tasks:
                    shift = task.get('shift', 'Day')
                    if shift not in shifts_data:
                        shifts_data[shift] = {'patients': {}}
                    
                    patient_id = task.get('patient_id', 'unknown')
                    if patient_id not in shifts_data[shift]['patients']:
                        # Get patient name
                        patient = self.get_patient(patient_id)
                        patient_name = patient.get('patient_name', 'Unknown') if patient else 'Unknown'
                        shifts_data[shift]['patients'][patient_id] = {
                            'patient_id': patient_id,
                            'patient_name': patient_name,
                            'tasks': []
                        }
                    
                    shifts_data[shift]['patients'][patient_id]['tasks'].append({
                        'task_id': task.get('task_id'),
                        'task_type': task.get('task_type'),
                        'description': task.get('description'),
                        'status': task.get('status'),
                        'completed_at': task.get('completed_at'),
                        'scheduled_time': task.get('scheduled_time')
                    })
                
                # Convert to list format
                shifts_list = []
                for shift_name, shift_data in shifts_data.items():
                    patients_list = list(shift_data['patients'].values())
                    shifts_list.append({
                        'shift': shift_name,
                        'patients': patients_list,
                        'total_tasks': sum(len(p['tasks']) for p in patients_list),
                        'completed_tasks': sum(
                            len([t for t in p['tasks'] if t['status'] == 'completed']) 
                            for p in patients_list
                        )
                    })
                
                result.append({
                    'nurse_id': nurse_id,
                    'nurse_name': nurse.get('full_name', 'Unknown'),
                    'current_shift': nurse.get('shift', 'Day'),
                    'status': nurse.get('status', 'online'),
                    'shifts': shifts_list,
                    'total_handoffs': len(nurse_handoffs),
                    'recent_handoffs': nurse_handoffs[:5]
                })
            
            return result
        except Exception as e:
            logger.error(f" Error getting nurse assignments: {e}")
            return []

    def get_patient_medication_history(self, patient_id: str) -> List[dict]:
        """Get all historical medications prescribed for a patient from care plans"""
        try:
            # Get all care plans (active and inactive) for this patient
            care_plans = list(self.care_plans.find(
                {'patient_id': patient_id},
                {'_id': 0}
            ).sort('created_at', -1))
            
            medications = []
            for plan in care_plans:
                # Live-enrich doctor_name so edits propagate
                doctor_name = plan.get('doctor_name', '')
                if plan.get('doctor_id'):
                    doc = self.doctors.find_one({'user_id': plan['doctor_id']}, {'full_name': 1})
                    if doc:
                        doctor_name = doc.get('full_name', doctor_name)
                plan_meds = plan.get('medications', [])
                for med in plan_meds:
                    medications.append({
                        'medication_name': med.get('name', ''),
                        'dose': med.get('dose', ''),
                        'frequency': med.get('frequency', ''),
                        'time': med.get('time', ''),
                        'prescribed_date': plan.get('created_at'),
                        'plan_id': plan.get('plan_id'),
                        'doctor_id': plan.get('doctor_id'),
                        'doctor_name': doctor_name,
                        'start_date': plan.get('start_date'),
                        'end_date': plan.get('end_date'),
                        'is_active': plan.get('is_active', False)
                    })
            
            return medications
        except Exception as e:
            logger.error(f" Error getting medication history: {e}")
            return []

    def get_all_care_plans_for_patient(self, patient_id: str) -> List[dict]:
        """Get all care plans (active + inactive) for a patient"""
        try:
            plans = list(self.care_plans.find(
                {'patient_id': patient_id},
                {'_id': 0}
            ).sort('created_at', -1))
            return plans
        except Exception as e:
            logger.error(f" Error getting all care plans: {e}")
            return []

    def get_nurse_activity_details(self, nurse_id: str) -> Optional[dict]:
        """Get detailed nurse activity: shifts worked, tasks completed, handoffs submitted"""
        try:
            nurse = self.get_user_by_id(nurse_id)
            if not nurse:
                return None
            
            # Get all tasks for this nurse
            all_tasks = list(self.tasks.find(
                {'assigned_nurse_id': nurse_id},
                {'_id': 0}
            ).sort('completed_at', -1))
            
            completed_tasks = [t for t in all_tasks if t.get('status') == 'completed']
            pending_tasks = [t for t in all_tasks if t.get('status') in ('pending', 'assigned')]
            reassigned_tasks = [t for t in all_tasks if t.get('reassigned') or t.get('status') == 'reassigned']
            rejected_tasks = [t for t in all_tasks if t.get('status') == 'rejected']
            
            # Get handoffs
            handoffs = list(self.handoffs.find(
                {'nurse_id': nurse_id},
                {'_id': 0}
            ).sort('timestamp', -1))
            
            # Calculate shifts worked (unique dates with completed tasks)
            shifts_worked = {}
            for task in completed_tasks:
                completed_at = task.get('completed_at')
                if completed_at:
                    date_key = completed_at.strftime('%Y-%m-%d') if hasattr(completed_at, 'strftime') else str(completed_at)[:10]
                    shift = task.get('shift', 'Day')
                    key = f"{date_key}_{shift}"
                    if key not in shifts_worked:
                        shifts_worked[key] = {
                            'date': date_key,
                            'shift': shift,
                            'tasks_completed': 0,
                            'patients': set()
                        }
                    shifts_worked[key]['tasks_completed'] += 1
                    shifts_worked[key]['patients'].add(task.get('patient_id', ''))
            
            # Convert sets to lists
            shifts_list = []
            for shift_data in shifts_worked.values():
                shift_data['patients'] = list(shift_data['patients'])
                shifts_list.append(shift_data)
            
            return {
                'nurse_id': nurse_id,
                'nurse_name': nurse.get('full_name', 'Unknown'),
                'email': nurse.get('email', ''),
                'department': nurse.get('department', ''),
                'current_shift': nurse.get('shift', 'Day'),
                'current_status': nurse.get('status', 'online'),
                'total_tasks_completed': len(completed_tasks),
                'pending_tasks': len(pending_tasks),
                'reassigned_tasks': len(reassigned_tasks),
                'rejected_tasks': len(rejected_tasks),
                'total_handoffs': len(handoffs),
                'shifts_worked': sorted(shifts_list, key=lambda x: x['date'], reverse=True),
                'recent_completed_tasks': completed_tasks[:10],
                'recent_pending_tasks': pending_tasks[:10],
                'recent_reassigned_tasks': reassigned_tasks[:10],
                'recent_handoffs': handoffs[:10]
            }
        except Exception as e:
            logger.error(f" Error getting nurse activity: {e}")
            return None

    def get_completed_tasks_by_nurse(self, nurse_id: str) -> List[dict]:
        """Get all completed tasks for a specific nurse with full history"""
        try:
            tasks = list(self.tasks.find(
                {'assigned_nurse_id': nurse_id, 'status': 'completed'},
                {'_id': 0}
            ).sort('completed_at', -1))
            
            # Enrich with patient names
            for task in tasks:
                patient = self.get_patient(task.get('patient_id', ''))
                task['patient_name'] = patient.get('patient_name', 'Unknown') if patient else 'Unknown'
            
            return tasks
        except Exception as e:
            logger.error(f" Error getting completed tasks: {e}")
            return []

    # ============ TASK EVENTS (AUDIT LOG) ============

    def add_task_event(self, event_data: dict) -> str:
        """Add a task event for audit logging (rejections, reassignments, etc.)"""
        try:
            event_id = f"event_{ObjectId()}"
            event_data['event_id'] = event_id
            event_data['timestamp'] = event_data.get('timestamp', datetime.now())
            
            self.task_events.insert_one(event_data)
            logger.info(f" Task event {event_id} logged: {event_data.get('event')}")
            return event_id
        except Exception as e:
            logger.error(f" Error adding task event: {e}")
            raise

    def get_task_events(self, task_id: str) -> List[dict]:
        """Get all events for a specific task"""
        try:
            events = list(self.task_events.find(
                {'task_id': task_id},
                {'_id': 0}
            ).sort('timestamp', -1))
            return events
        except Exception as e:
            logger.error(f" Error getting task events: {e}")
            return []

    # ============ MEALS COLLECTION (SEPARATE FROM TASKS) ============

    def add_meal(self, meal_data: dict) -> str:
        """Add a new meal entry"""
        try:
            meal_id = f"meal_{ObjectId()}"
            meal_data['meal_id'] = meal_id
            meal_data['created_at'] = datetime.now()
            meal_data['status'] = meal_data.get('status', 'pending')
            
            self.meals.insert_one(meal_data)
            logger.info(f" Meal {meal_id} added")
            return meal_id
        except Exception as e:
            logger.error(f" Error adding meal: {e}")
            raise

    def get_meals(self, patient_id: str = None, day: str = None) -> List[dict]:
        """Get meals, optionally filtered by patient or day"""
        try:
            query = {}
            if patient_id:
                query['patient_id'] = patient_id
            if day:
                query['day'] = day
            
            meals = list(self.meals.find(query, {'_id': 0}).sort('day', -1))
            return meals
        except Exception as e:
            logger.error(f" Error getting meals: {e}")
            return []

    def update_meal(self, meal_id: str, update_data: dict) -> bool:
        """Update a meal entry"""
        try:
            update_data['updated_at'] = datetime.now()
            if update_data.get('status') == 'served':
                update_data['served_at'] = datetime.now()
            
            result = self.meals.update_one(
                {'meal_id': meal_id},
                {'$set': update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f" Error updating meal: {e}")
            return False

    # ============ ENHANCED TASK QUERIES ============

    def get_unassigned_tasks(self) -> List[dict]:
        """Get all tasks that have no nurse assigned or are marked as unassigned"""
        try:
            tasks = list(self.tasks.find(
                {
                    '$or': [
                        {'assigned_nurse_id': None},
                        {'assigned_nurse_id': ''},
                        {'status': 'unassigned'}
                    ],
                    'status': {'$ne': 'completed'}
                },
                {'_id': 0}
            ).sort('scheduled_time', 1))
            
            # Enrich with patient names
            for task in tasks:
                patient = self.get_patient(task.get('patient_id', ''))
                task['patient_name'] = patient.get('patient_name', 'Unknown') if patient else 'Unknown'
            
            return tasks
        except Exception as e:
            logger.error(f" Error getting unassigned tasks: {e}")
            return []

    def get_nurse_tasks_by_date(self, nurse_id: str, filter_type: str = 'all') -> List[dict]:
        """Get nurse tasks filtered by date: 'today', 'upcoming', 'rejected', or 'all'"""
        try:
            from datetime import date, timedelta
            today = datetime.combine(date.today(), datetime.min.time())
            tomorrow = today + timedelta(days=1)
            
            query = {'assigned_nurse_id': nurse_id}
            
            if filter_type == 'today':
                query['scheduled_time'] = {'$gte': today, '$lt': tomorrow}
                query['status'] = {'$ne': 'completed'}
            elif filter_type == 'upcoming':
                query['scheduled_time'] = {'$gte': tomorrow}
                query['status'] = {'$ne': 'completed'}
            elif filter_type == 'rejected':
                query['rejected'] = True
            else:
                query['status'] = {'$ne': 'completed'}
            
            tasks = list(self.tasks.find(query).sort('scheduled_time', 1))
            
            # Convert ObjectId and enrich
            for task in tasks:
                if '_id' in task:
                    task['_id'] = str(task['_id'])
                patient = self.get_patient(task.get('patient_id', ''))
                task['patient_name'] = patient.get('patient_name', 'Unknown') if patient else 'Unknown'
            
            return tasks
        except Exception as e:
            logger.error(f" Error getting nurse tasks by date: {e}")
            return []

    def get_online_nurses_by_shift(self, shift: str) -> List[dict]:
        """Get all online nurses for a specific shift"""
        try:
            # Normalize shift name (day, afternoon, night)
            shift_lower = shift.lower() if shift else 'day'
            
            nurses = list(self.nurses.find(
                {
                    'status': 'online',
                    '$or': [
                        {'shift': shift_lower},
                        {'shift': shift_lower.capitalize()},
                        {'current_shift': shift_lower},
                        {'current_shift': shift_lower.capitalize()}
                    ]
                },
                {'_id': 0, 'password': 0}
            ))
            
            # If no shift-specific nurses, return all online nurses
            if not nurses:
                nurses = list(self.nurses.find(
                    {'status': 'online'},
                    {'_id': 0, 'password': 0}
                ))
            
            return nurses
        except Exception as e:
            logger.error(f" Error getting online nurses by shift: {e}")
            return []

    def get_nurse_task_count(self, nurse_id: str) -> int:
        """Get count of active (non-completed) tasks for a nurse"""
        try:
            return self.tasks.count_documents({
                'assigned_nurse_id': nurse_id,
                'status': {'$nin': ['completed', 'cancelled']}
            })
        except Exception as e:
            logger.error(f" Error getting nurse task count: {e}")
            return 0

    def reassign_task(self, task_id: str, from_nurse_id: str, to_nurse_id: str, 
                      to_nurse_name: str, reason: str = '') -> bool:
        """Reassign a task from one nurse to another with history tracking"""
        try:
            # Get current task
            task = self.tasks.find_one({'task_id': task_id})
            if not task:
                # Try by ObjectId
                if ObjectId.is_valid(task_id):
                    task = self.tasks.find_one({'_id': ObjectId(task_id)})
                if not task:
                    return False
            
            # Build reassignment history entry
            history_entry = {
                'from_nurse': from_nurse_id,
                'to_nurse': to_nurse_id,
                'reason': reason,
                'timestamp': datetime.now()
            }
            
            # Update task
            result = self.tasks.update_one(
                {'task_id': task.get('task_id', task_id)},
                {
                    '$set': {
                        'assigned_nurse_id': to_nurse_id,
                        'assigned_nurse_name': to_nurse_name,
                        'status': 'pending' if to_nurse_id else 'unassigned',
                        'rejected': False,
                        'reassigned': True,
                        'updated_at': datetime.now()
                    },
                    '$push': {'reassignment_history': history_entry}
                }
            )
            
            # Log the event
            if result.modified_count > 0:
                self.add_task_event({
                    'task_id': task.get('task_id', task_id),
                    'event': 'reassigned',
                    'by': from_nurse_id,
                    'reason': reason,
                    'details': {
                        'from_nurse': from_nurse_id,
                        'to_nurse': to_nurse_id,
                        'to_nurse_name': to_nurse_name
                    }
                })
                return True
            
            return False
        except Exception as e:
            logger.error(f" Error reassigning task: {e}")
            return False

    def reject_task(self, task_id: str, nurse_id: str, nurse_name: str, reason: str) -> bool:
        """Mark a task as rejected by a nurse"""
        try:
            # Update task rejected status
            result = self.tasks.update_one(
                {'task_id': task_id},
                {
                    '$set': {
                        'rejected': True,
                        'status': 'rejected',
                        'updated_at': datetime.now()
                    }
                }
            )
            
            if result.matched_count == 0:
                # Try by ObjectId
                if ObjectId.is_valid(task_id):
                    result = self.tasks.update_one(
                        {'_id': ObjectId(task_id)},
                        {
                            '$set': {
                                'rejected': True,
                                'status': 'rejected',
                                'updated_at': datetime.now()
                            }
                        }
                    )
            
            # Log the event
            self.add_task_event({
                'task_id': task_id,
                'event': 'rejected',
                'by': nurse_id,
                'by_name': nurse_name,
                'reason': reason
            })
            
            return result.matched_count > 0
        except Exception as e:
            logger.error(f" Error rejecting task: {e}")
            return False
