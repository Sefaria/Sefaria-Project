FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.9-bullseye

WORKDIR /app/

# Install requirements and Flower
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt flower redis

# Install flower==2.0.1
RUN pip3 install flower==2.0.1

# Copy the entire sefaria app
COPY sefaria /app/sefaria

# Set environment variables
ENV DJANGO_SETTINGS_MODULE=sefaria.settings
ENV C_FORCE_ROOT=true

EXPOSE 5555

CMD ["flower", "-A", "sefaria.celery_setup.app", "--port=5555", "--address=0.0.0.0"]