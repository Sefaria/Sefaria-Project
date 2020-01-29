# Descended from python3
FROM gcr.io/production-deployment/pyre2:3e01eba

COPY ./requirements.txt ./
COPY . /app/
COPY ./build/node/local_settings.json /app/node/local_settings.json
RUN mkdir -p /app/log && mkdir -p /app/sefaria && touch /app/dev-db.sqlite

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings
WORKDIR /app/

RUN apt-get update && apt-get install --yes npm  && apt-get clean
RUN pip3 install --no-cache-dir -r ./requirements.txt
RUN npm install && npm run build-prod
RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80

## TODO:
# * Separate this container into separate `build` and `run` containers, only preserving the latter
# * when slimming down the containers, create a smaller monitor-only container, without npm
