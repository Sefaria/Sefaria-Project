FROM gcr.io/production-deployment/python-re2

COPY . /app/
WORKDIR /app/

RUN mkdir /log \
 && chmod 777 /log \
 && ln -s /settings/local_settings.py /app/sefaria/local_settings.py

ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings

# requirements are installed on wsgi-re2, this tries to cover the case where requirements differ in this commit.
# In practice, differing requirements don't install cleanly
RUN pip install -r requirements.txt \
  && cp -R ./locale/en/LC_MESSAGES/ /usr/local/lib/python2.7/site-packages/django/conf/locale/en


CMD ["python", "multiserver-monitor.py"]
