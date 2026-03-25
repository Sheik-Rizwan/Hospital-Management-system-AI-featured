# Hospital Management & AI-Featured System

AI-powered hospital management system with voice handoffs, automated care plans, and a multilingual WhatsApp booking engine.

## ✨ Features

1. **Voice-to-Structured Handoff Reports** — Nurses dictate handoffs; AI creates structured clinical documents.
2. **Care Plan & Auto-Task Assignment** — Doctors define care plans; the system automatically distributes tasks to nurses by shift/workload.
3. **WhatsApp Conversational Bot** — Full appointment booking in 5 languages using AI voice and text models.
4. **Multi-Channel Appointment Booking** — Book via web portal, WhatsApp, or through internal staff.
5. **Procurement & Inventory** — End-to-end request, approve, quote, order, and delivery pipeline.
6. **Vendor Chat** — Real-time Socket.IO messaging between hospital procurement staff and suppliers.
7. **AI Chatbot** — Context-aware assistant for patient queries and clinical handoff questions.
8. **Real-Time Notifications** — Push updates for all role-specific events across the hospital.
9. **Department Budget Tracking** — Monitor spending and analytics per department.
10. **Multilingual Support** — Native integration for Telugu, Hindi, Urdu, Kannada, and English.

## 🛠️ Tech Stack

* **Frontend:** React 19, Vite, Material UI (MUI), Tailwind CSS, Socket.IO Client
* **Backend:** Python / Flask, Flask-JWT-Extended, Flask-SocketIO, Gunicorn, Eventlet
* **Database:** MongoDB (PyMongo)
* **AI / NLP:** Groq (LLaMA 3.3 70B), Sarvam AI (Voice & Translation)
* **Auth:** JWT with bcrypt

---

## 🚀 Quick Start with Docker (Recommended)

The easiest way to run the entire stack (Database, Backend API, and Frontend web server) is by using Docker.

### Prerequisites
* [Docker](https://docs.docker.com/get-docker/) installed and running.
* [Docker Compose](https://docs.docker.com/compose/install/) installed.

### 1. Configure Environment Variables
You need to copy the example environment file for the backend and fill in any required API keys (like `GROQ_API_KEY` or `JWT_SECRET_KEY`). By default, the database URI will automatically route to the Docker Mongo instance.
```bash
cp backend/.env.example backend/.env
```

### 2. Run the Application
From the root folder where `docker-compose.yml` is located, build and run the services:
```bash
docker compose up --build -d
```

For global/remote deployment, point the frontend to your public backend host when building:
```bash
VITE_API_BASE=https://api.example.com/api VITE_SOCKET_URL=https://api.example.com docker compose up --build -d
```

* **Frontend App:** [http://localhost:3000](http://localhost:3000)
* **Backend API:** [http://localhost:5000](http://localhost:5000)
* **Database:** `localhost:27017`

To view logs:
```bash
docker compose logs -f
```

---

## 💻 Manual Setup (Without Docker)

### 1. Local Database
Ensure you have **MongoDB 6+** running locally on port `27017`.

### 2. Backend Setup
Requires **Python 3.10+**.
```bash
cd backend
python -m venv venv

# Activate virtual environment
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Mac/Linux

pip install -r requirements.txt
cp .env.example .env

# Generate initial Super Admin account
python scripts/setup_admin.py

# Start the Flask server
python app.py
```

### 3. Frontend Setup
Requires **Node.js 18+**.
```bash
cd frontend
npm install
npm run dev
```

---

## 📦 Pushing to GitHub / GitLab

To push this fresh project to your own repository, simply initialize Git and push:

```bash
git init
git add .
git commit -m "Initial commit: Hospital Management System"
git branch -M main
git remote add origin https://github.com/your-username/your-repository-name.git
git push -u origin main
```
