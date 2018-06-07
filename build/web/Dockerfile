FROM gcr.io/production-deployment/wsgi-re2

RUN rm -rf /app
COPY . /app/
WORKDIR /app/

RUN rm -rf /app/log \
 && mkdir /app/log \
 && chmod 777 /app/log \
 && ln -sf /settings/local_settings.py /app/sefaria/local_settings.py

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

COPY build/web/wsgi.whiskey /app/.whiskey

# requirements are installed on wsgi-re2, this tries to cover the case where requirements differ in this commit.
# In practice, differing requirements don't install cleanly
RUN pip install -r requirements.txt \
  && chown -R whiskey /app

RUN python manage.y collectstatic --noinput
