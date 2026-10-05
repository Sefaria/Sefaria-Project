"""
Unit tests for GenCache (sefaria/system/cache.py) -- see the GenCache migration decision
record §12. Runs against a fake in-memory Redis stand-in, not a real connection: GenCache's
job is the compare-and-refresh bookkeeping around whatever `redis_client` it's given, and
that logic is identical whether the client is a real Sentinel-backed `redis.Redis` or this
fake one.
"""
import pytest

from sefaria.system.cache import GenCache


class FakeRedis:
    """Minimal in-memory stand-in for the subset of redis-py's API GenCache uses, matching
    real redis-py's types under decode_responses=True (which the real gen_cache client is
    built with -- see sefaria.system.cache._build_gen_cache): .get(key) -> str|None, values
    stored as strings regardless of how they were written, same as real Redis; .incr(key) ->
    int, per RESP's integer reply type, independent of decode_responses. `broken` simulates
    Redis being unreachable: every call raises, matching a dropped connection."""

    def __init__(self):
        self.store = {}
        self.broken = False

    def get(self, key):
        if self.broken:
            raise ConnectionError("FakeRedis: simulated outage")
        return self.store.get(key)

    def incr(self, key):
        if self.broken:
            raise ConnectionError("FakeRedis: simulated outage")
        new_value = int(self.store.get(key) or 0) + 1
        self.store[key] = str(new_value)
        return new_value


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def no_throttle(monkeypatch):
    """Zero the throttle window so every get() re-checks Redis, and silence jitter's
    time.sleep so staleness tests run instantly."""
    monkeypatch.setattr(GenCache, "CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("sefaria.system.cache.time.sleep", lambda seconds: None)


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
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)

    assert gc.get("toc") == "built"
    assert len(calls) == 1


def test_hit_within_throttle_window_does_not_call_redis_or_refresh(fake_redis):
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)
    gc.get("toc")  # first access: populates _data and _last_checked

    fake_redis.broken = True  # if get() touched Redis again, this would raise
    assert gc.get("toc") == "built"
    assert len(calls) == 1  # refresh_fn not called again


def test_recheck_past_throttle_with_unchanged_generation_serves_cached_value(fake_redis, no_throttle):
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)
    gc.get("toc")

    # Throttle is zeroed, so this re-checks Redis -- but the generation (still None,
    # nothing ever bumped gen:toc) hasn't changed, so refresh_fn must not run again.
    assert gc.get("toc") == "built"
    assert len(calls) == 1


def test_stale_generation_triggers_refresh(fake_redis, no_throttle):
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["first", "second"])
    gc.register("toc", refresh_fn)
    assert gc.get("toc") == "first"

    fake_redis.incr("gen:toc")  # simulates a peer's bump()
    assert gc.get("toc") == "second"
    assert len(calls) == 2


def test_jitter_only_applied_when_redis_lost_its_keyspace(fake_redis, monkeypatch):
    monkeypatch.setattr(GenCache, "CHECK_INTERVAL_SECONDS", 0)
    sleep_calls = []
    monkeypatch.setattr("sefaria.system.cache.time.sleep", lambda seconds: sleep_calls.append(seconds))

    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn([])
    gc.register("toc", refresh_fn)

    gc.get("toc")  # first access
    fake_redis.incr("gen:toc")
    gc.get("toc")  # ordinary bump: refreshes in-request without sleeping
    assert len(calls) == 2
    assert sleep_calls == []

    fake_redis.store.clear()  # counter vanished: the whole fleet notices at once
    gc.get("toc")
    assert len(calls) == 3
    assert len(sleep_calls) == 1


# ---------------------------------------------------------------------------
# bump() / publish(): the write path
# ---------------------------------------------------------------------------

def test_bump_is_visible_to_a_second_gencache_instance_sharing_redis(fake_redis, no_throttle):
    """Mirrors two processes: a writer's GenCache and a peer's, sharing one Redis."""
    writer = GenCache(fake_redis)
    peer = GenCache(fake_redis)

    writer_refresh, _ = make_counting_refresh_fn(["irrelevant-writer-local-value"])
    writer.register("toc", writer_refresh)

    peer_refresh, peer_calls = make_counting_refresh_fn(["peer-v1", "peer-v2"])
    peer.register("toc", peer_refresh)
    assert peer.get("toc") == "peer-v1"

    writer.bump("toc")  # no message passing between the two instances

    assert peer.get("toc") == "peer-v2"
    assert len(peer_calls) == 2


