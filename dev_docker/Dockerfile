FROM python:3.9-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ---- System build deps commonly needed by Python packages ----
# (psycopg2, mysqlclient, lxml, cryptography, Pillow, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ git curl pkg-config \
    libpq-dev \
    default-libmysqlclient-dev \
    libxml2-dev libxslt1-dev zlib1g-dev \
    libffi-dev libssl-dev \
    libjpeg62-turbo-dev libpng-dev \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# ---- Python deps first (better layer caching & earlier failure) ----
COPY requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir -r requirements.txt -vv

# ---- App code last ----
COPY . .

EXPOSE 8000

# Optional: do Node build at runtime (keeps image simple for now)
CMD ["/bin/sh","-c", "npm ci && npm run build && \
  python manage.py migrate sites && \
  python manage.py migrate && \
  python manage.py runserver 0.0.0.0:8000"]
