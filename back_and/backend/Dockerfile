# Server-only container image for Azure App Service.
#
# Build context must be the backend/ directory:
#   docker build -t smart-eye-server -f backend/Dockerfile backend/
#
# The GitHub Actions workflow sets context: ./backend automatically.

FROM python:3.11-slim

# opencv-python-headless requires libglib2.0-0 on Debian slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server-only dependencies first — separate layer for better caching
COPY requirements.server.txt .
RUN pip install --no-cache-dir -r requirements.server.txt

# Copy server source code
COPY . .

# Azure App Service injects PORT at runtime via environment variable.
# wsgi.py -> config.py reads it with: int(os.environ.get("PORT", 8000))
EXPOSE 8000

CMD ["sh", "-c", "gunicorn --worker-class gthread --threads 8 -w 1 --timeout 120 --bind 0.0.0.0:${PORT:-8000} wsgi:app"]
