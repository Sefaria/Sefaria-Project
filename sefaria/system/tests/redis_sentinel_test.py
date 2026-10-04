"""
Tests for sefaria.system.redis_sentinel. The unit tests never open a socket.
The failover test needs a real Sentinel cluster and only runs when SENTINEL_TEST_HEADLESS_URL
is set.
"""
import os
import time
from pathlib import Path

import pytest
import yaml

import sefaria.system.redis_sentinel as rs
from sefaria.system.redis_sentinel import RedisConfig, SentinelConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
@pytest.fixture
def sentinel_config():
    # transport_opts mirrors prod's Celery-only options, which redis-py rejects as kwargs
    return SentinelConfig("redis-headless", "sentinel-pw", "26379", {"master_name": "mymaster"}, "mymaster")


@pytest.fixture
def redis_config():
    return RedisConfig("redis://127.0.0.1", "redis-pw", "6379")


def test_get_sentinel_joined_address_keeps_the_hostname():
    assert rs.get_sentinel_joined_address("redis-headless", "26379", "pw") == "sentinel://:pw@redis-headless:26379"


def test_get_redis_client_with_sentinel_ignores_celery_transport_opts(redis_config, sentinel_config):
    client = rs.get_redis_client(redis_config, sentinel_config, 6, decode_responses=True)
    pool = client.connection_pool
    assert pool.service_name == "mymaster"
    assert pool.connection_kwargs["db"] == 6
    assert pool.connection_kwargs["password"] == "redis-pw"
    sentinel = pool.sentinel_manager
    sentinel_kwargs = sentinel.sentinels[0].connection_pool.connection_kwargs
    assert (sentinel_kwargs["host"], sentinel_kwargs["port"]) == ("redis-headless", 26379)  # resolved per connection
    assert sentinel_kwargs["password"] == "sentinel-pw"


def test_get_redis_client_without_sentinel(redis_config):
    client = rs.get_redis_client(redis_config, SentinelConfig(None, None, "26379", {}), 6)
    kwargs = client.connection_pool.connection_kwargs
    assert (kwargs["host"], kwargs["port"], kwargs["db"]) == ("127.0.0.1", 6379, 6)


def test_django_cache_options_with_sentinel_build_a_sentinel_pool(redis_config, sentinel_config):
    from django_redis.pool import get_connection_factory
    from redis.sentinel import SentinelConnectionPool

    location, options = rs.get_django_redis_cache_options(redis_config, sentinel_config, 5)
    assert location == "redis://mymaster/5"
    assert options["SENTINELS"] == [("redis-headless", 26379)]
    assert options["SENTINEL_KWARGS"]["password"] == "sentinel-pw"
    factory = get_connection_factory(options=options)
    pool = factory.get_connection_pool(factory.make_connection_params(location))
    assert isinstance(pool, SentinelConnectionPool)
    assert pool.connection_kwargs["db"] == 5


@pytest.mark.parametrize("read_from_replicas,expected_is_master", [(True, [True, False]), (False, [True])])
def test_django_cache_replica_reads_are_opt_out(redis_config, sentinel_config, read_from_replicas, expected_is_master):
    from django_redis.client import DefaultClient
    from django.utils.module_loading import import_string

    location, options = rs.get_django_redis_cache_options(redis_config, sentinel_config, 5, read_from_replicas=read_from_replicas)
    client = import_string(options["CLIENT_CLASS"])(location, {"OPTIONS": options}, backend=None)
    pools = [client.connection_factory.get_connection_pool(client.connection_factory.make_connection_params(url))
             for url in client._server]
    assert [pool.is_master for pool in pools] == expected_is_master
    assert isinstance(client, DefaultClient)


def test_django_cache_options_without_sentinel(redis_config):
    location, options = rs.get_django_redis_cache_options(redis_config, None, 5)
    assert location == "redis://127.0.0.1:6379/5"
    assert options == {"CLIENT_CLASS": "django_redis.client.DefaultClient", "PASSWORD": "redis-pw"}


def _redis_values(doc):
    """Finds tasks.redis in a chart values file or a HelmRelease's spec.values."""
    values = doc.get("spec", {}).get("values", doc)
    return values.get("tasks", {}).get("redis", {})


@pytest.mark.parametrize("override_path", [
    "envs/prod/helmrelease.yaml",
    "envs/preprod/helmrelease.yaml",
    "build/ci/preprod-values.yaml",
])
def test_redis_db_numbers_do_not_collide(override_path):
    """Celery, CACHES and GenCache share one Redis; each needs its own DB number."""
    with open(REPO_ROOT / "helm-chart/sefaria/values.yaml") as f:
        merged = dict(_redis_values(yaml.safe_load(f)))
    with open(REPO_ROOT / override_path) as f:
        for doc in yaml.safe_load_all(f):
            if doc:
                merged.update(_redis_values(doc))
    keys = ["brokerDBNumber", "resultBackendDBNumber", "defaultCacheDbNumber", "sharedCacheDbNumber", "gencacheDbNumber"]
    db_nums = [str(merged[k]) for k in keys]
    assert len(set(db_nums)) == len(db_nums), dict(zip(keys, db_nums))


@pytest.mark.deep
@pytest.mark.skipif(not os.getenv("SENTINEL_TEST_HEADLESS_URL"), reason="needs a real Sentinel cluster")
def test_client_follows_sentinel_failover():
    """
    Forces a failover with SENTINEL FAILOVER and checks that a client built once keeps
    working against the newly promoted master. Configure with SENTINEL_TEST_HEADLESS_URL,
    SENTINEL_TEST_PORT, SENTINEL_TEST_PASSWORD, SENTINEL_TEST_REDIS_PASSWORD and
    SENTINEL_TEST_MASTER_SET.
    """
    sentinel_config = SentinelConfig(
        os.environ["SENTINEL_TEST_HEADLESS_URL"], os.getenv("SENTINEL_TEST_PASSWORD"),
        os.getenv("SENTINEL_TEST_PORT", "26379"), {}, os.getenv("SENTINEL_TEST_MASTER_SET", "mymaster"),
    )
    redis_config = RedisConfig("", os.getenv("SENTINEL_TEST_REDIS_PASSWORD"), sentinel_config.port)
    client = rs.get_redis_client(redis_config, sentinel_config, 15, decode_responses=True)
    sentinel = client.connection_pool.sentinel_manager

    old_master = sentinel.discover_master(sentinel_config.master_set)
    client.set("sentinel-failover-test", "before")
    sentinel.sentinels[0].execute_command("SENTINEL FAILOVER", sentinel_config.master_set)

    deadline = time.monotonic() + 60
    while sentinel.discover_master(sentinel_config.master_set) == old_master:
        assert time.monotonic() < deadline, "Sentinel did not promote a new master within 60s"
        time.sleep(1)

    for _ in range(30):
        try:
            client.set("sentinel-failover-test", "after")
            break
        except Exception:
            time.sleep(1)
    assert client.get("sentinel-failover-test") == "after"
    client.delete("sentinel-failover-test")
