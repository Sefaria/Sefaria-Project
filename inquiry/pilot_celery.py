"""Local atlas worker, isolated from the application's normal task queue."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "inquiry.pilot_settings")
from celery import Celery
app = Celery("inquiry_atlas", broker=os.environ.get("INQUIRY_ATLAS_BROKER", "redis://127.0.0.1:6379/12"))
app.conf.update(imports=["inquiry.tasks"], task_default_queue="inquiry-atlas-local",
    beat_schedule={"inquiry-live-atlas": {"task": "inquiry.refresh_activity", "schedule": 5.0, "options": {"expires": 4}}})
