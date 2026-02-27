# Hospital Management & Nurse Handoff System

---

## Tech Stack

| Layer       | Technology                                                      |
|-------------|------------------------------------------------------------------|
| **Frontend** | React 19, Vite 7, Tailwind CSS, Socket.IO Client               |
| **Backend**  | Python / Flask, Flask-JWT-Extended, Flask-SocketIO, Flask-CORS  |
| **Database** | MongoDB (PyMongo)                                               |
| **AI / NLP** | Groq (LLaMA 3.3 70B), Sarvam AI (Voice & Translation)         |
| **Messaging**| WhatsApp Cloud API (Meta)                                       |
| **Auth**     | JWT (bcrypt password hashing)                                   |
| **Real-time**| Socket.IO (WebSocket + polling fallback)                        |

---

## How to Run Locally

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- **MongoDB 6+** running on `localhost:27017`

### 1. Clone the Repository

```bash
git clone <your-gitlab-repo-url>
cd Hospital
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate
# Activate (Linux/Mac)
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env and fill in your API keys

# Create the first Super Admin account
python scripts/setup_admin.py

# Start the backend server
python app.py
```

The backend runs at `http://localhost:5000`.

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment variables (optional — defaults to localhost)
cp .env.example .env

# Start the development server
npm run dev
```

The frontend runs at `http://localhost:3000`.

### 4. Verify

Open `http://localhost:3000` in your browser. You should see the login page.
Health check: `http://localhost:5000/api/health`

---

## How to Build for Production

### Backend

```bash
cd backend
# Set production environment in .env:
#   FLASK_ENV=production
#   FLASK_DEBUG=False
#   JWT_SECRET_KEY=<strong-random-key>
#   FLASK_SECRET_KEY=<strong-random-key>

# Run with gunicorn (Linux) or waitress (Windows):
# Linux:
gunicorn -k eventlet -w 1 -b 0.0.0.0:5000 app:app

# Windows:
pip install waitress
python -c "from waitress import serve; from app import app; serve(app, host='0.0.0.0', port=5000)"
```

### Frontend

```bash
cd frontend

# Set production API URL in .env:
#   VITE_API_BASE=https://your-domain.com/api
#   VITE_SOCKET_URL=https://your-domain.com

# Build
npm run build
```

The `dist/` folder contains the static build. Serve it via Nginx, Apache, or any static hosting.

---

## How to Deploy to Server

