import structlog
from celery import Celery
from celery.signals import setup_logging

from sefaria.celery_setup.config import generate_config_from_env
from sefaria.celery_setup.logging_config import configure_logging

logger = structlog.get_logger(__name__)

setup_logging.connect(configure_logging)

app = Celery("sefaria")
raw_config, redis_config, sentinel_config = generate_config_from_env()
app.conf.update(**raw_config, result_expires=1800)
app.autodiscover_tasks(
    packages=[
        "sefaria.helper.llm",
        "sefaria.helper.linker",
        "sefaria.helper.crm",
        "sefaria.helper.texts",
        "api",
        "webhooks",
    ]
)
