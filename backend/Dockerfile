# Use a lightweight Python base image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies (needed for gevent/eventlet C extensions and general compilation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn eventlet

# Copy application code
COPY . .

# Create uploads and logs directories just in case they are missing
RUN mkdir -p uploads logs

# Expose port
EXPOSE 5000

# Start Gunicorn with eventlet for Flask-SocketIO compatibility
CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", "-b", "0.0.0.0:5000", "app:app"]
