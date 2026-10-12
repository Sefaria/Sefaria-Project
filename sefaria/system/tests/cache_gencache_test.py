"""
Unit tests for GenCache (sefaria/system/cache.py), run against an in-memory Redis stand-in.
"""
import uuid

import pytest

from sefaria.system.cache import GenCache


class FakeRedis:
    """
    The subset of redis-py GenCache uses, with decode_responses=True types: get() returns
    str or None. Setting `broken` makes every call raise.
    """

    def __init__(self):
        self.store = {}
        self.broken = False

    def get(self, key):
        if self.broken:
            raise ConnectionError("FakeRedis: simulated outage")
        return self.store.get(key)

    def set(self, key, value):
        if self.broken:
            raise ConnectionError("FakeRedis: simulated outage")
        self.store[key] = value
        return True


def simulate_peer_bump(redis_client, redis_key):
    """What another process's bump does to Redis: replace the generation with one nobody holds."""
    redis_client.store[redis_key] = uuid.uuid4().hex


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def no_sleep(monkeypatch):
    """Silences jitter's time.sleep so keyspace-loss tests run instantly."""
    monkeypatch.setattr("sefaria.system.cache.time.sleep", lambda seconds: None)


def make_gen_cache(redis_client, throttle=True, key_prefix=""):
    """throttle=False zeroes the check interval, so every get() re-checks Redis."""
    return GenCache(redis_client, check_interval_seconds=2 if throttle else 0, jitter_max_seconds=3, key_prefix=key_prefix)


def make_counting_refresh_fn(return_values):
    """Returns (refresh_fn, call_log): refresh_fn pops and returns the next value from
    return_values each call, appending to call_log so tests can assert call count."""
    call_log = []
    values = list(return_values)

    def refresh_fn():
        call_log.append(True)
        return values.pop(0) if values else f"built-{len(call_log)}"

    return refresh_fn, call_log


# ---------------------------------------------------------------------------
# get(): first access, hit, staleness
# ---------------------------------------------------------------------------

def test_first_access_calls_refresh_fn_once(fake_redis):
    gc = make_gen_cache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)

    assert gc.get("toc") == "built"
    assert len(calls) == 1


def test_hit_within_throttle_window_does_not_call_redis_or_refresh(fake_redis):
    gc = make_gen_cache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)
    gc.get("toc")  # first access: populates _data and _last_checked

    fake_redis.broken = True  # if get() touched Redis again, this would raise
    assert gc.get("toc") == "built"
    assert len(calls) == 1  # refresh_fn not called again


def test_recheck_past_throttle_with_unchanged_generation_serves_cached_value(fake_redis, no_sleep):
    gc = make_gen_cache(fake_redis, throttle=False)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)
    gc.get("toc")

    # Throttle is zeroed, so this re-checks Redis -- but the generation (still None,
    # nothing ever bumped gen:toc) hasn't changed, so refresh_fn must not run again.
    assert gc.get("toc") == "built"
    assert len(calls) == 1


def test_stale_generation_triggers_refresh(fake_redis, no_sleep):
    gc = make_gen_cache(fake_redis, throttle=False)
    refresh_fn, calls = make_counting_refresh_fn(["first", "second"])
    gc.register("toc", refresh_fn)
    assert gc.get("toc") == "first"

    simulate_peer_bump(fake_redis, "gen:toc")  # simulates a peer's invalidate()
    assert gc.get("toc") == "second"
    assert len(calls) == 2


def test_jitter_only_applied_when_redis_lost_its_keyspace(fake_redis, monkeypatch):
    sleep_calls = []
    monkeypatch.setattr("sefaria.system.cache.time.sleep", lambda seconds: sleep_calls.append(seconds))

    gc = make_gen_cache(fake_redis, throttle=False)
    refresh_fn, calls = make_counting_refresh_fn([])
    gc.register("toc", refresh_fn)

    gc.get("toc")  # first access
    simulate_peer_bump(fake_redis, "gen:toc")
    gc.get("toc")  # ordinary bump: refreshes in-request without sleeping
    assert len(calls) == 2
    assert sleep_calls == []

    fake_redis.store.clear()  # counter vanished: the whole fleet notices at once
    gc.get("toc")
    assert len(calls) == 3
    assert len(sleep_calls) == 1


# ---------------------------------------------------------------------------
# invalidate() / publish() / mark_fresh(): the write path
# ---------------------------------------------------------------------------

def test_invalidate_is_visible_to_a_second_gencache_instance_sharing_redis(fake_redis, no_sleep):
    """Mirrors two processes: a writer's GenCache and a peer's, sharing one Redis."""
    writer = make_gen_cache(fake_redis, throttle=False)
    peer = make_gen_cache(fake_redis, throttle=False)

    writer_refresh, _ = make_counting_refresh_fn(["irrelevant-writer-local-value"])
    writer.register("toc", writer_refresh)

    peer_refresh, peer_calls = make_counting_refresh_fn(["peer-v1", "peer-v2"])
    peer.register("toc", peer_refresh)
    assert peer.get("toc") == "peer-v1"

    writer.invalidate("toc")  # no message passing between the two instances

    assert peer.get("toc") == "peer-v2"
    assert len(peer_calls) == 2


