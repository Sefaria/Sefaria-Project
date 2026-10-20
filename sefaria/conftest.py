import json
import hashlib
import os
import re
import sys

# sys._called_from_test must be set before ANY sefaria import below, not just
# inside pytest_configure() further down this file. The `patch(...).start()`
# call a few lines down resolves "sefaria.model.topic.Topic.get_pools" eagerly,
# at conftest module-load time -- long before pytest_configure() runs -- and
# that import chain pulls in sefaria.system.database transitively. database.py
# decides once, at its own import time, whether to attach QueryCounter as a
# pymongo event listener, based on hasattr(sys, "_called_from_test"). Setting
# the flag only in pytest_configure() is too late: the client gets built with
# zero listeners, and QueryCounter silently observes 0 commands for every test
# even though Mongo is queried constantly. TEST_DB == SEFARIA_DB (see
# database.py), so setting this earlier changes no test's target database --
# it only fixes when the listener gets attached.
sys._called_from_test = True

import pytest
from unittest.mock import patch, MagicMock

_MOCK_MONGO_ENABLED = os.environ.get("SEFARIA_MOCK_MONGO") == "1"
_MOCK_MONGO_CLIENT = None
_MOCK_MONGO_SENTINEL = "__sefaria_mock_mongo_bootstrap__"
# SEFARIA_MONGO_FIXTURE_DIR lets the re-record proof verify freshly written
# fixtures in a temp dir; the base, the overlays and _shapes.json all come from it.
_MONGO_FIXTURE_DIR = os.environ.get("SEFARIA_MONGO_FIXTURE_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "tests", "fixtures", "mongo")
_MONGO_BASE_FIXTURE = os.path.join(_MONGO_FIXTURE_DIR, "_base.json")
_SHAPES_FILE = os.path.join(_MONGO_FIXTURE_DIR, "_shapes.json")
# check (default): fail a needs_mongo test that touches Mongo beyond its recorded shape;
# write: record the shapes; off: neither.
_SHAPES_MODE = os.environ.get("SEFARIA_FIXTURE_SHAPES", "check")
_SHAPES = None
_written_shapes = {}

# --- Local-Mongo endpoint override, applied BEFORE sefaria.system.database is
# imported (its MongoClient is built from module-level constants at import time,
# so this must land first). Only takes effect when SEFARIA_TEST_MONGO=1; every
# other env keeps loading Mongo settings from local_settings.py as normal.
if os.environ.get("SEFARIA_TEST_MONGO") == "1":
    from sefaria import settings as _sefaria_settings
    from sefaria import local_settings_pytest as _pytest_mongo_settings

    if _pytest_mongo_settings.MONGO_HOST not in ("127.0.0.1", "localhost"):
        raise RuntimeError(
            "sefaria/local_settings_pytest.py must point at a loopback Mongo host; "
            f"got {_pytest_mongo_settings.MONGO_HOST!r}. Refusing to run the suite "
            "against a shared/cluster Mongo."
        )
    _sefaria_settings.MONGO_HOST = _pytest_mongo_settings.MONGO_HOST
    _sefaria_settings.MONGO_PORT = int(
        os.environ.get("LOCAL_TEST_MONGO_PORT", _pytest_mongo_settings.MONGO_PORT)
    )
    _sefaria_settings.SEFARIA_DB = _pytest_mongo_settings.SEFARIA_DB
    _sefaria_settings.SEFARIA_DB_USER = _pytest_mongo_settings.SEFARIA_DB_USER
    _sefaria_settings.SEFARIA_DB_PASSWORD = _pytest_mongo_settings.SEFARIA_DB_PASSWORD
    # A replica-set name makes pymongo wait for a primary that a loopback test Mongo
    # (or the mock) never has; database.py reads this at import time.
    _sefaria_settings.MONGO_REPLICASET_NAME = None

if _MOCK_MONGO_ENABLED:
    import mongomock
    from bson import json_util
    from sefaria import settings as _sefaria_settings

    from sefaria.tests.mongo_shapes import ShapeTracker, load_shapes, shape_drift, drift_message

    # One tracker per process: install() patches mongomock classes globally.
    _SHAPES = ShapeTracker()
    _SHAPES.install()
    _MOCK_MONGO_CLIENT = mongomock.MongoClient()
    # mongomock lists databases lazily; database.py checks existence before it
    # assigns `db`, so create one collection in the configured DB up front.
    _MOCK_MONGO_CLIENT[_sefaria_settings.SEFARIA_DB][_MOCK_MONGO_SENTINEL].insert_one({"_id": "exists"})
    if os.path.isfile(_MONGO_BASE_FIXTURE):
        with open(_MONGO_BASE_FIXTURE) as f:
            payload = json_util.loads(f.read())
        # insert_many, not replace_one per doc: the base now carries the whole
        # Tanakh/Mishnah/Talmud index family (~7,700 documents). Measured on this
        # payload, per-document replace_one into mongomock costs 12.8s against
        # 0.6s for insert_many, and _seed_mock_mongo repeats the seed for every
        # needs_mongo test. The target collections are empty here (fresh client),
        # so upsert semantics are not needed.
        for collection, docs in payload.get("collections", {}).items():
            if docs:
                _MOCK_MONGO_CLIENT[_sefaria_settings.SEFARIA_DB][collection].insert_many(docs)
    patch("pymongo.MongoClient", return_value=_MOCK_MONGO_CLIENT).start()

# NOTE: sefaria.system.database is NOT imported here at module load time.
# database.py builds its MongoClient (and decides whether to attach QueryCounter
# as an event listener) from module-level code that checks `hasattr(sys,
# "_called_from_test")` at *import* time. Importing it eagerly here, before
# pytest_configure() below sets that attribute, silently builds the client with
# zero listeners -- QueryCounter.started()/succeeded() then never fire and the
# recorder observes 0 commands for every test even though Mongo is queried
# constantly. Every access to QueryCounter in this file must go through the
# _query_counter() lazy accessor so the first import happens after
# pytest_configure() has run.
_QueryCounter = None


def _query_counter():
    global _QueryCounter
    if _QueryCounter is None:
        from sefaria.system.database import QueryCounter as _QC
        _QueryCounter = _QC
    return _QueryCounter


# --- Mongo-usage recorder artifacts ---
# One JSONL file per collected test at .artifacts/mongo-usage/<sanitized-nodeid>.jsonl
# (one JSON object per Mongo command: nodeid, phase, command, collection, filter,
# doc_ids, n_returned), plus a roll-up _index.json mapping nodeid -> {commands,
# collections, total_docs}. A test with no file made zero Mongo calls. This is
# recording-pass infrastructure for the DB-decoupling investigation; it only runs
# when SEFARIA_RECORD_MONGO=1 is set, so a normal test/CI run pays nothing for it.
_ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".artifacts", "mongo-usage")
_recorder_index = {}


