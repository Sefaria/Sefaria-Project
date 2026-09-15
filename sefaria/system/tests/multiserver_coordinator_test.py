"""
Tests for sefaria/system/multiserver/coordinator.py's background listener thread
(ServerCoordinator.start_background_listener / _listener_loop) -- the replacement for relying
solely on MultiServerEventListenerMiddleware's every-20-request poll.

These exercise the loop/lock logic directly (no real Redis connection): a fake pubsub object
stands in for `self._listener_pubsub`, and dispatch targets one of the real whitelisted objects
(`in_memory_cache`) so `_process_message`'s `locals()[data["obj"]]` resolution is exercised
faithfully without touching Mongo/the `library` singleton.
"""
import json
import threading
import time

import pytest
import redis
import redis.exceptions

from sefaria.system.cache import in_memory_cache
from sefaria.system.multiserver.coordinator import ServerCoordinator


class _StopTestLoop(Exception):
    """Raised from a patched time.sleep() to unwind _listener_loop's `while True` in tests."""
    pass


class _FakePubSub:
    """Yields a fixed sequence of messages once, then raises to simulate a dropped connection."""

    def __init__(self, messages):
        self._messages = messages

    def listen(self):
        for m in self._messages:
            yield m
        raise ConnectionError("simulated connection drop")


def _message(obj, method, args):
    return {
        "type": "message",
        "data": json.dumps({"obj": obj, "method": method, "args": args, "id": "test-id"}),
    }


def test_listener_loop_processes_message_then_reconnects_on_drop(monkeypatch):
    received = []
    monkeypatch.setattr(in_memory_cache, "set", lambda key, val, timeout=None: received.append((key, val)))

    coord = ServerCoordinator()
    # truthy: _check_listener_initialization() must not try to (re)connect
    coord._listener_redis_client = object()
    coord._listener_pubsub = _FakePubSub([_message("in_memory_cache", "set", ["k", "v"])])

    sleep_calls = []

    def fake_sleep(seconds):
        sleep_calls.append(seconds)
        raise _StopTestLoop()

    monkeypatch.setattr(time, "sleep", fake_sleep)

    with pytest.raises(_StopTestLoop):
        coord._listener_loop()

    assert received == [("k", "v")]
    # The dropped connection is caught, state is cleared for the next
    # _check_listener_initialization(), and the loop backs off before retrying -- same backoff
    # every other caller uses.
    assert sleep_calls == [coord.RECONNECT_BACKOFF_SECONDS]
    assert coord._listener_redis_client is None
    assert coord._listener_pubsub is None


def test_listener_loop_backs_off_while_never_connected(monkeypatch):
    coord = ServerCoordinator()
    coord._listener_redis_client = None
    coord._listener_pubsub = None
    coord._last_listener_connect_attempt = 0  # far enough in the past that a retry is due
    connect_calls = []
    monkeypatch.setattr(coord, "connect_listener", lambda: connect_calls.append(1))  # stays disconnected

    sleep_calls = []

    def fake_sleep(seconds):
        # A raised exception here is itself caught by _listener_loop's `except Exception:`,
        # which backs off once more before finally propagating -- so this may fire more than
        # once per test. Assert on the backoff value/attempted-reconnect, not an exact count.
        sleep_calls.append(seconds)
        raise _StopTestLoop()

    monkeypatch.setattr(time, "sleep", fake_sleep)

    with pytest.raises(_StopTestLoop):
        coord._listener_loop()

    assert connect_calls  # at least one reconnect attempt was made
    assert sleep_calls and all(s == coord.RECONNECT_BACKOFF_SECONDS for s in sleep_calls)


