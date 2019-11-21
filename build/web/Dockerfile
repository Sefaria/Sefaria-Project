# this entire script is dependent on callig form the root directory.
# Check into the best practices around this. 

FROM sefaria-web-base:python3-test
# This base image already has mod_wsgi and the requirements file. 
# maybe update the base file to NOT install the requirements.txt packages

# Q: Does COPY create a directory

RUN mkdir -p /app/log && mkdir -p /app/sefaria
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

COPY . /app/
COPY ./build/web/wsgi.whiskey /app/.whiskey 

WORKDIR /app/
RUN pip3 install -r requirements.txt


# Use "COPY --chown" to minimize the repetitive noise below
# RUN rm -rf /app/log \
#  && mkdir -p /app/log && mkdir -p /app/sefaria \
#  && chmod 777 /app/log \
#  && ln -sf /settings/local_settings.py /app/sefaria/local_settings.py


# This copy should work wherever the 'docker build' command is executed

# requirements are installed on wsgi-re2, this tries to cover the case where requirements differ in this commit.
# In practice, differing requirements don't install cleanly
# RUN pip install -r requirements.txt \
#   && chown -R whiskey /app

#RUN python manage.py collectstatic --noinput
