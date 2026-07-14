FROM python:3.12-slim-bookworm


# Django Environment Variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV DJANGO_SETTINGS_MODULE=sefaria.settings

# NodeJS Environment variables
ENV DJANGO_HOST=web
ENV DJANGO_PORT=80
ENV NODEJS_PORT=3000
ENV DEBUG=false

# git + build toolchain (gcc/libc6-dev/libpq-dev) needed to build C-extensions
# (datrie, lxml, gevent, psycopg2) from source on Python 3.12 when no wheels exist.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends git npm varnish gcc libc6-dev libpq-dev curl libraqm-dev \
    && apt-get clean
RUN mkdir -p /app/log && mkdir -p /app/sefaria && mkdir -p /log
