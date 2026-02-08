FROM python:3.11-slim

LABEL org.opencontainers.image.source="https://github.com/Sefaria/Sefaria-Project"
LABEL org.opencontainers.image.description="Braintrust automation scripts for log backup and dataset tagging"

COPY requirements-braintrust.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

RUN useradd --create-home --shell /bin/bash braintrust
USER braintrust

WORKDIR /app

COPY scripts/scheduled/braintrust_backup_logs.py /app/scripts/braintrust_backup_logs.py
COPY scripts/scheduled/braintrust_tag_and_push.py /app/scripts/braintrust_tag_and_push.py

RUN mkdir -p /app/shared

ENTRYPOINT ["python"]
