FROM gcr.io/production-deployment/wsgi-re2

RUN rm -rf /app
COPY . /app/
WORKDIR /app/
# rm -rf /app/.git

RUN mkdir /app/log \
 && chmod 777 /app/log \
 && ln -s /settings/local_settings.py /app/sefaria/local_settings.py

COPY build/web/wsgi.whiskey /app/.whiskey

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# requirements are installed on wsgi-re2, this covers the case where requirements differ in this commit.
RUN pip install -r requirements.txt \
  && cp -R ./locale/en/LC_MESSAGES/ /usr/local/python/lib/python2.7/site-packages/django/conf/locale/en \
  && chown -R whiskey /app
