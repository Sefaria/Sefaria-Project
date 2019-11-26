# this entire script is dependent on callig form the root directory.
# Check into the best practices around this. 

FROM sefaria-web-base:python3-test
# This base image already has mod_wsgi and the requirements file. 
# maybe update the base file to NOT install the requirements.txt packages

# Q: Does COPY create a directory

RUN mkdir -p /app/log && mkdir -p /app/sefaria && touch /app/dev-db.sqlite
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

COPY . /app/
COPY ./build/web/wsgi.whiskey /app/.whiskey 

WORKDIR /app/
RUN pip3 install -r requirements.txt
EXPOSE 8000

