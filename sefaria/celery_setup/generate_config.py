"""
Celery-specific wiring on top of sefaria.system.redis_sentinel's generic Sentinel/Redis
connection helpers: turns a (RedisConfig, SentinelConfig) pair into a Celery broker_url /
result_backend, which is a Celery-only concept (connection-string format, transport options)
that doesn't belong in the shared module.
"""
from sefaria.system.redis_sentinel import (
    SentinelConfig, RedisConfig, add_db_num_to_url, add_password_to_url,
    get_sentinel_joined_address, dns_refresher, start_background_dns_refresher,
)

__all__ = [
    "SentinelConfig", "RedisConfig", "add_db_num_to_url", "add_password_to_url",
    "get_sentinel_joined_address", "dns_refresher", "start_background_dns_refresher",
    "generate_config",
]


def generate_config(redis_config: RedisConfig, sentinel_config: SentinelConfig = None) -> dict:
    """
    :param redis_config: required, whether connecting to redis or redis sentinel, the redis config is required.
    :param sentinel_config: optional, only pass if connecting to redis sentinel
    """
    if sentinel_config is not None and sentinel_config.is_configured():
        joined_address = get_sentinel_joined_address(sentinel_config.url, sentinel_config.port, redis_config.password)
        merged_transport_opts = {
            **sentinel_config.transport_opts,
            "sentinel_kwargs": {"password": sentinel_config.password}
        }

        return {
            "broker_url": add_db_num_to_url(joined_address, sentinel_config.port, redis_config.broker_db_num),
            "result_backend": add_db_num_to_url(joined_address, sentinel_config.port, redis_config.result_backend_db_num),
            "result_backend_transport_options": merged_transport_opts,
            "broker_transport_options": merged_transport_opts,
        }
    else:
        redis_url = add_password_to_url(f"{redis_config.url}:{redis_config.port}", redis_config.password)
        return {
            "broker_url": add_db_num_to_url(redis_url, redis_config.port, redis_config.broker_db_num),
            "result_backend": add_db_num_to_url(redis_url, redis_config.port, redis_config.result_backend_db_num),
        }
