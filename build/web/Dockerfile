FROM python:2.7 as repo
RUN git clone --depth=1 --branch=multiserver https://github.com/Sefaria/Sefaria-Project.git /app \
 && rm -rf /app/.git \
 && mkdir /app/log \
 && chmod 777 /app/log \
 && ln -s /settings/local_settings.py /app/sefaria/local_settings.py


FROM node:latest as node
RUN mkdir /app
WORKDIR /app/
COPY --from=repo /app /app
RUN npm install \
  && cp ./node/local_settings_example.json ./node/local_settings.json \
  && npm run build


FROM gcr.io/production-deployment/wsgi-re2
RUN rm -rf /app
COPY --from=node /app /app
WORKDIR /app/
COPY wsgi.whiskey /app/.whiskey
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings
RUN pip install -r requirements.txt \
  && cp -R ./locale/en/LC_MESSAGES/ /usr/local/python/lib/python2.7/site-packages/django/conf/locale/en \
  && chown -R whiskey /app
