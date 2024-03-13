FROM python:3.9-bullseye


# Django Environment Variables
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# NodeJS Environment variables
ENV DJANGO_HOST web
ENV DJANGO_PORT 80
ENV NODEJS_PORT 3000
ENV DEBUG       false

RUN apt-get update -y && apt-get install -y npm varnish && apt-get clean
RUN mkdir -p /app/log && mkdir -p /app/sefaria && mkdir -p /log
