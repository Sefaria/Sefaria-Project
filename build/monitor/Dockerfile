FROM python:2.7

COPY . /app/
WORKDIR /app/
# rm -rf /app/.git \

RUN mkdir /app/log \
 && chmod 777 /app/log \
 && ln -s /settings/local_settings.py /app/sefaria/local_settings.py

WORKDIR /app/
RUN pip install -r requirements.txt \
  && cp -R ./locale/en/LC_MESSAGES/ /usr/local/lib/python2.7/site-packages/django/conf/locale/en

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

CMD ["python", "multiserver-monitor.py"]
