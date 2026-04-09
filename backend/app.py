# app.py - Main Flask Application Entry Point
# Clean architecture: routes  controllers  services  models

import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required
from dotenv import load_dotenv

load_dotenv()

# ── App Factory ──

app = Flask(__name__)

# Configuration from environment
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'change-me-in-production')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'change-me-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(
    seconds=int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 86400))
)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload

# Extensions
CORS(app, resources={r"/api/*": {"origins": "*"}})
jwt = JWTManager(app)

# Database (singleton — initialized once)
from mongodb_config import MongoDatabase
db = MongoDatabase()

# Socket.IO for real-time events
from services.socket_service import init_socketio
socketio = init_socketio(app)

# Error handling middleware
from middleware.error_handler import register_error_handlers
register_error_handlers(app)

# Uploads directory
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# ── Register Blueprints ──

from routes.admin_routes import admin_bp
from routes.doctor_routes import doctor_bp
from routes.nurse_routes import nurse_bp
from routes.patient_routes import patient_bp
from routes.whatsapp_routes import (
    whatsapp_bp,
    verify_token as whatsapp_verify_token,
    handle_message as whatsapp_handle_message,
)
from routes.vendor_routes import vendor_bp
from routes.procurement_routes import procurement_bp
from routes.chat_routes import chat_bp
from routes.voice_routes import voice_bp

app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(doctor_bp, url_prefix='/api/doctor')
app.register_blueprint(nurse_bp, url_prefix='/api/nurse')
app.register_blueprint(patient_bp, url_prefix='/api/patient')
app.register_blueprint(whatsapp_bp, url_prefix='/api/whatsapp')
app.register_blueprint(vendor_bp, url_prefix='/api/vendor')
app.register_blueprint(procurement_bp, url_prefix='/api/procurement')
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(voice_bp, url_prefix='/api/voice')

# WebSocket for Twilio Media Streams (real-time voice bot)
try:
    from flask_sock import Sock
    from services.voice_stream_service import handle_voice_stream
    sock = Sock(app)
    sock.route('/api/voice/stream')(handle_voice_stream)
except ImportError:
    pass  # flask-sock not installed — voice streaming disabled

# Backward-compatible webhook aliases (some WhatsApp app configurations point to /webhook)
app.add_url_rule('/webhook', 'whatsapp_verify_alias', whatsapp_verify_token, methods=['GET'])
app.add_url_rule('/webhook', 'whatsapp_handle_alias', whatsapp_handle_message, methods=['POST'])


# ── Static File Serving ──

@app.route('/uploads/<path:filename>')
@app.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    """Serve uploaded files."""
    return send_from_directory(UPLOAD_FOLDER, filename)


# ── Auth Routes (delegated to auth_controller) ──

from controllers.auth_controller import (
    doctor_login, nurse_login, patient_login, patient_whatsapp_login,
    admin_login, doctor_signup, nurse_signup, vendor_signup,
    patient_signup, get_user_profile, update_user_profile
)

app.add_url_rule('/api/auth/doctor/login', 'doctor_login', doctor_login, methods=['POST'])
app.add_url_rule('/api/auth/nurse/login', 'nurse_login', nurse_login, methods=['POST'])
app.add_url_rule('/api/auth/patient/login', 'patient_login', patient_login, methods=['POST'])
app.add_url_rule('/api/auth/patient/whatsapp-login', 'patient_whatsapp_login', patient_whatsapp_login, methods=['POST'])
app.add_url_rule('/api/auth/superadmin/login', 'admin_login', admin_login, methods=['POST'])

app.add_url_rule('/api/auth/doctor/signup', 'doctor_signup', doctor_signup, methods=['POST'])
app.add_url_rule('/api/auth/nurse/signup', 'nurse_signup', nurse_signup, methods=['POST'])
app.add_url_rule('/api/auth/vendor/signup', 'vendor_signup', vendor_signup, methods=['POST'])
app.add_url_rule('/api/signup/patient', 'patient_signup_legacy', patient_signup, methods=['POST'])
app.add_url_rule('/api/auth/patient/signup', 'patient_signup', patient_signup, methods=['POST'])

# Profile routes require JWT
@app.route('/api/user/profile', methods=['GET'])
@jwt_required()
def _get_profile():
    return get_user_profile()

@app.route('/api/user/profile', methods=['PUT'])
@jwt_required()
def _update_profile():
    return update_user_profile()


# ── Health Check ──

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    return jsonify({
        'status': 'healthy',
        'message': 'Hospital Management System API is running',
        'timestamp': datetime.now().isoformat()
    }), 200


# ── Run Server ──

if __name__ == '__main__':
    env = os.getenv('FLASK_ENV', 'development')
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', 5000))

    # Start appointment reminder scheduler
    try:
        from services.reminder_jobs import start_reminder_scheduler
        start_reminder_scheduler(app)
    except Exception as sched_err:
        print(f"  Reminder scheduler failed to start: {sched_err}")

    print(f"\n  Hospital Management System Backend")
    print(f"  Environment: {env}")
    print(f"  Debug: {debug}")
    print(f"  MongoDB: {os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017/')}")
    print(f"  Socket.IO: Enabled")
    print(f"  Voice Bot: WebSocket at /api/voice/stream")
    print(f"\n  API: http://localhost:{port}/api/")
    print(f"  Health: http://localhost:{port}/api/health\n")

    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=(env == 'development')
    )
