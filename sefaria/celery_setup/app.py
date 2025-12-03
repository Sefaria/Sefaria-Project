from celery import Celery
from sefaria.celery_setup.config import generate_config_from_env

app = Celery('sefaria')
raw_config, redis_config, sentinel_config = generate_config_from_env()
app.conf.update(**raw_config, result_expires=1800)
app.autodiscover_tasks(packages=['sefaria.helper.llm', 'sefaria.helper.linker'])