def test_publish_sets_local_value_and_bumps_for_peers(fake_redis, no_throttle):
    writer = GenCache(fake_redis)
    writer.register("toc", lambda: pytest.fail("refresh_fn must not run for a value publish() just set"))

    result = writer.publish("toc", "fresh-value")

    assert result == "fresh-value"
    assert writer.get("toc") == "fresh-value"  # own next read: no throttle-window wait
    assert fake_redis.store["gen:toc"] == "1"  # peers see exactly one bump


def test_mark_fresh_bumps_without_refreshing_this_process(fake_redis, no_throttle):
    writer = GenCache(fake_redis)
    writer.register("index_map", lambda: pytest.fail("writer already rebuilt; must not refresh"))

    writer.mark_fresh("index_map")

    writer.get("index_map")
    assert fake_redis.store["gen:index_map"] == "1"


def test_publish_then_peer_get_sees_the_bump(fake_redis, no_throttle):
    writer = GenCache(fake_redis)
    writer.register("toc", lambda: None)
    writer.publish("toc", "fresh-value")

    peer = GenCache(fake_redis)
    peer_refresh, peer_calls = make_counting_refresh_fn(["peer-built"])
    peer.register("toc", peer_refresh)

    assert peer.get("toc") == "peer-built"
    assert len(peer_calls) == 1


# ---------------------------------------------------------------------------
# Fail-open: Redis unreachable
# ---------------------------------------------------------------------------

def test_redis_down_on_recheck_serves_last_known_value(fake_redis, no_throttle):
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built"])
    gc.register("toc", refresh_fn)
    gc.get("toc")  # first access succeeds, populates _data

    fake_redis.broken = True
    assert gc.get("toc") == "built"  # never raises into the caller
    assert len(calls) == 1  # no refresh attempted while Redis is down


def test_redis_down_on_first_access_falls_through_to_refresh_fn(fake_redis):
    fake_redis.broken = True
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["built-from-mongo"])
    gc.register("toc", refresh_fn)

    # No local value yet and Redis is unreachable: must still call refresh_fn rather than
    # returning nothing (§03's "degrade to mongo behavior for one cycle" correction).
    assert gc.get("toc") == "built-from-mongo"
    assert len(calls) == 1


def test_bump_failure_is_logged_and_does_not_raise(fake_redis):
    gc = GenCache(fake_redis)
    fake_redis.broken = True
    assert gc.bump("toc") is None  # fails closed, caller never sees an exception


def test_publish_failure_to_bump_does_not_raise_and_drops_stale_local_gen(fake_redis, no_throttle):
    gc = GenCache(fake_redis)
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
# Redis data loss: every tracked key reads back missing
# ---------------------------------------------------------------------------

def test_redis_keyspace_loss_triggers_rebuild_through_refresh_fn(fake_redis, no_throttle):
    """A Redis restart with no persistence means every gen key reads back None -- same as a
    cold first access from this process's point of view once it notices (§10)."""
    gc = GenCache(fake_redis)
    refresh_fn, calls = make_counting_refresh_fn(["before-loss", "after-loss"])
    gc.register("toc", refresh_fn)

    fake_redis.incr("gen:toc")
    assert gc.get("toc") == "before-loss"
    assert len(calls) == 1

    fake_redis.store.clear()  # simulates Redis losing its keyspace
    assert gc.get("toc") == "after-loss"
    assert len(calls) == 2


# ---------------------------------------------------------------------------
# key_prefix: multiple deployments sharing one Redis/Sentinel (e.g. cauldrons)
# ---------------------------------------------------------------------------

def test_key_prefix_isolates_bump_between_deployments(fake_redis):
    """Two deployments sharing one Redis, distinguished only by key_prefix, must not see
    each other's counters -- this is what stops one cauldron's writes from forcing an
    unrelated cauldron to rebuild."""
    cauldron_a = GenCache(fake_redis, key_prefix="cauldron-a")
    cauldron_b = GenCache(fake_redis, key_prefix="cauldron-b")

    cauldron_a.bump("index_map")

    assert fake_redis.store == {"cauldron-a:gen:index_map": "1"}
    assert "cauldron-b:gen:index_map" not in fake_redis.store


def test_key_prefix_isolates_get_between_deployments(fake_redis, no_throttle):
    cauldron_a = GenCache(fake_redis, key_prefix="cauldron-a")
    cauldron_b = GenCache(fake_redis, key_prefix="cauldron-b")

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


def test_no_key_prefix_is_unprefixed_for_backward_compatibility(fake_redis):
    """A single-tenant deployment (local dev, prod, staging, preprod) passes no key_prefix
    and must keep writing the same bare keys as before this change."""
    gc = GenCache(fake_redis)
    gc.bump("index_map")
    assert fake_redis.store == {"gen:index_map": "1"}
