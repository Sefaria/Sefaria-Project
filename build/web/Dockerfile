# Descended from python3
FROM gcr.io/production-deployment/pyre2:20201028

# Django Environment Variables
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# NodeJS Environment variables
ENV DJANGO_HOST web
ENV DJANGO_PORT 80
ENV NODEJS_PORT 3000
ENV DEBUG       false

RUN mkdir -p /app/log && mkdir -p /app/sefaria && mkdir -p /log
RUN apt-get update && apt-get install --yes npm varnish && apt-get clean

# Copied separately to allow for caching of the `pip install` build step
COPY ./requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt --use-feature=2020-resolver

COPY . /app/
WORKDIR /app/

RUN npm install --unsafe-perm && npm run build-prod
RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80

## TODO:
# * Separate this container into separate `build` and `run` containers, only preserving the latter
# * when slimming down the containers, create a smaller monitor-only container, without npm
