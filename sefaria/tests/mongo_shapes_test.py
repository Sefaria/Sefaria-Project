"""Tests for the mongomock query-shape tracker."""
import importlib.util
import json
import os

import mongomock
import pytest
from pymongo.errors import OperationFailure

from sefaria.tests import mongo_shapes
from sefaria.tests.mongo_shapes import (
    FORMAT, ShapeTracker, drift_message, load_shapes, projection_fields, referenced_fields, shape_drift)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORTER = os.path.join(REPO_ROOT, "scripts", "pytest_minimal_dataset", "export_mongo_fixtures.py")


@pytest.fixture(scope="module")
def tracker():
    t = ShapeTracker()
    t.install()
    return t


@pytest.fixture
def db():
    return mongomock.MongoClient().db


def test_install_is_idempotent(tracker):
    tracker.install()
    from mongomock import collection as mc
    wrapped = mc.Collection.find
    tracker.install()
    assert mc.Collection.find is wrapped


def test_find_filter_fields_are_observed(tracker, db):
    db.index.insert_one({"title": "a", "categories": ["x"]})
    with tracker.recording() as seen:
        list(db.index.find({"title": "a", "categories.0": "x"}))
    assert seen == {"index": {"title", "categories"}}


def test_aggregate_match_fields_are_observed(tracker, db):
    db.links.insert_one({"refs": ["a", "b"]})
    with tracker.recording() as seen:
        list(db.links.aggregate([{"$match": {"refs": "a"}}, {"$group": {"_id": "$refs"}}]))
    assert seen["links"] == {"refs"}


def test_projection_fields_are_observed(tracker, db):
    db.index.insert_one({"title": "a", "heTitle": "b", "other": 1})
    with tracker.recording() as seen:
        list(db.index.find({}, {"title": 1, "heTitle": 1, "_id": 0}))
        list(db.index.find({}, ["other"]))
    assert seen["index"] == {"title", "heTitle", "other"}
    assert projection_fields({"a.b": 1, "c": 0}) == {"a"}


def test_nothing_recorded_outside_window(tracker, db):
    db.index.insert_one({"title": "seed"})
    list(db.index.find({"title": "seed"}))
    with tracker.recording() as seen:
        pass
    assert seen == {}
    list(db.index.find({"late": 1}))
    assert seen == {}


def test_insert_notes_collection_only(tracker, db):
    with tracker.recording() as seen:
        db.fresh.insert_one({"a": 1})
    assert seen == {"fresh": set()}


def test_new_field_is_drift():
    drift = shape_drift({"index": {"title", "slug"}}, {"index": {"title"}})
    assert drift == [("index", ["slug"])]
    assert shape_drift({"index": {"title"}}, {"index": {"title", "slug"}}) == []


def test_new_collection_is_drift():
    drift = shape_drift({"index": {"title"}, "links": set()}, {"index": {"title"}})
    assert drift == [("links", [])]
    assert "(whole collection is new)" in drift_message("t.py::x", drift)


def test_hint_is_flagged(tracker, db):
    db.index.insert_one({"title": "a"})
    with tracker.recording():
        with pytest.raises(OperationFailure):  # mongomock itself rejects the kwarg; the flag is noted first
            db.index.find({}, hint="title_1")
        assert tracker.flags == {"hint:title_1"}
    with tracker.recording():
        list(db.index.find({}).hint("title_2"))
        assert tracker.flags == {"hint:title_2"}
    assert "mark the test needs_corpus" in drift_message("t.py::x", [], tracker.flags | {"hint:z"})


def test_drift_message_ends_with_fix_command():
    message = drift_message("a/b_test.py::T::t", [("index", ["slug"])])
    assert message.splitlines()[-1] == "Fix: python scripts/pytest_minimal_dataset/rerecord_fixtures.py --only 'a/b_test.py::T::t'"
    assert "new fields ['slug']" in message


def test_load_shapes_roundtrip(tmp_path):
    assert load_shapes(str(tmp_path / "missing.json")) is None
    path = tmp_path / "_shapes.json"
    path.write_text(json.dumps({"format": FORMAT, "shapes": {"n": {"index": ["title"]}}}))
    assert load_shapes(str(path)) == {"n": {"index": {"title"}}}


def test_referenced_fields_agrees_with_the_exporter():
    spec = importlib.util.spec_from_file_location("export_mongo_fixtures_under_test", EXPORTER)
    exporter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exporter)

    def top(fields):
        return {f.split(".", 1)[0] for f in fields}

    filters = [
        {"title": "a"},
        {"$and": [{"a": 1}, {"$or": [{"b": 2}, {"c": {"$in": [1, 2]}}]}]},
        {"categories.0": "x", "refs": {"$regex": "^a"}},
        {"$expr": {"$eq": ["$field", "$other.sub"]}},
        {"items": {"$elemMatch": {"k": 1, "v": 2}}},
        {"a.b.c": {"$gt": 1}},
    ]
    for f in filters:
        mine, theirs = referenced_fields(f), top(exporter.referenced_fields(f))
        # the tracker may see more (nested elemMatch keys); it must never see less
        assert theirs <= mine, f
    for f in filters[:4] + filters[5:]:
        assert referenced_fields(f) == top(exporter.referenced_fields(f)), f
