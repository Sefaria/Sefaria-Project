# Source: python3-dockerfiles

FROM python:3.7-buster

COPY ./requirements.txt ./
COPY . /app/
COPY ./build/node/local_settings.json /app/node/local_settings.json
RUN mkdir -p /app/log && mkdir -p /app/sefaria && touch /app/dev-db.sqlite

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings
WORKDIR /app/


RUN apt-get update && apt-get install --yes apache2 apache2-dev libapache2-mod-wsgi-py3 npm  && apt-get clean
RUN pip3 install --no-cache-dir -r ./requirements.txt
RUN git clone https://code.googlesource.com/re2 && cd re2 && make && make install && cd / && pip3 install https://github.com/andreasvc/pyre2/archive/master.zip
RUN npm install && npm run build-prod
RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80

## TODO:
# * Separate this container into separate `build` and `run` containers, only preserving the latter
# * when slimming down the containers, create a smaller monitor-only container, without npm