def test_listener_idle_timeout_does_not_kill_the_middleware_fallback(monkeypatch):
    """
    Regression test for the bug this file's connect()/connect_listener() split fixes: a
    listener connection with a short socket_timeout treats ordinary idle silence on the channel
    (redis.exceptions.TimeoutError, not a real disconnect) as a dead connection. That used to
    tear down the *shared* self.redis_client/self.pubsub, which MultiServerEventListenerMiddleware's
    sync() poll also depends on -- so a listener hiccup took the documented "zero-cost fallback"
    down with it. Now the listener only ever touches its own _listener_redis_client/_listener_pubsub.
    """
    class _IdleTimeoutPubSub:
        """Simulates listen() raising on ordinary idle silence, like a short-socket_timeout
        connection does against a real Redis server with no traffic on the channel."""
        def listen(self):
            raise redis.exceptions.TimeoutError("Timeout reading from socket")
            yield  # pragma: no cover - makes this a generator function

    coord = ServerCoordinator()
    coord._listener_redis_client = object()
    coord._listener_pubsub = _IdleTimeoutPubSub()
    # The connection sync()/publish_event()/the middleware actually use -- must survive
    # untouched by a listener-side timeout.
    sentinel_client, sentinel_pubsub = object(), object()
    coord.redis_client = sentinel_client
    coord.pubsub = sentinel_pubsub

    def fake_sleep(seconds):
        raise _StopTestLoop()

    monkeypatch.setattr(time, "sleep", fake_sleep)

    with pytest.raises(_StopTestLoop):
        coord._listener_loop()

    assert coord._listener_redis_client is None
    assert coord._listener_pubsub is None
    # The bug: these used to be nulled out too, by a listener-thread timeout that had nothing
    # to do with the middleware's own connection.
    assert coord.redis_client is sentinel_client
    assert coord.pubsub is sentinel_pubsub


def test_connect_and_connect_listener_use_different_socket_timeouts(monkeypatch):
    """
    connect() (used by sync()'s non-blocking poll and publish_event()) must keep its short,
    fail-fast socket_timeout. connect_listener() (used by the blocking listen() loop) must use
    socket_timeout=None so ordinary idle silence on the channel doesn't look like a dead
    connection. See MessagingNode.connect_listener()'s docstring.
    """
    captured_kwargs = []

    class _FakeRedis:
        def __init__(self, **kwargs):
            captured_kwargs.append(kwargs)

        def pubsub(self):
            return _FakePubSub([])

    monkeypatch.setattr(redis, "StrictRedis", _FakeRedis)

    coord = ServerCoordinator()
    coord.subscription_channels = []  # skip subscribe()/get_message(), not under test here
    coord.connect()
    coord.connect_listener()

    assert len(captured_kwargs) == 2
    assert captured_kwargs[0]["socket_timeout"] == ServerCoordinator.CONNECT_TIMEOUT_SECONDS
    assert captured_kwargs[1]["socket_timeout"] is None
    # Both still bound the initial TCP connect attempt the same way.
    assert captured_kwargs[0]["socket_connect_timeout"] == ServerCoordinator.CONNECT_TIMEOUT_SECONDS
    assert captured_kwargs[1]["socket_connect_timeout"] == ServerCoordinator.CONNECT_TIMEOUT_SECONDS


def test_process_message_dispatch_is_serialized_under_lock(monkeypatch):
    order = []

    def slow_set(key, val, timeout=None):
        order.append(("start", key))
        time.sleep(0.05)
        order.append(("end", key))

    monkeypatch.setattr(in_memory_cache, "set", slow_set)

    coord = ServerCoordinator()
    msg_a = _message("in_memory_cache", "set", ["a", "1"])
    msg_b = _message("in_memory_cache", "set", ["b", "2"])

    t1 = threading.Thread(target=coord._process_message, args=(msg_a,))
    t2 = threading.Thread(target=coord._process_message, args=(msg_b,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Fully serialized by _CACHE_MUTATION_LOCK: one call's start+end is contiguous, never
    # interleaved with the other's.
    assert order in (
        [("start", "a"), ("end", "a"), ("start", "b"), ("end", "b")],
        [("start", "b"), ("end", "b"), ("start", "a"), ("end", "a")],
    )


def test_start_background_listener_is_idempotent(monkeypatch):
    started = []

    class _FakeThread:
        def __init__(self, target, name, daemon):
            started.append(target)
            self._alive = True

        def start(self):
            pass

        def is_alive(self):
            return self._alive

    monkeypatch.setattr(threading, "Thread", _FakeThread)

    coord = ServerCoordinator()
    coord.start_background_listener()
    coord.start_background_listener()

    assert len(started) == 1
