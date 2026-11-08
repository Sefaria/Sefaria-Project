from enum import Enum

from sefaria.celery_setup.generate_config import generate_config
from sefaria.settings import (
    CELERY_QUEUES,
    CELERY_REDIS_BROKER_DB_NUM,
    CELERY_REDIS_RESULT_BACKEND_DB_NUM,
    REDIS_PASSWORD,
    REDIS_PORT,
    REDIS_URL,
    SENTINEL_HEADLESS_URL,
    SENTINEL_MASTER_SET,
    SENTINEL_PASSWORD,
    SENTINEL_TRANSPORT_OPTS,
)
from sefaria.system.redis_sentinel import RedisConfig, SentinelConfig


class CeleryQueue(Enum):
    TASKS = CELERY_QUEUES.get("tasks", "TASK QUEUE UNDEFINED")
    LLM = CELERY_QUEUES.get("llm", "LLM QUEUE UNDEFINED")
    # Interactive find-refs API requests get their own queue so bulk linking jobs can't starve them.
    # Falls back to the shared tasks queue in environments that don't run dedicated find-refs workers.
    FIND_REFS = CELERY_QUEUES.get("findRefs") or CELERY_QUEUES.get("tasks", "TASK QUEUE UNDEFINED")


def generate_config_from_env() -> tuple[dict, RedisConfig, SentinelConfig]:
    redis_config = RedisConfig(
        REDIS_URL, REDIS_PASSWORD, REDIS_PORT, CELERY_REDIS_BROKER_DB_NUM, CELERY_REDIS_RESULT_BACKEND_DB_NUM
    )
    sentinel_config = SentinelConfig(
        SENTINEL_HEADLESS_URL, SENTINEL_PASSWORD, REDIS_PORT, SENTINEL_TRANSPORT_OPTS, SENTINEL_MASTER_SET
    )
    return generate_config(redis_config, sentinel_config), redis_config, sentinel_config
