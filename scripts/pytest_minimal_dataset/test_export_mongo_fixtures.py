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


def _matches(doc, filt):
    for key, value in filt.items():
        if isinstance(value, dict) and "$in" in value:
            if doc.get(key) not in value["$in"]:
                return False
        elif doc.get(key) != value:
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
    huge = {
        "index": [
            {"_id": str(i), "title": "T" * 200, "pad": "x" * 20000}
            for i in range(500)
        ]
    }
    result = exp.write_base_fixture(str(tmp_path), huge)
    assert result is None
    assert path.read_bytes() == original


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
