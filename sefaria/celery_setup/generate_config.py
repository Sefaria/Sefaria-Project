"""
NOTE: This file is a direct copy of the same file in the LLM repo
This file is required for any new service that wants to configure celery
We should consider releasing this as a pip module but it's not clear where that would live at this point
"""
import re
import dns.resolver
from dataclasses import dataclass


@dataclass
class SentinelConfig:
    url: str
    password: str
    port: str
    transport_opts: dict

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
    broker_db_num: str
    result_backend_db_num: str


def add_db_num_to_url(url, port, db_num):
    return url.replace(f':{port}', f':{port}/{db_num}')


def add_password_to_url(url, password):
    if len(password) == 0:
        return url
    return re.sub(r'((?:redis|sentinel)://)', fr'\1:{password}@', url)


def generate_config(redis_config: RedisConfig, sentinel_config: SentinelConfig = None) -> dict:
    """
    :param redis_config: required, whether connecting to redis or redis sentinel, the redis config is required.
    :param sentinel_config: optional, only pass if connecting to redis sentinel
    """
    if sentinel_config is not None and sentinel_config.is_configured():
        redisdns = dns.resolver.resolve(sentinel_config.url, 'A')
        addressstring = []
        for res in redisdns.response.answer:
            for item in res.items:
                curr_redis_url = f"sentinel://{item.to_text()}:{sentinel_config.port}"
                curr_redis_url = add_password_to_url(curr_redis_url, redis_config.password)
                addressstring.append(curr_redis_url)
        joined_address = ";".join(addressstring)
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
