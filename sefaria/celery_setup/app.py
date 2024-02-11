from celery import Celery

app = Celery('sefaria')
app.config_from_object('sefaria.celery_setup.config')

# Load task modules from all registered Django apps.
app.autodiscover_tasks(packages=['sefaria.helper.llm'])