def test_invalidate_refreshes_the_writer_within_the_throttle_window(fake_redis):
    gc = make_gen_cache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["first", "second"])
    gc.register("toc", refresh_fn)
    assert gc.get("toc") == "first"

    gc.invalidate("toc")

    assert gc.get("toc") == "second"
    assert len(calls) == 2


def test_publish_sets_local_value_and_bumps_for_peers(fake_redis, no_sleep):
    writer = make_gen_cache(fake_redis, throttle=False)
    writer.register("toc", lambda: pytest.fail("refresh_fn must not run for a value publish() just set"))

    result = writer.publish("toc", "fresh-value")

    assert result == "fresh-value"
    assert writer.get("toc") == "fresh-value"  # own next read: no throttle-window wait
    assert fake_redis.store["gen:toc"] is not None  # peers see the bump


def test_mark_fresh_bumps_without_refreshing_this_process(fake_redis, no_sleep):
    writer = make_gen_cache(fake_redis, throttle=False)
    writer.register("index_map", lambda: pytest.fail("writer already rebuilt; must not refresh"))

    writer.mark_fresh("index_map")

    writer.get("index_map")
    assert fake_redis.store["gen:index_map"] is not None


def test_publish_then_peer_get_sees_the_bump(fake_redis, no_sleep):
    writer = make_gen_cache(fake_redis, throttle=False)
    writer.register("toc", lambda: None)
    writer.publish("toc", "fresh-value")

    peer = make_gen_cache(fake_redis, throttle=False)
    peer_refresh, peer_calls = make_counting_refresh_fn(["peer-built"])
    peer.register("toc", peer_refresh)

    assert peer.get("toc") == "peer-built"
    assert len(peer_calls) == 1


# ---------------------------------------------------------------------------
# Fail-open: Redis unreachable
# ---------------------------------------------------------------------------

def test_redis_down_on_recheck_serves_last_known_value(fake_redis, no_sleep):
    gc = make_gen_cache(fake_redis, throttle=False)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)
    gc.get("toc")  # first access succeeds, populates _data

    fake_redis.broken = True
    assert gc.get("toc") == "built"  # never raises into the caller
    assert len(calls) == 1  # no refresh attempted while Redis is down


def test_redis_down_on_first_access_falls_through_to_refresh_fn(fake_redis):
    fake_redis.broken = True
    gc = make_gen_cache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built-from-mongo"])
    gc.register("toc", refresh_fn)

    # no local value yet, so it must still build one rather than return nothing
    assert gc.get("toc") == "built-from-mongo"
    assert len(calls) == 1


def test_invalidate_failure_does_not_raise(fake_redis):
    gc = make_gen_cache(fake_redis)
    fake_redis.broken = True
    gc.invalidate("toc")


def test_publish_failure_to_bump_does_not_raise_and_drops_stale_local_gen(fake_redis, no_sleep):
    gc = make_gen_cache(fake_redis, throttle=False)
    gc.register("toc", lambda: "rebuilt")

    fake_redis.broken = True
    result = gc.publish("toc", "value-written-despite-redis-outage")
    assert result == "value-written-despite-redis-outage"

    # Once Redis comes back, this process shouldn't wrongly believe it's already in sync
    # with a generation it never actually wrote.
    fake_redis.broken = False
    fake_redis.store["gen:toc"] = "7"  # some peer's bump landed while this one was down
    assert gc.get("toc") == "rebuilt"


# ---------------------------------------------------------------------------
# Failed bumps: retried once Redis is reachable again
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("write", ["invalidate", "publish", "mark_fresh"])
def test_failed_bump_reaches_peer_once_redis_returns_with_keyspace_intact(fake_redis, no_sleep, write):
    writer = make_gen_cache(fake_redis, throttle=False)
    writer.register("toc", lambda: "writer-refreshed")
    writer.register("other", lambda: "other-value")
    peer = make_gen_cache(fake_redis, throttle=False)
    peer_refresh, peer_calls = make_counting_refresh_fn(["peer-v1", "peer-v2"])
    peer.register("toc", peer_refresh)

    simulate_peer_bump(fake_redis, "gen:toc")  # the counter exists, so a restart that kept it is distinguishable from keyspace loss
    assert peer.get("toc") == "peer-v1"

    fake_redis.broken = True
    if write == "publish":
        writer.publish("toc", "fresh")
    else:
        getattr(writer, write)("toc")
    assert peer.get("toc") == "peer-v1"  # Redis down: peer serves its last value

    fake_redis.broken = False  # Redis returns with the old generation still in place
    writer.get("other")  # the writer's next successful Redis call retries the bump

    assert peer.get("toc") == "peer-v2"
    assert len(peer_calls) == 2


