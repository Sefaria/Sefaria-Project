import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import mongomock
import pytest

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


# --- T4: base kept in sync with the source, manifest, caps, loopback guard ----

NODEID = "sefaria/tests/example_test.py::test_x"


def _mock_source(**collections):
    client = mongomock.MongoClient()
    db = client["sefaria"]
    for name, docs in collections.items():
        if docs:
            db[name].insert_many([dict(d) for d in docs])
    return client


def _write_artifact(artifact_dir, records):
    artifact_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_dir / "run.jsonl"
    path.write_text("".join(json.dumps(r) + "\n" for r in records))
    return path


def _run_main(monkeypatch, argv, client):
    monkeypatch.setattr(exp.pymongo, "MongoClient", lambda *a, **k: client)
    monkeypatch.setattr(sys, "argv", ["export_mongo_fixtures.py"] + argv)
    return exp.main()


def test_base_refresh_drops_docs_deleted_from_source():
    db = _mock_source(index=[{"_id": "1", "title": "Genesis"}])["sefaria"]
    acc = defaultdict(dict)
    acc["index"]["1"] = {"_id": "1", "title": "Genesis"}
    acc["index"]["2"] = {"_id": "2", "title": "Deleted At Source"}
    dropped = exp.refresh_base_from_source(db, acc)
    assert dropped == {"index": ["2"]}
    assert set(acc["index"]) == {"1"}


def test_base_refresh_takes_edited_doc_from_source():
    db = _mock_source(index=[{"_id": "1", "title": "New Title"}])["sefaria"]
    acc = defaultdict(dict)
    acc["index"]["1"] = {"_id": "1", "title": "Old Title"}
    dropped = exp.refresh_base_from_source(db, acc)
    assert dropped == {}
    assert acc["index"]["1"]["title"] == "New Title"


def test_rejected_base_aborts_full_export(tmp_path, monkeypatch):
    out = tmp_path / "fixtures"
    out.mkdir()
    exp.write_base_fixture(str(out), {"index": [{"_id": "a", "title": "Genesis"}]})
    original = (out / "_base.json").read_bytes()
    artifacts = tmp_path / "artifacts"
    _write_artifact(artifacts, [{
        "nodeid": NODEID, "collection": "index", "command": "find",
        "filter": {"title": "Genesis"}, "n_returned": 1, "doc_ids": ["a"],
    }])
    client = _mock_source(index=[{"_id": "a", "title": "Genesis", "categories": ["Tanakh"], "pad": "x" * 5000}])
    monkeypatch.setattr(exp, "MAX_BASE_BYTES", 200)
    with pytest.raises(SystemExit) as info:
        _run_main(monkeypatch, [
            "sefaria/tests/example_test.py", "--artifact-dir", str(artifacts),
            "--output-dir", str(out),
        ], client)
    assert info.value.code not in (None, 0)
    assert (out / "_base.json").read_bytes() == original


def test_oversized_overlay_is_an_error(tmp_path, monkeypatch):
    out = tmp_path / "fixtures"
    exp.write_base_fixture(str(out), {"index": [{"_id": "a", "title": "Genesis"}]})
    artifacts = tmp_path / "artifacts"
    _write_artifact(artifacts, [{
        "nodeid": NODEID, "collection": "texts", "command": "find",
        "filter": {"title": "Exodus", "language": "en"}, "n_returned": 1, "doc_ids": ["t1"],
    }])
    client = _mock_source(texts=[{"_id": "t1", "title": "Exodus", "language": "en", "chapter": [["x" * 500]]}])
    monkeypatch.setattr(exp, "MAX_FIXTURE_BYTES", 50)
    with pytest.raises(SystemExit) as info:
        _run_main(monkeypatch, [
            "sefaria/tests/example_test.py", "--artifact-dir", str(artifacts),
            "--output-dir", str(out),
        ], client)
    message = str(info.value.code)
    assert NODEID in message
    assert "needs_corpus" in message
    assert not (out / "_not-mockable.json").exists()


