# Descended from python3
FROM pyre2:0.0
# gcr.io/production-deployment/pyre2:3e01eba
ARG DEBUG=false

# Django Environment Variables
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# NodeJS Environment variables
ENV DJANGO_HOST web
ENV DJANGO_PORT 80
ENV NODEJS_PORT 3000
ENV DEBUG       $DEBUG

COPY . /app/
WORKDIR /app/
RUN mkdir -p /app/log && mkdir -p /app/sefaria && mkdir -p /log && touch /app/dev-db.sqlite

RUN apt-get update && apt-get install --yes npm varnish && apt-get clean  &&  apt-get install --yes gettext
RUN pip3 install --no-cache-dir -r /app/requirements.txt
RUN npm install && npm run build-prod
RUN python manage.py collectstatic
RUN python manage.py makemessages

# To cache all run commands between this and the last copy
copy manage.py manage.py


ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80

## TODO:
# * Separate this container into separate `build` and `run` containers, only preserving the latter
# * when slimming down the containers, create a smaller monitor-only container, without npm
