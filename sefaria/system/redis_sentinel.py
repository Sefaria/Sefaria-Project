"""
Shared Redis / Redis Sentinel connection helpers, used by Celery (sefaria/celery_setup),
Django's CACHES, and GenCache (sefaria/system/cache.py).

When SENTINEL_HEADLESS_URL is set, clients find the current master through Sentinel;
otherwise (local dev) they connect to a single plain Redis at REDIS_URL/REDIS_PORT.
"""
import re
from dataclasses import dataclass
from typing import Optional

import redis
import redis.sentinel


@dataclass
class SentinelConfig:
    url: str
    password: str
    port: str
    transport_opts: dict  # Celery/kombu transport options only; not valid redis-py kwargs
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

    @property
    def host(self) -> str:
        return self.url.replace("redis://", "")


def add_db_num_to_url(url, port, db_num):
    return url.replace(f':{port}', f':{port}/{db_num}')


def add_password_to_url(url, password):
    if not password:
        return url
    return re.sub(r'((?:redis|sentinel)://)', fr'\1:{password}@', url)


def get_sentinel_host_ports(url, port) -> list:
    """
    The Sentinel endpoint as a single (hostname, port), deliberately not resolved here.
    redis-py resolves the hostname on every new connection and tries each address the
    headless Service returns, so Sentinel pods that restart with new IPs are picked up
    without a refresh loop or a process restart.
    """
    return [(url, int(port))]


def get_sentinel_joined_address(url, port, password):
    """
    Same as get_sentinel_host_ports(), as the ";"-joined sentinel:// URL list Celery expects.
    """
    return ";".join(
        add_password_to_url(f"sentinel://{host}:{host_port}", password)
        for host, host_port in get_sentinel_host_ports(url, port)
    )


def _sentinel_kwargs(sentinel_config: SentinelConfig) -> dict:
    # short connect timeout so a dead pod's address is skipped quickly
    return {"password": sentinel_config.password, "socket_connect_timeout": 1}


def get_redis_client(redis_config: RedisConfig, sentinel_config: Optional[SentinelConfig], db_num, **client_kwargs) -> redis.Redis:
    """
    A redis-py client for the current Sentinel master (or the plain Redis instance when
    Sentinel isn't configured). master_for() re-asks Sentinel for the master on each new
    connection, so failovers are handled by the client.
    """
    if sentinel_config is not None and sentinel_config.is_configured():
        sentinel = redis.sentinel.Sentinel(
            get_sentinel_host_ports(sentinel_config.url, sentinel_config.port),
            sentinel_kwargs=_sentinel_kwargs(sentinel_config),
        )
        return sentinel.master_for(
            sentinel_config.master_set, password=redis_config.password, db=db_num, **client_kwargs
        )
    return redis.Redis(
        host=redis_config.host, port=int(redis_config.port),
        password=redis_config.password, db=db_num, **client_kwargs
    )


def get_django_redis_cache_options(redis_config: RedisConfig, sentinel_config: Optional[SentinelConfig], db_num) -> tuple:
    """
    Returns (LOCATION, OPTIONS) for a django-redis CACHES entry, pointed at Sentinel when
    configured, otherwise at the plain Redis instance.
    """
    if sentinel_config is not None and sentinel_config.is_configured():
        location = f"redis://{sentinel_config.master_set}/{db_num}"  # django-redis reads the host as the Sentinel service name
        options = {
            "CLIENT_CLASS": "django_redis.client.sentinel.SentinelClient",
            "CONNECTION_FACTORY": "django_redis.pool.SentinelConnectionFactory",
            "SENTINELS": get_sentinel_host_ports(sentinel_config.url, sentinel_config.port),
            "SENTINEL_KWARGS": _sentinel_kwargs(sentinel_config),
            "CONNECTION_POOL_KWARGS": {"password": redis_config.password},
        }
        return location, options

    location = f"redis://{redis_config.host}:{redis_config.port}/{db_num}"
    options = {"CLIENT_CLASS": "django_redis.client.DefaultClient"}
    if redis_config.password:
        options["PASSWORD"] = redis_config.password
    return location, options