def test_failed_bump_is_retried_by_the_next_successful_bump(fake_redis, no_sleep):
    writer = make_gen_cache(fake_redis, throttle=False)
    fake_redis.broken = True
    writer.invalidate("toc")
    fake_redis.broken = False

    writer.invalidate("other")

    assert set(fake_redis.store) == {"gen:toc", "gen:other"}


def test_failed_retry_stays_pending(fake_redis, no_sleep):
    writer = make_gen_cache(fake_redis, throttle=False)
    writer.register("other", lambda: "other-value")
    fake_redis.broken = True
    writer.invalidate("toc")
    writer.get("other")  # Redis still down: nothing to retry with

    fake_redis.broken = False
    writer.get("other")

    assert "gen:toc" in fake_redis.store


# ---------------------------------------------------------------------------
# Failover that drops the last bump: a regressed generation must not match a newer one
# ---------------------------------------------------------------------------

def test_generation_rolled_back_by_failover_never_matches_a_later_bump(fake_redis, no_sleep):
    writer = make_gen_cache(fake_redis, throttle=False)
    peer = make_gen_cache(fake_redis, throttle=False)
    peer_refresh, peer_calls = make_counting_refresh_fn([])
    peer.register("toc", peer_refresh)

    writer.invalidate("toc")
    before_lost_bump = fake_redis.store["gen:toc"]
    writer.invalidate("toc")  # the replica never receives this one
    peer.get("toc")  # peer now holds the generation from the lost bump
    assert len(peer_calls) == 1

    fake_redis.store["gen:toc"] = before_lost_bump  # failover promotes the lagging replica

    # The peer doesn't check again until after the next bump. With an INCR counter, that bump
    # would recreate the lost value the peer already holds and the peer would miss it.
    writer.invalidate("toc")
    peer.get("toc")
    assert len(peer_calls) == 2


# ---------------------------------------------------------------------------
# Redis data loss: every tracked key reads back missing
# ---------------------------------------------------------------------------

def test_redis_keyspace_loss_triggers_rebuild_through_refresh_fn(fake_redis, no_sleep):
    """A Redis restart without persistence makes every counter read back None."""
    gc = make_gen_cache(fake_redis, throttle=False)
    refresh_fn, calls = make_counting_refresh_fn(["before-loss", "after-loss"])
    gc.register("toc", refresh_fn)

    simulate_peer_bump(fake_redis, "gen:toc")
    assert gc.get("toc") == "before-loss"
    assert len(calls) == 1

    fake_redis.store.clear()  # simulates Redis losing its keyspace
    assert gc.get("toc") == "after-loss"
    assert len(calls) == 2


# ---------------------------------------------------------------------------
# key_prefix: multiple deployments sharing one Redis/Sentinel (e.g. cauldrons)
# ---------------------------------------------------------------------------

def test_key_prefix_isolates_bump_between_deployments(fake_redis):
    """Deployments sharing one Redis must not see each other's counters."""
    cauldron_a = make_gen_cache(fake_redis, key_prefix="cauldron-a")
    cauldron_b = make_gen_cache(fake_redis, key_prefix="cauldron-b")

    cauldron_a.invalidate("index_map")

    assert list(fake_redis.store) == ["cauldron-a:gen:index_map"]
    assert "cauldron-b:gen:index_map" not in fake_redis.store


def test_key_prefix_isolates_get_between_deployments(fake_redis, no_sleep):
    cauldron_a = make_gen_cache(fake_redis, throttle=False, key_prefix="cauldron-a")
    cauldron_b = make_gen_cache(fake_redis, throttle=False, key_prefix="cauldron-b")

    refresh_fn_a, calls_a = make_counting_refresh_fn(["a-build-1", "a-build-2"])
    refresh_fn_b, calls_b = make_counting_refresh_fn(["b-build-1", "b-build-2"])
    cauldron_a.register("index_map", refresh_fn_a)
    cauldron_b.register("index_map", refresh_fn_b)

    assert cauldron_a.get("index_map") == "a-build-1"
    assert cauldron_b.get("index_map") == "b-build-1"

    # Cauldron A's write bumps only its own namespaced counter, so B shouldn't see staleness.
    cauldron_a.mark_fresh("index_map")
    assert cauldron_b.get("index_map") == "b-build-1"
    assert len(calls_b) == 1


def test_no_key_prefix_writes_bare_keys(fake_redis):
    gc = make_gen_cache(fake_redis)
    gc.invalidate("index_map")
    assert list(fake_redis.store) == ["gen:index_map"]