def _recording_enabled():
    return os.environ.get("SEFARIA_RECORD_MONGO") == "1"


def _sanitize_nodeid(nodeid):
    sanitized = re.sub(r'[^A-Za-z0-9_.-]', '_', nodeid)
    if len(sanitized) <= 180:
        return sanitized
    digest = hashlib.sha256(nodeid.encode("utf-8")).hexdigest()[:16]
    return f"{sanitized[:160]}_{digest}"


def _mongo_fixture_path(nodeid):
    return os.path.join(_MONGO_FIXTURE_DIR, _sanitize_nodeid(nodeid) + ".json")


_fixture_cache = {}


def _load_fixture(path):
    from bson import json_util

    # Cached because _seed_mock_mongo reloads the shared base for every
    # needs_mongo test. mongomock deep-copies documents on both insert and
    # read, so a cached payload cannot be mutated by a test.
    if path not in _fixture_cache:
        with open(path) as f:
            _fixture_cache[path] = json_util.loads(f.read())
    return _fixture_cache[path]


def _insert_fixture(active_db, payload, bulk=False):
    # `bulk` is for a seed into freshly dropped collections, where upsert
    # semantics are unnecessary: insert_many is ~20x faster than per-document
    # replace_one on the shared base (measured: 0.6s vs 12.8s).
    for collection, docs in payload.get("collections", {}).items():
        if docs:
            if bulk:
                active_db[collection].insert_many(docs)
            else:
                for doc in docs:
                    active_db[collection].replace_one({"_id": doc["_id"]}, doc, upsert=True)
        elif collection not in active_db.list_collection_names():
            active_db.create_collection(collection)


