import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import export_mongo_fixtures as exp


class FakeCursor(list):
    def sort(self, *args, **kwargs):
        return self


class FakeCollection:
    def __init__(self, docs):
        self.docs = list(docs)

    def find(self, filt=None, projection=None):
        filt = filt or {}
        out = []
        for doc in self.docs:
            if _matches(doc, filt):
                out.append(dict(doc))
        return FakeCursor(out)

    def find_one(self, filt=None):
        found = self.find(filt)
        return found[0] if found else None


def _get_path(doc, key):
    # Enough of Mongo's dotted-path lookup for "categories.0".
    value = doc
    for part in key.split("."):
        if isinstance(value, list):
            try:
                value = value[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


def _matches(doc, filt):
    for key, value in filt.items():
        if isinstance(value, dict) and "$in" in value:
            if _get_path(doc, key) not in value["$in"]:
                return False
        elif _get_path(doc, key) != value:
            return False
    return True


class FakeDB(dict):
    def __getitem__(self, name):
        if name not in self:
            self[name] = FakeCollection([])
        return dict.__getitem__(self, name)


def test_write_fixture_base_payload_uses_base_nodeid(tmp_path):
    path = exp.write_fixture(
        str(tmp_path),
        "_base",
        {"index": [{"_id": "a", "title": "Genesis"}]},
    )
    payload = json.loads(Path(path).read_text())
    assert payload["nodeid"] == "_base"
    assert set(payload["collections"]) == {"index"}


def test_base_fixture_is_compact_json(tmp_path):
    path = exp.write_base_fixture(
        str(tmp_path),
        {"index": [{"_id": "a", "title": "Genesis", "schema": {"x": 1}}]},
    )
    text = Path(path).read_text()
    assert "\n  " not in text
    assert json.loads(text)["nodeid"] == "_base"


def test_write_base_fixture_does_not_dump_entire_index(tmp_path):
    source = FakeDB()
    source["index"] = FakeCollection(
        [{"_id": n, "title": f"Book{n}", "categories": ["Tanakh"]} for n in range(20)]
    )
    source["category"] = FakeCollection(
        [{"_id": "c1", "path": ["Tanakh"]}]
    )
    source["term"] = FakeCollection([])
    needed = {
        "index": [source["index"].docs[0]],
        "category": [source["category"].docs[0]],
        "term": [],
    }
    path = exp.write_base_fixture(str(tmp_path), needed)
    payload = json.loads(Path(path).read_text())
    assert payload["nodeid"] == "_base"
    titles = [d["title"] for d in payload["collections"]["index"]]
    assert titles == ["Book0"]
    assert "Book19" not in titles


def test_collect_docs_splits_overlay_from_library_metadata():
    source = FakeDB()
    source["texts"] = FakeCollection(
        [{"_id": "t1", "title": "Exodus", "language": "en", "chapter": [["x"]]}]
    )
    source["index"] = FakeCollection(
        [{"_id": "i1", "title": "Exodus", "categories": ["Tanakh"], "schema": {}}]
    )
    source["category"] = FakeCollection([{"_id": "c1", "path": ["Tanakh"]}])
    source["term"] = FakeCollection([])
    records = [
        {
            "nodeid": "sefaria/tests/example.py::test_x",
            "collection": "texts",
            "command": "find",
            "filter": {"title": "Exodus", "language": "en"},
            "n_returned": 1,
            "doc_ids": ["t1"],
        }
    ]
    overlay, base = exp.collect_docs(source, records)
    assert "index" not in overlay
    assert "texts" in overlay
    assert [d["title"] for d in base["index"]] == ["Exodus"]


def test_oversized_base_does_not_replace_existing(tmp_path):
    small = {"index": [{"_id": "a", "title": "Genesis"}]}
    path = Path(exp.write_base_fixture(str(tmp_path), small))
    original = path.read_bytes()
    # Sized from the constant so the test keeps meaning if the cap moves again.
    pad = 20000
    count = exp.MAX_BASE_BYTES // pad + 10
    huge = {
        "index": [
            {"_id": str(i), "title": "T" * 200, "pad": "x" * pad}
            for i in range(count)
        ]
    }
    result = exp.write_base_fixture(str(tmp_path), huge)
    assert result is None
    assert path.read_bytes() == original


def test_base_cap_stays_inside_the_total_budget():
    assert exp.MAX_BASE_BYTES < exp.MAX_TOTAL_BYTES == 20 * 1024 * 1024


def _family_source():
    source = FakeDB()
    source["index"] = FakeCollection([
        {"_id": "i1", "title": "Genesis", "categories": ["Tanakh", "Torah"]},
        {"_id": "i2", "title": "Shabbat", "categories": ["Talmud", "Bavli", "Seder Moed"]},
        {"_id": "i3", "title": "Mishnah Avot", "categories": ["Mishnah", "Seder Nezikin"]},
        {"_id": "i4", "title": "Shulchan Arukh", "categories": ["Halakhah"]},
        {"_id": "i5", "title": "Delete Me", "categories": ["Tanakh"]},
    ])
    source["term"] = FakeCollection([{"_id": "t1", "name": "Torah"}])
    source["category"] = FakeCollection([{"_id": "c1", "path": ["Tanakh"]}])
    source["topic_link_types"] = FakeCollection([
        {"_id": "l1", "slug": "is-a", "validFrom": ["people"], "validTo": ["people"]},
    ])
    source["websites"] = FakeCollection([{"_id": "w1", "domains": ["opensiddur.org"]}])
    source["topics"] = FakeCollection([
        {"_id": "p1", "slug": "people"},
        {"_id": "p2", "slug": "moses"},
    ])
    return source


def test_library_families_copy_whole_families_and_skip_debris():
    from collections import defaultdict

    acc = defaultdict(dict)
    exp.enrich_base_with_library_families(_family_source(), acc)
    titles = sorted(d["title"] for d in acc["index"].values())
    assert titles == ["Genesis", "Mishnah Avot", "Shabbat"]
    assert "Shulchan Arukh" not in titles  # Halakhah is outside the budget
    assert "Delete Me" not in titles  # dump debris, not corpus
    assert set(acc["websites"]) == {"w1"}
    assert set(acc["topic_link_types"]) == {"l1"}
    # Only topics a link type names, not the whole ~11 MB collection.
    assert [d["slug"] for d in acc["topics"].values()] == ["people"]


def test_library_families_drop_debris_already_in_existing_base():
    from collections import defaultdict

    acc = defaultdict(dict)
    acc["index"]["i5"] = {"_id": "i5", "title": "Delete Me", "categories": ["Tanakh"]}
    exp.enrich_base_with_library_families(_family_source(), acc)
    assert "i5" not in acc["index"]


def test_base_fixture_keeps_reference_collections_and_drops_overlay_ones(tmp_path):
    path = exp.write_base_fixture(
        str(tmp_path),
        {
            "index": [{"_id": "a", "title": "Genesis"}],
            "topic_link_types": [{"_id": "l1", "slug": "is-a"}],
            "websites": [{"_id": "w1"}],
            "topics": [{"_id": "p1", "slug": "people"}],
            "texts": [{"_id": "t", "title": "Genesis"}],
            "links": [{"_id": "k"}],
        },
    )
    collections = json.loads(Path(path).read_text())["collections"]
    assert set(collections) == {"index", "topic_link_types", "websites", "topics"}


def test_existing_base_merge_does_not_duplicate_objectids(tmp_path):
    # The base is re-read on every export and merged with fresh query results
    # keyed by str(_id). Reading it with plain json turned ObjectIds into
    # {"$oid": ...} dicts, whose str() never matched, so every document the
    # export re-queried was written twice -- and conftest bulk-inserts the base,
    # which rejects a duplicate _id.
    from collections import defaultdict
    from bson import ObjectId

    oid = ObjectId("5f0000000000000000000001")
    exp.write_base_fixture(str(tmp_path), {"index": [{"_id": oid, "title": "Genesis"}]})
    acc = defaultdict(dict)
    exp.merge_base_docs(acc, exp.load_existing_base(str(tmp_path / "_base.json")))
    acc["index"][str(oid)] = {"_id": oid, "title": "Genesis"}
    assert list(acc["index"]) == [str(oid)]


def test_total_budget_check_fails_loudly(tmp_path, monkeypatch):
    import pytest

    (tmp_path / "_base.json").write_bytes(b"x" * 64)
    monkeypatch.setattr(exp, "MAX_TOTAL_BYTES", 32)
    with pytest.raises(SystemExit):
        exp.check_total_budget(str(tmp_path))
    monkeypatch.setattr(exp, "MAX_TOTAL_BYTES", 64)
    assert exp.check_total_budget(str(tmp_path)) == 64


def test_write_fixture_is_byte_stable(tmp_path):
    docs = {
        "links": [
            {"_id": "b", "ref": "2"},
            {"_id": "a", "ref": "1"},
        ]
    }
    p1 = Path(exp.write_fixture(str(tmp_path / "a"), "n", docs))
    p2 = Path(exp.write_fixture(str(tmp_path / "b"), "n", docs))
    assert p1.read_bytes() == p2.read_bytes()
    payload = json.loads(p1.read_text())
    assert [d["_id"] for d in payload["collections"]["links"]] == ["a", "b"]


def test_library_families_pull_in_missing_base_texts():
    from collections import defaultdict

    source = _family_source()
    source["index"].docs.append(
        {"_id": "i6", "title": "Netivot Olam", "categories": ["Jewish Thought"]}
    )
    acc = defaultdict(dict)
    acc["index"]["i7"] = {
        "_id": "i7",
        "title": "Notes on Netivot Olam",
        "categories": ["Jewish Thought", "Commentary"],
        "base_text_titles": ["Netivot Olam", "Not In Dump"],
    }
    exp.enrich_base_with_library_families(source, acc)
    titles = {d["title"] for d in acc["index"].values()}
    assert "Netivot Olam" in titles
    assert "Not In Dump" not in titles
