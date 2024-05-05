from celery import Celery
from sefaria.celery_setup.config import generate_config_from_env

app = Celery('sefaria')
app.conf.update(**generate_config_from_env())
app.autodiscover_tasks(packages=['sefaria.helper.llm'])
