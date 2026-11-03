"""Tests that the committed Mongo fixtures still match the model schemas."""
import json
import os

import pytest
from bson import json_util

from sefaria.model import abstract
from sefaria.tests import fixture_schema
from sefaria.tests.fixture_schema import schema_changes, schema_digests

FIXTURE_DIR = os.environ.get("SEFARIA_MONGO_FIXTURE_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "fixtures", "mongo")
RERECORD = "python scripts/pytest_minimal_dataset/rerecord_fixtures.py"


def _least_derived():
    out = {}
    for cls in abstract.get_record_classes():
        known = out.get(cls.collection)
        if known is None or len(cls.__mro__) < len(known.__mro__):
            out[cls.collection] = cls
    return out


def test_schema_digests_match_manifest():
    path = os.path.join(FIXTURE_DIR, "_shapes.json")
    if not os.path.isfile(path):
        pytest.skip(f"{path} does not exist yet")
    recorded = json.load(open(path)).get("schema")
    if not recorded:
        pytest.skip(f"{path} has no 'schema' key yet")
    changed = schema_changes(recorded, schema_digests())
    assert not changed, f"model schema changed for {sorted(changed)}: {changed}\nFix: {RERECORD}"


def test_schema_digests_are_well_formed():
    digests = schema_digests()
    assert "index" in digests
    for entry in digests.values():
        assert set(entry) == {"required", "optional", "schema_sha"}
        assert len(entry["schema_sha"]) == 12
        assert entry["required"] == sorted(entry["required"])


def test_base_docs_carry_required_attrs():
    payload = json_util.loads(open(os.path.join(FIXTURE_DIR, "_base.json"), encoding="utf-8").read())
    classes = _least_derived()
    violations = []
    for collection, docs in payload["collections"].items():
        cls = classes.get(collection)
        if cls is None:
            continue
        for doc in docs:
            missing = [a for a in cls.required_attrs if a not in doc]
            if missing:
                violations.append((collection, str(doc.get("_id")), missing))
    assert not violations, violations


def test_new_required_attr_is_reported(monkeypatch):
    from sefaria.model.text import Index
    recorded = schema_digests()
    monkeypatch.setattr(Index, "required_attrs", Index.required_attrs + ["x"])
    changed = schema_changes(recorded, schema_digests())
    assert list(changed) == ["index"]
    assert "x" in changed["index"]["required_added"]
