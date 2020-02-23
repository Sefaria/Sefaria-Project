# Descended from python3
FROM gcr.io/production-deployment/pyre2:3e01eba

# Django Environment Variables
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# NodeJS Environment variables
ENV DJANGO_HOST web
ENV DJANGO_PORT 80
ENV NODEJS_PORT 3000
ENV DEBUG       false

COPY . /app/
WORKDIR /app/
RUN mkdir -p /app/log && mkdir -p /app/sefaria && touch /app/dev-db.sqlite

RUN apt-get update && apt-get install --yes npm  && apt-get clean
RUN pip3 install --no-cache-dir -r /app/requirements.txt
RUN npm install && npm run build-prod
RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80

## TODO:
# * Separate this container into separate `build` and `run` containers, only preserving the latter
# * when slimming down the containers, create a smaller monitor-only container, without npm
