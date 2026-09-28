FROM python:3.12-slim

WORKDIR /app

# Instalar librerías de sistema para compilación, ReportLab, Pillow y utilidades
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# 1) Tareas de arranque una sola vez (tablas, migraciones, seeders)
# 2) Uvicorn con varios workers: un pedido pesado ya no bloquea al resto de usuarios
ENV RUN_STARTUP_TASKS=false
CMD ["sh", "-c", "RUN_STARTUP_TASKS=true python prestart.py && exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2}"]
