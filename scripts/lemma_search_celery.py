"""Dedicated CPU Celery worker using the existing Sefaria Redis/Sentinel wiring."""
from functools import lru_cache
import json
import os
from pathlib import Path
from celery import Celery
from sefaria.celery_setup.generate_config import RedisConfig, SentinelConfig, generate_config
from scripts.lemma_search_worker import Engine, validate
from scripts.lemma_search_transport import validate_target, transport

QUEUE = os.environ["LEMMA_SEARCH_QUEUE"]
if not QUEUE.endswith("-lemma-search"):
    raise ValueError("Use an environment-specific -lemma-search queue")
redis = RedisConfig(os.getenv("REDIS_URL", ""), os.getenv("REDIS_PASSWORD", ""),
                    os.getenv("REDIS_PORT", "26379"), os.environ["CELERY_REDIS_BROKER_DB_NUM"],
                    os.environ["CELERY_REDIS_RESULT_BACKEND_DB_NUM"])
sentinel = SentinelConfig(os.getenv("SENTINEL_HEADLESS_URL", ""), os.getenv("SENTINEL_PASSWORD", ""),
                          redis.port, json.loads(os.getenv("SENTINEL_TRANSPORT_OPTS", "{}")))
app = Celery("lemma_search")
app.conf.update(**generate_config(redis,sentinel), result_expires=1800,
                task_default_queue=QUEUE, worker_prefetch_multiplier=1,
                task_serializer="json", result_serializer="json", accept_content=["json"],
                task_track_started=True, broker_connection_retry_on_startup=True)


@lru_cache(maxsize=1)
def engine():
    url=os.environ["LEMMA_SEARCH_ES_URL"].rstrip("/")
    index=os.environ["LEMMA_SEARCH_INDEX"]
    validate_target(url,index,os.environ["LEMMA_SEARCH_ES_ALLOWED_HOSTS"].split(","))
    request=transport(url,os.getenv("ELASTIC_USERNAME",""),os.getenv("ELASTIC_PASSWORD",""))
    return Engine(Path(os.environ.get("LEMMA_SEARCH_RESEARCH_ROOT","/opt/lemma/research")),
                  url,index,"cpu",request_fn=request)


@app.task(name="lemma_search.compare", soft_time_limit=180, time_limit=210)
def compare(payload, expected_index):
    if expected_index != os.environ["LEMMA_SEARCH_INDEX"]:
        raise ValueError("Web/worker experiment index mismatch")
    return engine().compare(*validate(payload))