def _json_default(o):
    try:
        return str(o)
    except Exception:
        return repr(o)


def _flush_phase():
    records = _query_counter().end_recording()
    if not records:
        return
    nodeid = records[0]['nodeid']
    os.makedirs(_ARTIFACT_DIR, exist_ok=True)
    path = os.path.join(_ARTIFACT_DIR, _sanitize_nodeid(nodeid) + '.jsonl')
    with open(path, 'a') as f:
        for r in records:
            f.write(json.dumps(r, default=_json_default) + '\n')
    entry = _recorder_index.setdefault(nodeid, {'commands': 0, 'collections': set(), 'total_docs': 0})
    for r in records:
        entry['commands'] += 1
        if r.get('collection'):
            entry['collections'].add(r['collection'])
        entry['total_docs'] += len(r.get('doc_ids') or [])


@pytest.hookimpl(hookwrapper=True)
def pytest_collection_modifyitems(session, config, items):
    if not _recording_enabled():
        yield
        return
    # Everything below runs after `yield`, i.e. after pytest's own -m / -k /
    # --deselect filtering, so it only touches tests that will actually run. Before
    # the yield, a `-m needs_mongo` recording run would zero the measurements of
    # every test it deselected.
    yield
    # Clear stale artifacts ONLY for the tests this run actually collected, so a
    # run scoped to one suite cannot destroy another suite's measurements.
    #
    # This used to wipe the whole directory, which meant recording ./reader/tests
    # silently deleted every artifact previously recorded for ./sefaria/tests --
    # measurement is accumulated across many scoped runs, so whole-directory
    # cleanup loses work that is expensive to reproduce. It also raced when two
    # recording processes ran at once, both unlinking the same paths.
    if os.path.isdir(_ARTIFACT_DIR):
        for item in items:
            stale = os.path.join(_ARTIFACT_DIR, _sanitize_nodeid(item.nodeid) + ".jsonl")
            try:
                os.remove(stale)
            except FileNotFoundError:
                pass  # never recorded, or another process got there first
    # Seed every collected nodeid at zero so tests that never touch Mongo are
    # still present in _index.json (an absent .jsonl file plus a zero entry here
    # is the "made zero Mongo calls" signal, not just a missing key).
    for item in items:
        _recorder_index.setdefault(item.nodeid, {'commands': 0, 'collections': set(), 'total_docs': 0})


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_setup(item):
    if not _recording_enabled():
        yield
        return
    _query_counter().begin_recording(item.nodeid, 'setup')
    yield
    _flush_phase()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_call(item):
    if not _recording_enabled():
        yield
        return
    _query_counter().begin_recording(item.nodeid, 'call')
    yield
    _flush_phase()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_teardown(item):
    if not _recording_enabled():
        yield
        return
    _query_counter().begin_recording(item.nodeid, 'teardown')
    yield
    _flush_phase()


def _flush_shapes():
    """Merge this session's observed shapes into _shapes.json: entries not re-observed are kept."""
    from sefaria.tests.fixture_schema import schema_digests
    merged = {"shapes": {}}
    if os.path.isfile(_SHAPES_FILE):
        with open(_SHAPES_FILE) as f:
            merged = json.load(f)
    shapes = merged.get("shapes", {})
    shapes.update({nodeid: {c: sorted(fields) for c, fields in cols.items()} for nodeid, cols in _written_shapes.items()})
    payload = {"format": 1, "schema": schema_digests(), "shapes": shapes}
    with open(_SHAPES_FILE, "w") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
        f.write("\n")


def pytest_sessionfinish(session, exitstatus):
    if _MOCK_MONGO_ENABLED and _SHAPES_MODE == "write" and _written_shapes:
        _flush_shapes()
    if not _recording_enabled() or not _recorder_index:
        return
    os.makedirs(_ARTIFACT_DIR, exist_ok=True)
    serializable = {
        nodeid: {
            'commands': v['commands'],
            'collections': sorted(v['collections']),
            'total_docs': v['total_docs'],
        }
        for nodeid, v in _recorder_index.items()
    }
    # Merge into any existing index rather than overwriting it: the index is the
    # union of every scoped recording run, not a snapshot of the last one.
    index_path = os.path.join(_ARTIFACT_DIR, '_index.json')
    merged = {}
    if os.path.isfile(index_path):
        try:
            with open(index_path) as f:
                merged = json.load(f)
        except (ValueError, OSError):
            merged = {}
    merged.update(serializable)
    with open(index_path, 'w') as f:
        json.dump(merged, f, indent=2, sort_keys=True)


