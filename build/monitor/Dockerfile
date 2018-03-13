FROM gcr.io/production-deployment/python-re2

COPY . /app/
WORKDIR /app/
# rm -rf /app/.git \

RUN mkdir /app/log \
 && chmod 777 /app/log \
 && ln -s /settings/local_settings.py /app/sefaria/local_settings.py

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# requirements are installed on python-re2, this covers the case where requirements differ in this commit.
RUN pip install -r requirements.txt \
  && cp -R ./locale/en/LC_MESSAGES/ /usr/local/lib/python2.7/site-packages/django/conf/locale/en


CMD ["python", "multiserver-monitor.py"]
