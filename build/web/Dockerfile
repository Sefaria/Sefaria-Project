FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.12-slim-bookworm
ARG TYPE=build-prod

# Django Environment Variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV DJANGO_SETTINGS_MODULE=sefaria.settings

# Runtime ports
ENV DJANGO_HOST=web
ENV DJANGO_PORT=80
ENV NODEJS_PORT=3000
ENV DEBUG=false

RUN apt-get update -y && apt-get install -y git npm varnish && apt-get clean
RUN mkdir -p /app/log /app/sefaria /log

WORKDIR /app/
# Copied separately to allow for caching of the `pip install` build step
COPY requirements.txt /app/requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

COPY package*.json /app/
RUN npm install --unsafe-perm

COPY ./node /app/node
COPY ./static/js /app/static/js
RUN npm run $TYPE

COPY . /app/

RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80