def _build_real_mongo_library_toc():
    """Build the library TOC once for a run against a real Mongo, as
    reader/startup.py does for the web server. Code such as
    Library.get_collections_in_library() reads the tree without building it, so
    without this a test passes or fails depending on whether an earlier test
    happened to build it. Mock runs rebuild the library on every needs_mongo seed.

    A failure here (say, a category left behind by an interrupted run whose Term
    is gone) is reported but does not abort the session: the tests that need the
    TOC still fail on their own, and every other test still runs."""
    if _MOCK_MONGO_ENABLED:
        return
    import warnings
    from sefaria.model.text import library
    try:
        library.get_toc_tree()
    except Exception as e:  # noqa: BLE001 -- any bad record in a developer's DB
        warnings.warn(f"Could not build the library TOC before tests: {e!r}")


# True after a needs_mongo teardown has restored the shared base but not yet
# rebuilt `library` from it. The rebuild is deferred to the next test that runs:
# a needs_mongo test rebuilds during its own seed anyway, so rebuilding at
# teardown too would double the most expensive step of every needs_mongo test.
_library_stale = False


def _fixture_path_or_fail(nodeid, incomplete_ok, ci):
    path = _mongo_fixture_path(nodeid)
    if os.path.isfile(path):
        return path
    if incomplete_ok and ci:
        raise pytest.UsageError("SEFARIA_MOCK_MONGO_INCOMPLETE_OK is not allowed when CI=true")
    # A missing fixture must FAIL by default, not skip: skipping makes a marked set
    # exit 0 while almost nothing ran (measured: 3 passed, 73 skipped), the
    # false-green shape this pipeline already has a history of. INCOMPLETE_OK is
    # for converting a set by hand, never CI.
    msg = (f"SEFARIA_MOCK_MONGO=1 but no Mongo fixture exists for {nodeid}.\n"
           f"Fix: python scripts/pytest_minimal_dataset/rerecord_fixtures.py --only '{nodeid}'")
    if incomplete_ok:
        pytest.skip(msg)
    pytest.fail(msg, pytrace=False)


def reseed_mock_db(active_db, overlay_path=None, rebuild=True):
    """Reset the mock DB to the sentinel plus the shared base (plus an overlay), and clear the caches."""
    global _library_stale
    for collection in active_db.list_collection_names():
        active_db.drop_collection(collection)
    active_db[_MOCK_MONGO_SENTINEL].insert_one({"_id": "exists"})
    _insert_fixture(active_db, _load_fixture(_MONGO_BASE_FIXTURE), bulk=True)
    if overlay_path:
        _insert_fixture(active_db, _load_fixture(overlay_path))
    # `library` builds its title maps when sefaria.model is imported, and
    # seeding collections does not touch those in-memory maps, so Ref('Sotah')
    # would raise even with the Index document present. Rebuild after every
    # seed so refs resolved against a previous test's data are not reused.
    if rebuild:
        from sefaria.model.text import library
        library.rebuild(include_toc=True)
        _library_stale = False
    else:
        _library_stale = True
    from django.core.cache import caches
    for alias in _LOCMEM_CACHE_ALIASES:
        caches[alias].clear()


_loaded_shapes = None


def _verify_shapes(nodeid, observed, flags, needs_corpus):
    """Record (write) or check (check) what the test touched against its fixture's recorded shape."""
    global _loaded_shapes
    if _SHAPES_MODE == "off":
        return
    if _SHAPES_MODE == "write":
        _written_shapes[nodeid] = {c: set(f) for c, f in observed.items()}
        return
    if _loaded_shapes is None:
        _loaded_shapes = load_shapes(_SHAPES_FILE) or {}
    recorded = _loaded_shapes.get(nodeid)
    if recorded is None:
        pytest.fail(f"No recorded Mongo shape for {nodeid} in {_SHAPES_FILE}.\n"
                    f"Fix: python scripts/pytest_minimal_dataset/rerecord_fixtures.py --only '{nodeid}'", pytrace=False)
    drift = shape_drift(observed, recorded)
    if drift or (flags and not needs_corpus):
        pytest.fail(drift_message(nodeid, drift, flags if not needs_corpus else ()), pytrace=False)