def test_find_and_modify_filter_is_replayed():
    client = _mock_source(texts=[
        {"_id": "t1", "title": "Exodus", "language": "en", "chapter": [["x"]]},
        {"_id": "t2", "title": "Leviticus", "language": "en", "chapter": [["y"]]},
    ])
    records = [{
        "nodeid": NODEID, "command": "findAndModify", "collection": "texts",
        "filter": {"title": "Exodus", "language": "en"}, "n_returned": 1, "doc_ids": [],
    }]
    overlay, _ = exp.collect_docs(client["sefaria"], records)
    assert [d["_id"] for d in overlay["texts"]] == ["t1"]


def test_refuses_non_loopback(tmp_path, monkeypatch):
    def no_client(*a, **k):
        raise AssertionError("must not open a Mongo client for a non-loopback host")

    monkeypatch.setattr(exp.pymongo, "MongoClient", no_client)
    monkeypatch.setattr(sys, "argv", [
        "export_mongo_fixtures.py", "sefaria/tests/example_test.py",
        "--host", "10.1.2.3", "--output-dir", str(tmp_path),
    ])
    with pytest.raises(SystemExit) as info:
        exp.main()
    assert "non-loopback" in str(info.value.code)


def test_manifest_lists_every_fixture_with_sha256(tmp_path):
    exp.write_base_fixture(str(tmp_path), {"index": [{"_id": "a", "title": "Genesis"}]})
    exp.write_fixture(
        str(tmp_path), NODEID, {"links": [{"_id": "a", "ref": "1"}]},
        records=[{"collection": "links", "filter": {"ref": "1"}}],
    )
    exp.write_manifest(str(tmp_path))
    text = (tmp_path / "_manifest.json").read_text()
    manifest = json.loads(text)
    assert text == json.dumps(manifest, indent=1, sort_keys=True) + "\n"
    assert manifest["format"] == 1
    assert manifest["source"] == {}
    fname = exp.sanitize_nodeid(NODEID) + ".json"
    assert set(manifest["fixtures"]) == {fname}
    entry = manifest["fixtures"][fname]
    assert entry["nodeid"] == NODEID
    assert entry["collections"] == ["links"]
    assert entry["sha256"] == hashlib.sha256((tmp_path / fname).read_bytes()).hexdigest()
    assert manifest["base"]["sha256"] == hashlib.sha256((tmp_path / "_base.json").read_bytes()).hexdigest()


def test_output_dir_is_honoured_for_manifest(tmp_path, monkeypatch):
    out = tmp_path / "out"
    default_dir = tmp_path / "default"
    default_dir.mkdir()
    exp.write_base_fixture(str(out), {"index": [{"_id": "a", "title": "Genesis"}]})
    monkeypatch.setattr(exp, "DEFAULT_FIXTURE_DIR", str(default_dir))
    stamp = tmp_path / "stamp.json"
    stamp.write_text(json.dumps({"dump_url": "https://example.test/dump", "etag": "e1"}))
    monkeypatch.setattr(sys, "argv", [
        "export_mongo_fixtures.py", "--manifest-only", "--output-dir", str(out),
        "--source-stamp-json", str(stamp),
    ])
    exp.main()
    manifest = json.loads((out / "_manifest.json").read_text())
    assert manifest["source"]["dump_url"] == "https://example.test/dump"
    assert manifest["source"]["etag"] == "e1"
    assert list(default_dir.iterdir()) == []


def _scan(collection, ids, cursor_id=7, batch=101):
    """Records of an unfiltered find over `ids` in batches, as the recorder writes them."""
    first, rest = ids[:batch], ids[batch:]
    records = [{"nodeid": NODEID, "command": "find", "collection": collection, "filter": {},
                "doc_ids": first, "n_returned": len(first), "cursor_id": cursor_id if rest else None}]
    while rest:
        chunk, rest = rest[:batch], rest[batch:]
        records.append({"nodeid": NODEID, "command": "getMore", "collection": collection, "filter": None,
                        "doc_ids": chunk, "n_returned": len(chunk), "cursor_id": cursor_id})
    return records


