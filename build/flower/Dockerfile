FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.9-bullseye

WORKDIR /app/

# Install requirements and Flower
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt flower redis

# Copy the entire sefaria app
COPY sefaria /app/sefaria

# Set environment variables
ENV DJANGO_SETTINGS_MODULE=sefaria.settings
ENV C_FORCE_ROOT=true
ENV PATH="/usr/local/bin:${PATH}"

EXPOSE 5555

# Use celery to run flower as recommended in the docs
CMD ["celery", "-A", "sefaria.celery_setup.app", "flower", "--port=5555", "--address=0.0.0.0", "--basic-auth=admin:password"]