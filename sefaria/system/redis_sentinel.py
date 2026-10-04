"""
Shared Redis / Redis Sentinel connection helpers.

Originally lived only in sefaria/celery_setup/generate_config.py (itself "a direct copy of
the same file in the LLM repo"), used solely to build a Celery broker/result-backend URL.
Pulled out here so it has no Celery import and can be reused by anything else that needs to
reach the same Sentinel cluster: GenCache's own redis client and Django's CACHES backend
(see sefaria/system/cache.py and the GenCache migration decision record).

A process reaches this Sentinel cluster the same way regardless of what it wants from it:
resolve the Sentinel headless Service's current pod IPs over DNS (they change across
restarts, so this can't be cached once), then ask Sentinel which pod is currently master.
When SENTINEL_HEADLESS_URL isn't configured (e.g. local dev, which has no Sentinel), callers
fall back to a single plain Redis instance instead.
"""
import re
from dataclasses import dataclass
from time import sleep
from threading import Thread
from typing import Optional

import dns.resolver
import redis
import redis.sentinel
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class SentinelConfig:
    url: str
    password: str
    port: str
    transport_opts: dict
    master_set: str = "mymaster"

    def is_configured(self) -> bool:
        """
        Return True if this config has the data it needs to connect to Sentinel
        :return:
        """
        return bool(self.url)


@dataclass
class RedisConfig:
    url: str
    password: str
    port: str
    broker_db_num: Optional[str] = None
    result_backend_db_num: Optional[str] = None


def add_db_num_to_url(url, port, db_num):
    return url.replace(f':{port}', f':{port}/{db_num}')


def add_password_to_url(url, password):
    if not password:
        return url
    return re.sub(r'((?:redis|sentinel)://)', fr'\1:{password}@', url)


def get_sentinel_joined_address(url, port, password):
    redisdns = dns.resolver.resolve(url, 'A')
    addressstring = []
    for res in redisdns.response.answer:
        for item in res.items:
            curr_redis_url = f"sentinel://{item.to_text()}:{port}"
            curr_redis_url = add_password_to_url(curr_redis_url, password)
            addressstring.append(curr_redis_url)
    return ";".join(addressstring)


def get_sentinel_host_ports(url, port) -> list:
    """
    Same DNS resolution as get_sentinel_joined_address(), but returned as (host, port)
    tuples -- the shape redis.sentinel.Sentinel() and django-redis's SENTINELS option want,
    rather than a Celery-style ";"-joined URL string.
    """
    redisdns = dns.resolver.resolve(url, 'A')
    return [(item.to_text(), int(port)) for res in redisdns.response.answer for item in res.items]


def dns_refresher(app, redis_config: RedisConfig, sentinel_config: SentinelConfig):
    while True:
        sleep(60)
        new_url = get_sentinel_joined_address(sentinel_config.url, sentinel_config.port, redis_config.password)
        if new_url != app.conf.broker_url:
            logger.info(f"DNS changed, updating broker list: {new_url}")
            try:
                app.conf.broker_url = new_url
            except Exception as e:
                logger.warning(f"Failed to update broker URL dynamically: {e}")


def start_background_dns_refresher(app, redis_config: RedisConfig, sentinel_config: SentinelConfig):
    Thread(target=dns_refresher, daemon=True, args=(app, redis_config, sentinel_config)).start()


def get_redis_client(redis_config: RedisConfig, sentinel_config: Optional[SentinelConfig], db_num, **client_kwargs) -> redis.Redis:
    """
    A plain redis-py client pointed at whichever store is actually configured: the Sentinel
    cluster's current master when SENTINEL_HEADLESS_URL is set, otherwise a single Redis
    instance at REDIS_URL/REDIS_PORT. Used by GenCache (sefaria/system/cache.py) for its
    generation counters -- a separate keyspace (db_num) from Django's cache or Celery's
    broker/result-backend, colocated on the same server(s).

    redis.sentinel.Sentinel.master_for() re-asks Sentinel which pod is master on each
    connection checkout rather than caching an address, so a failover is handled by the
    client itself -- this does not need its own DNS-refresh loop the way the Celery broker
    URL does, since that one is a static string handed to a different library's transport.
    """
    if sentinel_config is not None and sentinel_config.is_configured():
        sentinel_hosts = get_sentinel_host_ports(sentinel_config.url, sentinel_config.port)
        sentinel = redis.sentinel.Sentinel(
            sentinel_hosts,
            sentinel_kwargs={"password": sentinel_config.password, **sentinel_config.transport_opts},
        )
        return sentinel.master_for(
            sentinel_config.master_set, password=redis_config.password, db=db_num, **client_kwargs
        )
    return redis.Redis(
        host=redis_config.url.replace("redis://", ""), port=int(redis_config.port),
        password=redis_config.password, db=db_num, **client_kwargs
    )


def get_django_redis_cache_options(redis_config: RedisConfig, sentinel_config: Optional[SentinelConfig], db_num) -> tuple:
    """
    Returns (LOCATION, OPTIONS) for a django-redis CACHES entry, pointed at Sentinel when
    configured, otherwise at the single plain Redis instance. See django_redis.client.sentinel.SentinelClient,
    which expects a "sentinel://host:port/db" LOCATION plus OPTIONS.SENTINELS/SENTINEL_KWARGS.
    """
    if sentinel_config is not None and sentinel_config.is_configured():
        sentinel_hosts = get_sentinel_host_ports(sentinel_config.url, sentinel_config.port)
        location = f"sentinel://{sentinel_config.master_set}/{db_num}"
        options = {
            "CLIENT_CLASS": "django_redis.client.sentinel.SentinelClient",
            "SENTINELS": sentinel_hosts,
            "SENTINEL_KWARGS": {"password": sentinel_config.password, **sentinel_config.transport_opts},
            "CONNECTION_POOL_KWARGS": {"password": redis_config.password},
        }
        return location, options

    host = redis_config.url.replace("redis://", "")
    location = f"redis://{host}:{redis_config.port}/{db_num}"
    options = {"CLIENT_CLASS": "django_redis.client.DefaultClient"}
    if redis_config.password:
        options["PASSWORD"] = redis_config.password
    return location, options
