@echo off
REM ═══════════════════════════════════════
REM  Hospital Management System - Start
REM  Starts both backend and frontend
REM ═══════════════════════════════════════

echo Starting Hospital Management System...
echo.

REM Check MongoDB
echo [1/3] Checking MongoDB...
mongosh --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] MongoDB not running. Starting mongod...
    start /B mongod --dbpath "%~dp0backend\mongo-data" --bind_ip 127.0.0.1
    timeout /t 3 /nobreak >nul
)
echo [OK] MongoDB ready.

REM Start Backend
echo [2/3] Starting Backend...
cd "%~dp0backend"
if not exist venv (
    echo [!] Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)
start "Hospital-Backend" cmd /c "venv\Scripts\activate && python app.py"
echo [OK] Backend starting on port 5000.

REM Start Frontend
echo [3/3] Starting Frontend...
cd "%~dp0frontend"
if not exist node_modules (
    echo [!] Installing frontend dependencies...
    npm install
)
start "Hospital-Frontend" cmd /c "npm run dev"
echo [OK] Frontend starting on port 3000.

echo.
echo ═══════════════════════════════════════
echo  Backend:  http://localhost:5000
echo  Frontend: http://localhost:3000
echo ═══════════════════════════════════════
echo.
pause
