import importlib.util
import os

import mongomock
import pytest

from sefaria import conftest as sc

MOCK = os.environ.get("SEFARIA_MOCK_MONGO") == "1"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_empty_overlay_collection_that_exists_is_noop():
    db = mongomock.MongoClient()["t"]
    sc._insert_fixture(db, {"collections": {"topics": [{"_id": 1}]}}, bulk=True)
    sc._insert_fixture(db, {"collections": {"topics": []}})
    assert db["topics"].count_documents({}) == 1


def test_missing_fixture_fails_with_command():
    with pytest.raises(pytest.fail.Exception) as e:
        sc._fixture_path_or_fail("x::y", incomplete_ok=False, ci=False)
    assert "rerecord_fixtures.py --only 'x::y'" in str(e.value)


def test_incomplete_ok_skips_locally():
    with pytest.raises(pytest.skip.Exception):
        sc._fixture_path_or_fail("x::y", incomplete_ok=True, ci=False)


def test_incomplete_ok_refused_in_ci():
    with pytest.raises(pytest.UsageError):
        sc._fixture_path_or_fail("x::y", incomplete_ok=True, ci=True)


def _base_counts():
    from bson import json_util
    with open(sc._MONGO_BASE_FIXTURE) as f:
        return {c: len(d) for c, d in json_util.loads(f.read())["collections"].items()}


@pytest.mark.skipif(not MOCK, reason="needs the mocked client")
def test_reseed_restores_base():
    from sefaria.system import database
    db = database.db
    db["junk_collection"].insert_one({"_id": 1})
    some = next(iter(_base_counts()))
    db[some].insert_one({"_id": "junk-doc"})
    sc.reseed_mock_db(db, overlay_path=None, rebuild=False)
    expected = {k: v for k, v in _base_counts().items() if v}
    actual = {c: db[c].count_documents({}) for c in db.list_collection_names()}
    assert actual.pop(sc._MOCK_MONGO_SENTINEL) == 1
    assert {c: n for c, n in actual.items() if n} == expected
    assert "junk_collection" not in actual


def test_sanitize_matches_exporter():
    spec = importlib.util.spec_from_file_location(
        "export_mongo_fixtures", os.path.join(ROOT, "scripts", "pytest_minimal_dataset", "export_mongo_fixtures.py"))
    exporter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exporter)
    ids = ["a/b_test.py::T::test[x]", "a/" + "long_" * 60 + "::t", "r/t.py::test[ab-cd]", "r/t.py::test[שלום]"]
    assert len(ids[1]) > 180
    for nodeid in ids:
        assert sc._sanitize_nodeid(nodeid) == exporter.sanitize_nodeid(nodeid)


def test_no_not_mockable_manifest_remains():
    assert not os.path.exists(os.path.join(sc._MONGO_FIXTURE_DIR, "_not-mockable.json"))
    assert not hasattr(sc, "_load_not_mockable")


@pytest.mark.skipif(not MOCK, reason="needs the mocked client")
def test_leak_never_reaches_a_needs_mongo_test():
    from sefaria.system import database
    db = database.db
    db["leaked_scratch"].insert_one({"_id": 1})
    db[next(iter(_base_counts()))].insert_one({"_id": "leaked-doc"})
    sc.reseed_mock_db(db, overlay_path=None, rebuild=False)
    assert "leaked_scratch" not in db.list_collection_names()
    assert db[next(iter(_base_counts()))].find_one({"_id": "leaked-doc"}) is None


@pytest.mark.skipif(not MOCK, reason="needs the mocked client")
def test_unmarked_scratch_collection_needs_no_fixture():
    from sefaria.system import database
    coll = database.db["scratch_without_fixture"]
    coll.insert_one({"_id": 1, "v": 2})
    assert coll.find_one({"_id": 1})["v"] == 2
