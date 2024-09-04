from sefaria.settings import (REDIS_URL, REDIS_PASSWORD, REDIS_PORT, CELERY_REDIS_BROKER_DB_NUM,
                             CELERY_REDIS_RESULT_BACKEND_DB_NUM, CELERY_WORKER_CONCURRENCY, WORKER_MAX_TASKS_PER_CHILD,
                              SENTINEL_HEADLESS_URL, SENTINEL_PASSWORD, SENTINEL_TRANSPORT_OPTS)
from sefaria.celery_setup.generate_config import generate_config, SentinelConfig, RedisConfig


def generate_config_from_env():
    return generate_config(
        RedisConfig(REDIS_URL, REDIS_PASSWORD, REDIS_PORT, CELERY_REDIS_BROKER_DB_NUM,
                    CELERY_REDIS_RESULT_BACKEND_DB_NUM, CELERY_WORKER_CONCURRENCY, WORKER_MAX_TASKS_PER_CHILD),
        SentinelConfig(SENTINEL_HEADLESS_URL, SENTINEL_PASSWORD, REDIS_PORT, SENTINEL_TRANSPORT_OPTS)
    )