def test_library_wide_scan_is_not_copied_into_base(monkeypatch, capsys):
    monkeypatch.setattr(exp, "SCAN_COPY_LIMIT", 5)
    index = [{"_id": f"i{n}", "title": f"Book{n}", "categories": ["Halakhah"]} for n in range(12)]
    client = _mock_source(index=index)
    records = _scan("index", [d["_id"] for d in index]) + [{
        "nodeid": NODEID, "command": "find", "collection": "index",
        "filter": {"title": "Book3"}, "doc_ids": ["i3"], "n_returned": 1, "cursor_id": None,
    }]
    _, base = exp.collect_docs(client["sefaria"], records)
    assert [d["title"] for d in base["index"]] == ["Book3"]
    assert "not copying 12 index doc(s)" in capsys.readouterr().err


def test_scan_batches_are_attributed_by_cursor(monkeypatch):
    monkeypatch.setattr(exp, "SCAN_COPY_LIMIT", 5)
    ids = [f"v{n}" for n in range(9)]
    positions, summary = exp.library_wide_scans(_scan("vstate", ids, batch=3))
    assert positions == {0, 1, 2} and summary == [("vstate", 9)]


def test_small_unfiltered_read_is_still_copied(monkeypatch):
    monkeypatch.setattr(exp, "SCAN_COPY_LIMIT", 5)
    sites = [{"_id": f"w{n}", "domains": [f"d{n}.org"]} for n in range(3)]
    client = _mock_source(websites=sites)
    overlay, _ = exp.collect_docs(client["sefaria"], _scan("websites", [d["_id"] for d in sites]))
    assert [d["_id"] for d in overlay["websites"]] == ["w0", "w1", "w2"]


def test_get_more_of_a_filtered_read_is_still_copied(monkeypatch):
    monkeypatch.setattr(exp, "SCAN_COPY_LIMIT", 5)
    ids = [f"v{n}" for n in range(9)]
    records = _scan("vstate", ids, batch=3)
    records[0]["filter"] = {"title": "Not Replayable At The Source"}
    positions, summary = exp.library_wide_scans(records)
    assert positions == set() and summary == []


def test_records_without_cursor_ids_keep_copying_get_more_batches(monkeypatch):
    # Artifacts recorded before the recorder wrote cursor_id: a getMore cannot be tied
    # to its find, so only the first batch counts toward the scan.
    monkeypatch.setattr(exp, "SCAN_COPY_LIMIT", 5)
    records = _scan("vstate", [f"v{n}" for n in range(9)], batch=3)
    for record in records:
        record.pop("cursor_id")
    assert exp.library_wide_scans(records) == (set(), [])


def test_base_over_cap_names_the_tests_that_grew_it(tmp_path, monkeypatch, capsys):
    out = tmp_path / "fixtures"
    out.mkdir()
    exp.write_base_fixture(str(out), {"index": [{"_id": "a", "title": "Genesis"}]})
    artifacts = tmp_path / "artifacts"
    _write_artifact(artifacts, [{
        "nodeid": NODEID, "collection": "index", "command": "find",
        "filter": {"title": "Big"}, "n_returned": 1, "doc_ids": ["b"],
    }])
    client = _mock_source(index=[
        {"_id": "a", "title": "Genesis", "categories": ["Tanakh"]},
        {"_id": "b", "title": "Big", "categories": ["Halakhah"], "pad": "x" * 5000},
    ])
    monkeypatch.setattr(exp, "MAX_BASE_BYTES", 2000)
    with pytest.raises(SystemExit):
        _run_main(monkeypatch, [
            "sefaria/tests/example_test.py", "--artifact-dir", str(artifacts), "--output-dir", str(out),
        ], client)
    assert f"base docs added by {NODEID}: index 1" in capsys.readouterr().err


def test_oversized_overlay_warning_breaks_down_collections(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(exp, "MAX_FIXTURE_BYTES", 50)
    docs = [{"_id": "t1", "title": "Exodus", "chapter": [], "language": "en"}]
    assert exp.write_fixture(str(tmp_path), NODEID, {"texts": docs}, []) is None
    assert "texts 1 docs" in capsys.readouterr().err


def test_scan_of_collection_outside_skip_list_is_still_copied(monkeypatch):
    monkeypatch.setattr(exp, "SCAN_COPY_LIMIT", 5)
    ids = [f"g{n}" for n in range(9)]
    assert exp.library_wide_scans(_scan("groups", ids, batch=3)) == (set(), [])
