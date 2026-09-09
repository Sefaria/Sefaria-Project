import json
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
_MONGO_FIXTURE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests", "fixtures", "mongo")

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

if _MOCK_MONGO_ENABLED:
    import mongomock
    from bson import json_util
    from sefaria import settings as _sefaria_settings

    _MOCK_MONGO_CLIENT = mongomock.MongoClient()
    # mongomock lists databases lazily; database.py checks existence before it
    # assigns `db`, so create one collection in the configured DB up front.
    _MOCK_MONGO_CLIENT[_sefaria_settings.SEFARIA_DB][_MOCK_MONGO_SENTINEL].insert_one({"_id": "exists"})
    if os.path.isdir(_MONGO_FIXTURE_DIR):
        for name in sorted(os.listdir(_MONGO_FIXTURE_DIR)):
            if not name.endswith(".json"):
                continue
            with open(os.path.join(_MONGO_FIXTURE_DIR, name)) as f:
                payload = json_util.loads(f.read())
            for collection, docs in payload.get("collections", {}).items():
                for doc in docs:
                    _MOCK_MONGO_CLIENT[_sefaria_settings.SEFARIA_DB][collection].replace_one(
                        {"_id": doc["_id"]}, doc, upsert=True
                    )
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
    return re.sub(r'[^A-Za-z0-9_.-]', '_', nodeid)


def _mongo_fixture_path(nodeid):
    return os.path.join(_MONGO_FIXTURE_DIR, _sanitize_nodeid(nodeid) + ".json")


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
    # Clear stale artifacts from a previous recording run before this one starts,
    # so counts reflect only this invocation (JSONL flushing below appends).
    if os.path.isdir(_ARTIFACT_DIR):
        for name in os.listdir(_ARTIFACT_DIR):
            if name.endswith(".jsonl") or name == "_index.json":
                os.remove(os.path.join(_ARTIFACT_DIR, name))
    # Seed every collected nodeid at zero so tests that never touch Mongo are
    # still present in _index.json (an absent .jsonl file plus a zero entry here
    # is the "made zero Mongo calls" signal, not just a missing key).
    for item in items:
        _recorder_index.setdefault(item.nodeid, {'commands': 0, 'collections': set(), 'total_docs': 0})
    yield


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


def pytest_sessionfinish(session, exitstatus):
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
    with open(os.path.join(_ARTIFACT_DIR, '_index.json'), 'w') as f:
        json.dump(serializable, f, indent=2, sort_keys=True)


@pytest.fixture(autouse=True)
def _seed_mock_mongo(request):
    if not _MOCK_MONGO_ENABLED:
        yield
        return
    if request.node.get_closest_marker("needs_mongo") is None:
        yield
        return

    path = _mongo_fixture_path(request.node.nodeid)
    if not os.path.isfile(path):
        # A missing fixture must FAIL by default, not skip. Conversion to mocked
        # Mongo is incremental, so most needs_mongo tests have no fixture yet --
        # and skipping them makes the whole marked set exit 0 while almost nothing
        # ran (measured: 3 passed, 73 skipped). That is the false-green shape this
        # pipeline already has a documented history of. Set
        # SEFARIA_MOCK_MONGO_INCOMPLETE_OK=1 while converting a set by hand; never
        # in CI.
        message = (
            f"SEFARIA_MOCK_MONGO=1 but no Mongo fixture exists for {request.node.nodeid}. "
            f"Generate one with scripts/pytest_minimal_dataset/export_mongo_fixtures.py, "
            f"or set SEFARIA_MOCK_MONGO_INCOMPLETE_OK=1 to skip unconverted tests locally."
        )
        if os.environ.get("SEFARIA_MOCK_MONGO_INCOMPLETE_OK") == "1":
            pytest.skip(message)
        pytest.fail(message, pytrace=False)

    from bson import json_util
    from sefaria.system import database

    active_db = database.db
    for collection in active_db.list_collection_names():
        active_db.drop_collection(collection)
    with open(path) as f:
        payload = json_util.loads(f.read())
    for collection, docs in payload.get("collections", {}).items():
        if docs:
            active_db[collection].insert_many(docs)
        else:
            active_db.create_collection(collection)
    yield
    for collection in active_db.list_collection_names():
        active_db.drop_collection(collection)

mock_topics_pool = {'sheets_topic_only': ['sheets', 'general_en', 'torah_tab'],
 'library_topic_only': ['library'],
 'sheets_and_library_topic': ['library', 'sheets', 'general_en']}


def mock_get_pools(self):
    return mock_topics_pool.get(self.slug, [])

patch("sefaria.model.topic.Topic.get_pools", mock_get_pools).start()

def pytest_configure(config):
    import sys
    import django
    sys._called_from_test = True
    django.setup()

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

    # Disable Varnish cache invalidation for the entire test session. With
    # USE_VARNISH on (as in the CI sandbox), invalidate_linked() on a large
    # index iterates every linked ref and spawns varnishadm subprocesses,
    # hanging mutation tests for hours. Tests must not purge shared caches.
    from sefaria import settings as sefaria_settings
    sefaria_settings.USE_VARNISH = False
    for module in list(sys.modules.values()):
        if getattr(module, "USE_VARNISH", False):
            module.USE_VARNISH = False


def pytest_unconfigure(config):
    import sys
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
