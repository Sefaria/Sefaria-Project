from enum import Enum

from sefaria.celery_setup.generate_config import RedisConfig, SentinelConfig, generate_config
from sefaria.settings import (
    CELERY_QUEUES,
    CELERY_REDIS_BROKER_DB_NUM,
    CELERY_REDIS_RESULT_BACKEND_DB_NUM,
    REDIS_PASSWORD,
    REDIS_PORT,
    REDIS_URL,
    SENTINEL_HEADLESS_URL,
    SENTINEL_PASSWORD,
    SENTINEL_TRANSPORT_OPTS,
)


class CeleryQueue(Enum):
    TASKS = CELERY_QUEUES.get("tasks", "TASK QUEUE UNDEFINED")
    LLM = CELERY_QUEUES.get("llm", "LLM QUEUE UNDEFINED")


def generate_config_from_env() -> tuple[dict, RedisConfig, SentinelConfig]:
    redis_config = RedisConfig(
        REDIS_URL,
        REDIS_PASSWORD,
        REDIS_PORT,
        CELERY_REDIS_BROKER_DB_NUM,
        CELERY_REDIS_RESULT_BACKEND_DB_NUM,
    )
    sentinel_config = SentinelConfig(SENTINEL_HEADLESS_URL, SENTINEL_PASSWORD, REDIS_PORT, SENTINEL_TRANSPORT_OPTS)
    return generate_config(redis_config, sentinel_config), redis_config, sentinel_config