@pytest.fixture(autouse=True)
def _seed_mock_mongo(request):
    global _library_stale
    if not _MOCK_MONGO_ENABLED:
        yield
        return
    if request.node.get_closest_marker("needs_mongo") is None:
        if _library_stale:
            from sefaria.model.text import library
            library.rebuild(include_toc=True)
            _library_stale = False
        yield
        return

    path = _fixture_path_or_fail(request.node.nodeid, os.environ.get("SEFARIA_MOCK_MONGO_INCOMPLETE_OK") == "1",
                                 os.environ.get("CI") == "true")

    from sefaria.system import database

    active_db = database.db

    try:
        reseed_mock_db(active_db, path)
        with _SHAPES.recording() as observed:
            yield
        _verify_shapes(request.node.nodeid, observed, _SHAPES.flags,
                       request.node.get_closest_marker("needs_corpus") is not None)
    finally:
        # Back to the session's starting state (sentinel + shared base), not an
        # empty DB: a later test in the same process that is not needs_mongo --
        # e.g. a needs_linker-only test in pytest-linker-job -- must see the same
        # data whether or not a needs_mongo test ran before it, including when
        # this setup failed part-way. The library rebuild is deferred (see
        # _library_stale) to whichever test runs next.
        reseed_mock_db(active_db, rebuild=False)

# Aliases the session overrides swapped to LocMemCache (see
# sefaria/local_settings_pytest.py); _seed_mock_mongo clears them on every reseed
# so a value cached from one test's fixture data is not read by a test seeded
# with different data.
_LOCMEM_CACHE_ALIASES = []


mock_topics_pool = {'sheets_topic_only': ['sheets', 'general_en', 'torah_tab'],
 'library_topic_only': ['library'],
 'sheets_and_library_topic': ['library', 'sheets', 'general_en']}


def mock_get_pools(self):
    return mock_topics_pool.get(self.slug, [])

_topic_pool_patch = None

def pytest_configure(config):
    import sys
    import django
    sys._called_from_test = True
    django.setup()

    global _topic_pool_patch
    if _topic_pool_patch is None:
        _topic_pool_patch = patch("sefaria.model.topic.Topic.get_pools", mock_get_pools)
        _topic_pool_patch.start()

    # The `vector_db` (pgvector) database is an external Postgres that is not
    # provisioned for the test run. Leaving it in DATABASES makes pytest-django's
    # setup_databases() attempt to create a test database for it, which fails auth
    # and errors every DB-backed test at setup. Drop it here (before any test DB is
    # set up) so the suite runs against `default` only. The pgvector-specific tests
    # are skipped separately. Remove this once pgvector is reachable in CI.
    from django.conf import settings as _dj_settings
    from django.db import connections as _dj_connections
    _dj_settings.DATABASES.pop("vector_db", None)
    # Bust the ConnectionHandler's cached settings so the popped alias is really gone.
    _dj_connections.__dict__.pop("settings", None)

    # ALLOWED_HOSTS, DummyCache -> LocMemCache, webpack-stats stubs and Varnish
    # off: every pytest-session settings override lives in one place,
    # sefaria/local_settings_pytest.py, and applies in CI and locally alike.
    from sefaria import settings as sefaria_settings
    from sefaria import local_settings_pytest as _pytest_settings
    _LOCMEM_CACHE_ALIASES[:] = _pytest_settings.apply_session_overrides(_dj_settings, sefaria_settings)
    for module in list(sys.modules.values()):
        if getattr(module, "USE_VARNISH", False):
            module.USE_VARNISH = False
    _build_real_mongo_library_toc()


def pytest_unconfigure(config):
    import sys
    global _topic_pool_patch
    if _topic_pool_patch is not None:
        _topic_pool_patch.stop()
        _topic_pool_patch = None
    del sys._called_from_test


@pytest.fixture(autouse=True)
def _block_salesforce_webhook():
    """Prevent any test from making real HTTP calls to the Salesforce webhook."""
    with patch("sefaria.helper.crm.tasks.requests.post") as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"success": True}),
            raise_for_status=MagicMock(),
        )
        yield mock_post
