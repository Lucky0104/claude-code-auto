# Production image for the Crysta IVF backend (FastAPI + Motor).
# Build context = ./backend
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# App code.
COPY . .

EXPOSE 8001

# NOTE: `emergentintegrations` (used only by legacy AI features in core/ai.py)
# is intentionally NOT installed here; the auto-comment bot does not need it.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