### 1. Server Requirements
- Ubuntu 22.04+ (or any Linux server)
- Python 3.10+, Node.js 18+, MongoDB 6+
- Nginx (reverse proxy)
- Domain with SSL (Let's Encrypt)

### 2. Deploy Steps

```bash
# 1. Clone repo on server
git clone <your-gitlab-repo-url> /opt/hospital
cd /opt/hospital

# 2. Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn eventlet
cp .env.example .env
# Edit .env with production values

# 3. Frontend build
cd ../frontend
npm install
# Set VITE_API_BASE and VITE_SOCKET_URL in .env
npm run build

# 4. Configure Nginx
# See sample config below

# 5. Start backend with systemd or PM2
gunicorn -k eventlet -w 1 -b 127.0.0.1:5000 app:app
```

### Nginx Configuration (sample)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend (static files)
    location / {
        root /opt/hospital/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Socket.IO proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Uploaded files
    location /uploads/ {
        alias /opt/hospital/backend/uploads/;
    }
}
```

---

## How to Push to GitLab

```bash
# Initialize git (if not already)
git init

# Add remote
git remote add origin https://gitlab.com/your-group/hospital-management.git

# Add all files
git add .

# Commit
git commit -m "Initial production-ready commit"

# Push
git push -u origin main
```

---

## Environment Variables

All configuration is via environment variables. See `backend/.env.example` and `frontend/.env.example`.

### Backend (`backend/.env`)

| Variable                    | Description                                  | Required |
|-----------------------------|----------------------------------------------|----------|
| `MONGODB_URI`               | MongoDB connection string                    | Yes      |
| `JWT_SECRET_KEY`            | Secret for JWT token signing                 | Yes      |
| `FLASK_SECRET_KEY`          | Flask session secret                         | Yes      |
| `FLASK_ENV`                 | `development` or `production`                | Yes      |
| `FLASK_DEBUG`               | `True` or `False`                            | Yes      |
| `PORT`                      | Backend port (default: 5000)                 | No       |
| `JWT_ACCESS_TOKEN_EXPIRES`  | Token expiry in seconds (default: 86400)     | No       |
| `GROQ_API_KEY`              | Groq API key for AI chatbot                  | Yes      |
| `SARVAM_API_KEY`            | Sarvam AI key for voice/translation          | No       |
| `WHATSAPP_TOKEN`            | Meta WhatsApp Business API token             | No       |
| `PHONE_NUMBER_ID`           | WhatsApp phone number ID                     | No       |
| `VERIFY_TOKEN`              | WhatsApp webhook verify token                | No       |

### Frontend (`frontend/.env`)

| Variable            | Description                               | Required |
|---------------------|-------------------------------------------|----------|
| `VITE_API_BASE`     | Backend API URL (default: localhost:5000)  | No       |
| `VITE_SOCKET_URL`   | Socket.IO URL (default: localhost:5000)    | No       |

---

## Architecture

```
Client (React SPA)
    │
    ├── REST API ───► Flask Backend ───► MongoDB
    │                      │
    └── Socket.IO ─────────┘ (real-time events)
    
    WhatsApp ──► Webhook ──► Flask ──► Sarvam AI (voice) ──► Booking Engine
```

### Backend Architecture (Clean Layers)

```
routes/          → HTTP endpoint definitions (Blueprint)
controllers/     → Business logic (auth, signup, profile)
services/        → Domain services (appointments, chat, AI, voice, WhatsApp)
models/          → Data models and schemas
middleware/      → Error handlers, request processing
config/          → Centralized configuration (settings.py)
scripts/         → Admin setup, seed data, health checks
migrations/      → Database migration scripts
```

### Frontend Architecture

```
pages/           → Full page components (Login, Dashboards)
components/      → Reusable UI components (modals, cards, forms)
services/        → API service layer (taskService)
hooks/           → Custom React hooks (useSocket, useRealtimeEvents)
context/         → React context providers (ThemeContext)
utils/           → API client, auth helpers, formatters
```

---

## Folder Structure

```
Hospital/
├── backend/
│   ├── app.py                  # Flask entry point
│   ├── auth.py                 # Auth decorators & credential validators
│   ├── mongodb_config.py       # Singleton MongoDB connection & all DB methods
│   ├── ai_service.py           # Groq LLM integration for appointments
│   ├── logger_config.py        # Logging configuration
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment template
│   ├── config/
│   │   └── settings.py         # Centralized config from env vars
│   ├── controllers/
│   │   └── auth_controller.py  # Login, signup, profile logic
│   ├── middleware/
│   │   └── error_handler.py    # Global error handling
│   ├── models/
│   │   ├── user_models.py      # User, Doctor, Nurse, Patient, SuperAdmin
│   │   ├── vendor_models.py    # Vendor, Inventory, PurchaseRequest, etc.
│   │   └── appointment_models.py
│   ├── routes/
│   │   ├── admin_routes.py
│   │   ├── doctor_routes.py
│   │   ├── nurse_routes.py
│   │   ├── patient_routes.py
│   │   ├── vendor_routes.py
│   │   ├── procurement_routes.py
│   │   ├── chat_routes.py
│   │   └── whatsapp_routes.py
│   ├── services/
│   │   ├── socket_service.py       # Real-time Socket.IO events
│   │   ├── appointment_service.py  # Appointment booking logic
│   │   ├── booking_flow.py         # WhatsApp booking state machine
│   │   ├── chatbot.py              # AI chatbot (Groq)
│   │   ├── doctor_service.py
│   │   ├── patient_service.py
│   │   ├── groq_client.py          # Groq API client singleton
│   │   ├── sarvam_service.py       # Sarvam AI voice/translation
│   │   ├── whatsapp_service.py     # WhatsApp Cloud API integration
│   │   ├── notification_service.py
│   │   ├── report_builder.py       # Structured report from transcription
│   │   ├── speech_to_text.py       # STT recording
│   │   ├── local_voice_service.py  # Local Whisper + MMS TTS
│   │   ├── scheduler.py            # AI task-to-nurse assignment
│   │   ├── task_generator.py       # Care plan → tasks
│   │   ├── task_service.py
│   │   └── prompts.py              # LLM prompt templates
│   ├── scripts/
│   │   ├── setup_admin.py          # Create initial Super Admin
│   │   ├── db_utils.py             # Database utilities
│   │   ├── seed_whatsapp_data.py   # Seed WhatsApp services/holidays
│   │   └── system_health_check.py  # Production health check
│   ├── migrations/
│   │   └── migrate_users.py        # User data migration
│   └── uploads/                    # User-uploaded files
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   ├── .env.example
│   ├── public/
│   └── src/
│       ├── App.jsx                 # Router & protected routes
│       ├── main.jsx                # React entry point
│       ├── App.css
│       ├── index.css
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── DoctorDashboard.jsx
│       │   ├── NurseDashboard.jsx
│       │   ├── PatientDashboard.jsx
│       │   ├── SuperAdminDashboard.jsx
│       │   ├── VendorDashboard.jsx
│       │   ├── VendorLogin.jsx
│       │   ├── VendorRequests.jsx
│       │   ├── DoctorSignup.jsx
│       │   ├── NurseSignup.jsx
│       │   ├── PatientSignup.jsx
│       │   ├── SuperAdminSignup.jsx
│       │   └── VendorSignup.jsx
│       ├── components/
│       │   ├── BookAppointment.jsx
│       │   ├── ChatInterface.jsx
│       │   ├── DoctorScheduleManager.jsx
│       │   ├── HandoffFormModal.jsx
│       │   ├── Notification.jsx
│       │   ├── PatientEditModal.jsx
│       │   ├── PatientsVitalsModal.jsx
│       │   ├── ProfileModal.jsx
│       │   ├── RecordingModal.jsx
│       │   ├── SocketChatRoom.jsx
│       │   ├── TaskCard.jsx
│       │   ├── ThemeToggle.jsx
│       │   ├── ViewHandoffModal.jsx
│       │   └── procurement/
│       │       ├── InventoryPanel.jsx
│       │       ├── ProcurementPanel.jsx
│       │       └── RequestItemModal.jsx
│       ├── services/
│       │   └── taskService.js
│       ├── hooks/
│       │   ├── useSocket.js
│       │   └── useRealtimeEvents.js
│       ├── context/
│       │   └── ThemeContext.jsx
│       ├── utils/
│       │   └── api.js              # API client, auth, socket helpers
│       └── assets/
│
├── .gitignore
└── README.md
```

---

## Database

The system uses **two MongoDB databases** on the same server:

| Database          | Purpose                                         |
|-------------------|--------------------------------------------------|
| `healthcare_db`   | Clinical & profile data (patients, doctors, nurses, admins, handoffs, care plans, meals) |
| `nurse_handoff_db`| Operational data (tasks, appointments, schedules, vendors, procurement, chat, WhatsApp) |

All database access is centralized in `backend/mongodb_config.py` via the `MongoDatabase` singleton class. Indexes are created automatically on startup.

---

## User Roles

| Role          | Dashboard             | Key Features                                    |
|---------------|-----------------------|--------------------------------------------------|
| **Super Admin** | `/admin-dashboard`    | System stats, user management, procurement, vendor approval |
| **Doctor**      | `/doctor-dashboard`   | Care plans, tasks, appointments, nurse oversight |
| **Nurse**       | `/nurse-dashboard`    | Task list, handoff recording, patient management |
| **Patient**     | `/patient-dashboard`  | Appointments, health data, AI chatbot            |
| **Vendor**      | `/vendor-dashboard`   | RFQs, quotations, purchase orders, chat          |

---

## Features

1. **Voice-to-Structured Handoff Reports** — Nurses dictate handoffs; AI creates structured clinical documents
2. **Care Plan & Auto-Task Assignment** — Doctors define care plans; system distributes tasks to nurses by shift/workload
3. **Multi-Channel Appointment Booking** — Book via web portal, WhatsApp (voice/text), or through nurses
4. **WhatsApp Conversational Bot** — Full appointment booking in 5 languages via WhatsApp
5. **Procurement & Inventory** — End-to-end: request → approve → quote → order → deliver
6. **Vendor Chat** — Real-time messaging between hospital staff and suppliers
7. **AI Chatbot** — Context-aware assistant for patient queries and handoff questions
8. **Real-Time Notifications** — Socket.IO push updates for all role-specific events
9. **Department Budget Tracking** — Monitor spending per department
10. **Multilingual Voice Support** — Telugu, Hindi, Urdu, Kannada, English
