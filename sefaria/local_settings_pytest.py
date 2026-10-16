"""
local_settings_pytest.py -- settings that apply only to a pytest session.

Two parts:
  1. The Mongo endpoint for a run against a local mongod (below).
  2. The Django settings overrides every pytest session gets, in CI and on a
     developer machine alike (apply_session_overrides(), further down). They live
     here, in one place, rather than in the settings template CI writes, because a
     developer's own local_settings.py needs them too.

Only the three Mongo settings are defined here. sefaria/conftest.py imports this
module directly (see the block above the `from sefaria.system.database import
QueryCounter` line) and applies these three values to `sefaria.settings` *before*
sefaria.system.database is first imported, since database.py opens its MongoClient
at import time from module-level constants.

This file intentionally does not touch DATABASES, CACHES, or any other setting --
those keep coming from whatever local_settings.py / local_settings_example.py the
developer already has, via the normal sefaria/settings.py load path.

MONGO_HOST/MONGO_PORT MUST stay loopback. This file backs a local mongod restored
from Sefaria's public dump_small.tar.gz for a one-off decoupling investigation; it
must never be pointed at a shared or cluster Mongo, which the suite would mutate.
"""
import os as _os

MONGO_HOST = "127.0.0.1"
MONGO_PORT = 27018
# LOCAL_TEST_DB_NAME selects which local database the suite runs against --
# "sefaria" for the full restored dump, "sefaria_min" for the generated
# minimal dataset. Both live on the same loopback mongod.
SEFARIA_DB = _os.environ.get("LOCAL_TEST_DB_NAME", "sefaria")
SEFARIA_DB_USER = ""
SEFARIA_DB_PASSWORD = ""


# ---------------------------------------------------------------------------
# Django settings overrides for the pytest session
# ---------------------------------------------------------------------------
# Applied by sefaria/conftest.py pytest_configure() after django.setup(). None of
# them touches production: they change the in-process settings object for the
# duration of the test run only.

# Tests drive the request factory with the real host names they assert about
# (www.sefaria.org, voices.sef-stage.org, chiburim.localsefaria-il.xyz:8000, ...).
# sefaria.settings.ALLOWED_HOSTS -- the module-level list reader/views.py imports
# by value for the post-login redirect check -- is deliberately NOT changed, so
# tests asserting an unsafe `next` URL is rejected keep their real allowlist.
PYTEST_ALLOWED_HOSTS = ["*"]

# DummyCache makes every set/get round-trip return None. Master's CI sandbox ran
# the suite against django_redis, so swap each DummyCache alias for an in-process
# LocMemCache: a real cache with no external service.
_DUMMY_CACHE_BACKEND = "django.core.cache.backends.dummy.DummyCache"
_LOCMEM_CACHE_BACKEND = "django.core.cache.backends.locmem.LocMemCache"

# django-webpack-loader reads a stats JSON at render time. The pytest jobs never
# run the webpack build, so each loader gets a "built, no assets" stub unless a
# real stats file is already there. `chunks` must name every bundle a template
# renders; `main` is the only one (templates/base.html, templates/edit_text.html).
WEBPACK_STATS_STUB = {"status": "done", "chunks": {"main": []}, "assets": {}, "publicPath": "/static/"}


def _replace_dummy_caches(dj_settings):
    """Swap DummyCache aliases for LocMemCache, each with its own LOCATION, and
    return the swapped aliases. A distinct LOCATION keeps "default" and "shared"
    separate, as they are under Redis. django.core.cache.caches memoises the
    settings and any backend already built during django.setup(), so both are
    dropped for the new backends to take effect."""
    from django.core.cache import caches

    replaced = []
    for alias, config in dj_settings.CACHES.items():
        if config.get("BACKEND") == _DUMMY_CACHE_BACKEND:
            dj_settings.CACHES[alias] = {"BACKEND": _LOCMEM_CACHE_BACKEND, "LOCATION": f"sefaria-pytest-{alias}"}
            replaced.append(alias)
    if replaced:
        caches.__dict__.pop("settings", None)
        for alias in replaced:
            try:
                delattr(caches._connections, alias)
            except AttributeError:
                pass  # never instantiated
    return replaced


def _write_webpack_stats_stubs(dj_settings):
    import json

    for config in (getattr(dj_settings, "WEBPACK_LOADER", None) or {}).values():
        stats_file = config.get("STATS_FILE")
        if not stats_file or _os.path.exists(stats_file):
            continue
        _os.makedirs(_os.path.dirname(stats_file), exist_ok=True)
        with open(stats_file, "w") as f:
            json.dump(WEBPACK_STATS_STUB, f, indent=2, sort_keys=True)


def apply_session_overrides(dj_settings, sefaria_settings):
    """Apply every pytest-session override. Returns the cache aliases that were
    swapped to LocMemCache, which conftest clears on every mock-Mongo reseed."""
    dj_settings.ALLOWED_HOSTS = PYTEST_ALLOWED_HOSTS
    replaced = _replace_dummy_caches(dj_settings)
    _write_webpack_stats_stubs(dj_settings)
    # With USE_VARNISH on, invalidate_linked() on a large index spawns a
    # varnishadm subprocess per linked ref and hangs mutation tests for hours.
    sefaria_settings.USE_VARNISH = False
    return replaced
