from sefaria.settings import (REDIS_URL, REDIS_PASSWORD, REDIS_PORT, CELERY_REDIS_BROKER_DB_NUM,
                             CELERY_REDIS_RESULT_BACKEND_DB_NUM, SENTINEL_HEADLESS_URL, SENTINEL_PASSWORD,
                             SENTINEL_TRANSPORT_OPTS, CELERY_QUEUES)
from sefaria.celery_setup.generate_config import generate_config, SentinelConfig, RedisConfig
from enum import Enum


class CeleryQueue(Enum):
    TASKS = CELERY_QUEUES.get('tasks', 'TASK QUEUE UNDEFINED')
    LLM = CELERY_QUEUES.get('llm', 'LLM QUEUE UNDEFINED')


def generate_config_from_env() -> tuple[dict, RedisConfig, SentinelConfig]:
    redis_config = RedisConfig(REDIS_URL, REDIS_PASSWORD, REDIS_PORT, CELERY_REDIS_BROKER_DB_NUM, CELERY_REDIS_RESULT_BACKEND_DB_NUM)
    sentinel_config = SentinelConfig(SENTINEL_HEADLESS_URL, SENTINEL_PASSWORD, REDIS_PORT, SENTINEL_TRANSPORT_OPTS)
    return generate_config(redis_config, sentinel_config), redis_config, sentinel_config
