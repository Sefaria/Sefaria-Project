import pytest

import sefaria.system.cache as cache_module
from sefaria.system.cache import InMemoryCache


@pytest.fixture()
def fake_clock(monkeypatch):
    """Replaces the cache clock with a controllable value (seconds since epoch)."""
    clock = {"now": 1_000_000.0}
    monkeypatch.setattr(cache_module, "_now_timestamp", lambda: clock["now"])
    return clock


def test_set_then_get_returns_value():
    cache = InMemoryCache()
    cache.set("k", {"a": 1})
    assert cache.get("k") == {"a": 1}


def test_get_missing_key_returns_none():
    assert InMemoryCache().get("missing") is None


def test_instances_do_not_share_state():
    first = InMemoryCache()
    second = InMemoryCache()
    first.set("k", "value", timeout=60)
    assert second.get("k") is None
    assert second.data == {}
    assert second.timeouts == {}


def test_expired_key_returns_none_and_is_deleted(fake_clock):
    cache = InMemoryCache()
    cache.set("k", "value", timeout=60)
    fake_clock["now"] += 61
    assert cache.get("k") is None
    assert "k" not in cache.data
    assert "k" not in cache.timeouts


def test_unexpired_key_is_returned(fake_clock):
    cache = InMemoryCache()
    cache.set("k", "value", timeout=60)
    fake_clock["now"] += 30
    assert cache.get("k") == "value"


def test_set_without_timeout_clears_previous_timeout(fake_clock):
    cache = InMemoryCache()
    cache.set("k", "old", timeout=60)
    cache.set("k", "new")
    fake_clock["now"] += 3600
    assert cache.get("k") == "new"


def test_reset_all_removes_every_entry_and_timeout(fake_clock):
    cache = InMemoryCache()
    cache.set("a", 1)
    cache.set("b", 2, timeout=60)
    cache.reset_all()
    assert cache.data == {}
    assert cache.timeouts == {}
    assert cache.get("a") is None
    assert cache.get("b") is None


def test_reset_all_then_set_works_again():
    cache = InMemoryCache()
    cache.set("a", 1)
    cache.reset_all()
    cache.set("a", 2)
    assert cache.get("a") == 2


def test_oldest_entry_is_evicted_when_bound_is_exceeded():
    cache = InMemoryCache(max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert cache.get("a") is None
    assert cache.get("b") == 2
    assert cache.get("c") == 3
    assert len(cache.data) == 2


def test_resetting_a_key_refreshes_its_position_before_eviction():
    cache = InMemoryCache(max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("a", 10)
    cache.set("c", 3)
    assert cache.get("b") is None
    assert cache.get("a") == 10
    assert cache.get("c") == 3


def test_eviction_also_drops_timeout_of_evicted_key(fake_clock):
    cache = InMemoryCache(max_entries=1)
    cache.set("a", 1, timeout=60)
    cache.set("b", 2)
    assert "a" not in cache.timeouts


def test_module_level_singleton_is_an_instance_of_in_memory_cache():
    assert isinstance(cache_module.in_memory_cache, InMemoryCache)
