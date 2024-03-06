from celery import Celery

app = Celery('sefaria')
app.config_from_object('sefaria.celery_setup.config')
app.autodiscover_tasks(packages=['sefaria.helper.llm'])
