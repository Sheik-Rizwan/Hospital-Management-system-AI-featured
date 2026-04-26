"""Database audit script — checks PostgreSQL + MongoDB status."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
load_dotenv()

def audit_postgres():
    print('=== PostgreSQL Status ===')
    db_url = os.getenv('DATABASE_URL', '')
    print(f'DATABASE_URL: {db_url}')
    if not db_url:
        print('DATABASE_URL not set in .env')
        return

    try:
        import psycopg2
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        host = parsed.hostname or 'localhost'
        port = parsed.port or 5432
        user = parsed.username or 'postgres'
        pwd = parsed.password or ''
        target_db = parsed.path.lstrip('/') if parsed.path else 'hospital_db'
        print(f'Host: {host}, Port: {port}, DB: {target_db}, User: {user}')

        # Connect to 'postgres' to check server + target DB
        try:
            conn = psycopg2.connect(host=host, port=port, user=user, password=pwd, dbname='postgres', connect_timeout=3)
            conn.autocommit = True
            cur = conn.cursor()
            print('PostgreSQL server: RUNNING')
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
            exists = cur.fetchone()
            print(f'Database "{target_db}": {"EXISTS" if exists else "MISSING"}')
            if not exists:
                cur.execute(f'CREATE DATABASE "{target_db}"')
                print(f'Database "{target_db}" created!')
            cur.close()
            conn.close()
        except Exception as e:
            print(f'PostgreSQL server: NOT RUNNING or connection failed — {e}')
            return

        # Connect to target DB and check tables
        try:
            conn2 = psycopg2.connect(host=host, port=port, user=user, password=pwd, dbname=target_db, connect_timeout=3)
            cur2 = conn2.cursor()
            cur2.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
            tables = [r[0] for r in cur2.fetchall()]
            print(f'Tables found: {len(tables)}')
            for t in tables:
                cur2.execute("SELECT count(*) FROM " + t)
                count = cur2.fetchone()[0]
                print(f'  {t}: {count} rows')
            cur2.close()
            conn2.close()
        except Exception as e:
            print(f'Table check failed: {e}')
    except ImportError:
        print('psycopg2 not installed')

def audit_mongo():
    print('\n=== MongoDB Status ===')
    mongo_uri = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017/')
    print(f'MONGODB_URI: {mongo_uri}')
    try:
        from pymongo import MongoClient
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
        client.admin.command('ping')
        print('MongoDB server: RUNNING')
        for db_name in ['healthcare_db', 'nurse_handoff_db']:
            db = client[db_name]
            cols = db.list_collection_names()
            print(f'{db_name}: {len(cols)} collections')
            for c in sorted(cols):
                count = db[c].count_documents({})
                print(f'  {c}: {count} docs')
    except Exception as e:
        print(f'MongoDB: {e}')

if __name__ == '__main__':
    audit_postgres()
    audit_mongo()
