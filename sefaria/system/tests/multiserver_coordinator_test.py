"""
Tests for sefaria/system/multiserver/coordinator.py's background listener thread
(ServerCoordinator.start_background_listener / _listener_loop) -- the replacement for relying
solely on MultiServerEventListenerMiddleware's every-20-request poll.

These exercise the loop/lock logic directly (no real Redis connection): a fake pubsub object
stands in for `self.pubsub`, and dispatch targets one of the real whitelisted objects
(`in_memory_cache`) so `_process_message`'s `locals()[data["obj"]]` resolution is exercised
faithfully without touching Mongo/the `library` singleton.
"""
import json
import threading
import time

import pytest

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
    coord.redis_client = object()  # truthy: _check_initialization() must not try to (re)connect
    coord.pubsub = _FakePubSub([_message("in_memory_cache", "set", ["k", "v"])])

    sleep_calls = []

    def fake_sleep(seconds):
        sleep_calls.append(seconds)
        raise _StopTestLoop()

    monkeypatch.setattr(time, "sleep", fake_sleep)

    with pytest.raises(_StopTestLoop):
        coord._listener_loop()

    assert received == [("k", "v")]
    # The dropped connection is caught, state is cleared for the next _check_initialization(),
    # and the loop backs off before retrying -- same backoff every other caller uses.
    assert sleep_calls == [coord.RECONNECT_BACKOFF_SECONDS]
    assert coord.redis_client is None
    assert coord.pubsub is None


def test_listener_loop_backs_off_while_never_connected(monkeypatch):
    coord = ServerCoordinator()
    coord.redis_client = None
    coord.pubsub = None
    coord._last_connect_attempt = 0  # far enough in the past that a retry is due
    connect_calls = []
    monkeypatch.setattr(coord, "connect", lambda: connect_calls.append(1))  # stays disconnected

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
