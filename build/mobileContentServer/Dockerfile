FROM gcr.io/production-deployment/base-web:latest

# Django Environment Variables
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /Sefaria-Project
ENV DJANGO_SETTINGS_MODULE sefaria.settings

COPY requirements.txt /Sefaria-Project/requirements.txt
RUN pip3 install --no-cache-dir -r /Sefaria-Project/requirements.txt --use-feature=2020-resolver

COPY ./mobileContentServer/requirements.txt /MobileContentServer/requirements.txt
RUN pip3 install --no-cache-dir -r /MobileContentServer/requirements.txt

COPY . /Sefaria-Project
RUN mkdir -p /Sefaria-Project/log
COPY ./build/mobileContentServer/sefaria_local_settings.py /Sefaria-Project/sefaria/local_settings.py


COPY ./mobileContentServer /MobileContentServer
WORKDIR /MobileContentServer
COPY ./build/mobileContentServer/local_settings.py /MobileContentServer/local_settings.py

ENV FLASK_APP /MobileContentServer/DownloadServer.py
EXPOSE 80

ENTRYPOINT ["gunicorn", "--log-level", "debug", "--bind", "0.0.0.0:80", "wsgi:app"]
