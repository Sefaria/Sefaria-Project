# -*- coding: utf-8 -*-
"""
Concurrency tests for Library.build_full_auto_completer's serialize/coalesce logic.

These do NOT build a real auto completer (that needs Mongo/Postgres, which is why
autospell_test.py is disabled). Instead they stub out AutoCompleter and drive the real
method over real OS threads, asserting the coalescing-counter behaviour directly.

The build lock on the fake library is a threading.BoundedSemaphore so the test is identical
on macOS dev (no gevent -> threading fallback) and on the gevent-on-Linux CI: the method only
uses the lock through the BoundedSemaphore context-manager API, which both implementations
share. What is under test is the requested/completed counter logic, not the lock flavour.

AutoCompleter is supplied as a stub module in sys.modules so the test pulls in no real
auto completer code (and no datrie/Mongo) -- build_full_auto_completer imports it lazily via
`from .autospell import AutoCompleter`.
"""
import sys
import time
import types
import threading

import sefaria.model.text as text


def _install_stub_autocompleter(monkeypatch, stub_cls):
    """Make `from .autospell import AutoCompleter` (inside the build method) resolve to stub_cls."""
    stub_module = types.ModuleType("sefaria.model.autospell")
    stub_module.AutoCompleter = stub_cls
    monkeypatch.setitem(sys.modules, "sefaria.model.autospell", stub_module)


def _make_fake_library():
    """A minimal stand-in carrying only the attributes build_full_auto_completer touches.

    Avoids Library() construction so the test never risks a DB query."""
    fake = types.SimpleNamespace()
    fake.langs = ["en", "he"]
    fake._full_auto_completer = {}
    fake._full_auto_completer_is_ready = False
    fake._full_ac_build_lock = threading.BoundedSemaphore(1)
    fake._full_ac_requested = 0
    fake._full_ac_completed = 0
    return fake


def _wait_until(pred, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.005)
    return False


def test_burst_before_build_collapses_to_one(monkeypatch):
    """A burst of requests that all arrive before the build's reads begin collapses to one build."""
    fake = _make_fake_library()
    built_langs = []

    class StubAutoCompleter:
        def __init__(self, lang, lib, **kwargs):
            built_langs.append(lang)

        def set_other_lang_ac(self, other):
            pass

    _install_stub_autocompleter(monkeypatch, StubAutoCompleter)
    build = lambda: text.Library.build_full_auto_completer(fake)

    # Hold the lock so every builder increments `requested` and then queues on it. Polling
    # `requested` between starts serializes the increments deterministically (the increment is
    # outside the lock, so without this the non-atomic read-modify-write could race under threads).
    fake._full_ac_build_lock.acquire()
    threads = []
    for i in range(3):
        th = threading.Thread(target=build)
        th.start()
        threads.append(th)
        assert _wait_until(lambda: fake._full_ac_requested == i + 1), "builder %d never incremented" % i
    fake._full_ac_build_lock.release()
    for th in threads:
        th.join(5)

    # All three were pending before the (single) builder snapshotted `covered`, so they coalesce.
    assert built_langs.count("en") == 1
    assert built_langs.count("he") == 1
    assert fake._full_auto_completer_is_ready is True


def test_request_after_reads_began_is_not_coalesced(monkeypatch):
    """The regression guard: a request that arrives after a build's reads began must NOT be
    coalesced into that (now-stale) build -- it has to trigger its own fresh rebuild.

    Under the pre-fix logic (completed = requested read at build END) this collapses to a single
    build and the second request is silently dropped; under the fix (completed = `covered`
    snapshotted at build START) the second request rebuilds."""
    fake = _make_fake_library()
    built_langs = []
    a_is_reading = threading.Event()   # set once builder A is inside the build (reads have begun)
    a_may_finish = threading.Event()   # the test releases A to complete

    class StubAutoCompleter:
        def __init__(self, lang, lib, **kwargs):
            built_langs.append(lang)
            if not a_is_reading.is_set():   # only the first builder parks here, holding the lock
                a_is_reading.set()
                a_may_finish.wait(5)

        def set_other_lang_ac(self, other):
            pass

    _install_stub_autocompleter(monkeypatch, StubAutoCompleter)
    build = lambda: text.Library.build_full_auto_completer(fake)

    a = threading.Thread(target=build)
    a.start()
    assert a_is_reading.wait(5), "builder A never started reading"   # A holds the lock, mid-read

    # B's request arrives strictly after A's reads began (so after A snapshotted `covered`).
    b = threading.Thread(target=build)
    b.start()
    assert _wait_until(lambda: fake._full_ac_requested == 2), "builder B never queued"

    a_may_finish.set()
    a.join(5)
    b.join(5)

    # Two full builds ran (A and B); B was not coalesced away.
    assert built_langs.count("en") == 2
    assert built_langs.count("he") == 2
