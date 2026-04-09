#!/bin/bash
# ═══════════════════════════════════════
#  Hospital Management System - Start
#  Starts both backend and frontend
# ═══════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Hospital Management System..."
echo ""

# Start Backend
echo "[1/2] Starting Backend..."
cd "$SCRIPT_DIR/backend"

if [ ! -d "venv" ]; then
    echo "[!] Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

python3 app.py &
BACKEND_PID=$!
echo "[OK] Backend starting (PID: $BACKEND_PID) on port 5000."

# Start Frontend
echo "[2/2] Starting Frontend..."
cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "[!] Installing frontend dependencies..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "[OK] Frontend starting (PID: $FRONTEND_PID) on port 3000."

echo ""
echo "═══════════════════════════════════════"
echo " Backend:  http://localhost:5000"
echo " Frontend: http://localhost:3000"
echo "═══════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
