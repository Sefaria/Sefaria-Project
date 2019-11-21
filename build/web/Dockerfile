# Source: python3-dockerfiles

FROM python:3.7-buster

COPY ./requirements.txt ./
COPY . /app/
COPY ./build/web/wsgi.whiskey /app/.whiskey 
RUN mkdir -p /app/log && mkdir -p /app/sefaria && touch /app/dev-db.sqlite

RUN mkdir -p /app/log && mkdir -p /app/sefaria
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings
WORKDIR /app/


RUN pip3 install --no-cache-dir -r ./requirements.txt
RUN apt-get update && apt-get install --yes apache2 libapache2-mod-wsgi-py3  && apt-get clean
RUN git clone https://code.googlesource.com/re2 && cd re2 && make && make install && cd / && pip3 install https://github.com/andreasvc/pyre2/archive/master.zip

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80

## TODO:
# * Separate this container into separate `build` and `run` containers, only preserving the latter