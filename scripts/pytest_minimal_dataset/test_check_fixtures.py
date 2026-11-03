import hashlib
import json
import sys
from pathlib import Path

import pytest
from bson import json_util

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import check_fixtures as cf
import export_mongo_fixtures as exp

MANIFEST_FIX = "python scripts/pytest_minimal_dataset/export_mongo_fixtures.py --manifest-only"


def canonical(nodeid, collections=None):
    payload = {"nodeid": nodeid, "collections": collections or {"index": [{"_id": 1}]}}
    return json_util.dumps(payload, sort_keys=True, indent=2) + "\n"


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build(tmp_path, nodeids, shapes=True, manifest=True):
    """A consistent fixture dir for `nodeids`; returns the dir."""
    fixtures = {}
    for nid in nodeids:
        text = canonical(nid)
        name = exp.sanitize_nodeid(nid) + ".json"
        (tmp_path / name).write_text(text)
        fixtures[name] = {"nodeid": nid, "sha256": sha(text), "collections": ["index"]}
    base = json.dumps({"nodeid": "_base", "collections": {"index": []}}, sort_keys=True) + "\n"
    (tmp_path / "_base.json").write_text(base)
    if manifest:
        (tmp_path / "_manifest.json").write_text(json.dumps(
            {"format": 1, "source": {}, "fixtures": fixtures, "base": {"sha256": sha(base)}}))
    if shapes:
        (tmp_path / "_shapes.json").write_text(json.dumps(
            {"format": 1, "shapes": {n: {} for n in nodeids}, "schema": {}}))
    return tmp_path


def kinds(findings):
    return sorted(f[0] for f in findings)


def test_clean_dir_has_no_findings(tmp_path):
    ids = ["a_test.py::T::test_one", "a_test.py::T::test_two"]
    findings, warnings = cf.check(ids, str(build(tmp_path, ids)))
    assert findings == [] and warnings == []


def test_missing_fixture_reported_with_fix(tmp_path):
    ids = ["a_test.py::test_one", "a_test.py::test_new"]
    d = build(tmp_path, ids[:1])
    findings, _ = cf.check(ids, str(d))
    missing = [f for f in findings if f[0] == "missing"]
    assert [m[1] for m in missing] == ["a_test.py::test_new"]
    assert missing[0][2] == f"{cf.RERECORD} --only 'a_test.py::test_new'"


def test_orphan_reported_with_rename_hint(tmp_path):
    d = build(tmp_path, ["a_test.py::test_old_name"])
    findings, _ = cf.check(["a_test.py::test_old_nam"], str(d))
    orphan = [f for f in findings if f[0] == "orphan"]
    assert len(orphan) == 1 and "renamed to" in orphan[0][1]
    assert orphan[0][2].startswith("git rm ") and orphan[0][1].split(" ")[0] in orphan[0][2]


def test_sanitized_name_collision(tmp_path):
    ids = ["a_test.py::test[x y]", "a_test.py::test[x_y]"]
    findings, _ = cf.check(ids, str(build(tmp_path, [])))
    assert "collision" in kinds(findings)


def test_long_nodeid_hash_suffix(tmp_path):
    nid = "a_test.py::test[" + "x" * 300 + "]"
    name = exp.sanitize_nodeid(nid)
    assert len(name) < 200 and name != nid
    d = build(tmp_path, [nid])
    findings, _ = cf.check([nid], str(d))
    assert findings == []


def test_hand_edited_fixture_detected(tmp_path):
    nid = "a_test.py::test_one"
    d = build(tmp_path, [nid])
    path = d / (exp.sanitize_nodeid(nid) + ".json")
    path.write_text(path.read_text().replace('"_id": 1', '"_id": 2'))
    findings, _ = cf.check([nid], str(d))
    assert "sha" in kinds(findings)
    # byte-unstable but semantically equal: manifest updated, bytes not canonical
    text = json.dumps(json.loads(canonical(nid)))  # compact, not canonical
    path.write_text(text)
    manifest = json.loads((d / "_manifest.json").read_text())
    manifest["fixtures"][path.name]["sha256"] = sha(text)
    (d / "_manifest.json").write_text(json.dumps(manifest))
    findings, _ = cf.check([nid], str(d))
    assert "canonical" in kinds(findings) and "sha" not in kinds(findings)


def test_payload_nodeid_mismatch(tmp_path):
    nid = "a_test.py::test_one"
    d = build(tmp_path, [nid])
    text = canonical("a_test.py::other")
    path = d / (exp.sanitize_nodeid(nid) + ".json")
    path.write_text(text)
    manifest = json.loads((d / "_manifest.json").read_text())
    manifest["fixtures"][path.name]["sha256"] = sha(text)
    (d / "_manifest.json").write_text(json.dumps(manifest))
    findings, _ = cf.check([nid], str(d))
    assert "nodeid" in kinds(findings)


def test_size_cap_fails_and_warns(tmp_path):
    nid = "a_test.py::test_one"
    d = build(tmp_path, [nid])
    total = sum(p.stat().st_size for p in d.iterdir())
    findings, warnings = cf.check([nid], str(d), max_total=total - 1)
    assert "size" in kinds(findings)
    findings, warnings = cf.check([nid], str(d), max_total=total)
    assert "size" not in kinds(findings) and warnings
    findings, warnings = cf.check([nid], str(d), max_total=total * 2)
    assert findings == [] and warnings == []
    findings, _ = cf.check([nid], str(d), max_base=1)
    assert "size" in kinds(findings)


def test_selection_includes_linker_marked():
    assert "needs_linker" not in cf.SELECTION
    assert cf.SELECTION == "needs_mongo and not needs_corpus and not deep and not failing"


def test_corpus_tests_need_no_fixture(tmp_path):
    # the collection (SELECTION) excludes needs_corpus tests, so they are never wanted
    assert "not needs_corpus" in cf.SELECTION
    ids = ["a_test.py::test_one"]
    findings, _ = cf.check(ids, str(build(tmp_path, ids)))
    assert findings == []


def test_unicode_and_bracket_ids(tmp_path):
    ids = ["a_test.py::test[שלום-Genesis 1:1]", "a_test.py::test[a/b]"]
    findings, _ = cf.check(ids, str(build(tmp_path, ids)))
    assert findings == []


def test_missing_manifest_is_a_finding(tmp_path, capsys):
    ids = ["a_test.py::test_one"]
    d = build(tmp_path, ids, manifest=False)
    findings, _ = cf.check(ids, str(d))
    assert [f for f in findings if f[0] == "manifest"][0][2] == MANIFEST_FIX
    rc = cf.main(["--fixture-dir", str(d)], collected=set(ids))
    out = capsys.readouterr().out
    assert rc == 1 and MANIFEST_FIX in out and "Traceback" not in out


def test_missing_shapes_is_a_finding(tmp_path):
    ids = ["a_test.py::test_one"]
    findings, _ = cf.check(ids, str(build(tmp_path, ids, shapes=False)))
    shapes = [f for f in findings if f[0] == "shapes"]
    assert shapes and "SEFARIA_FIXTURE_SHAPES=write" in shapes[0][1]


def test_missing_shape_entry_for_fixture(tmp_path):
    ids = ["a_test.py::test_one", "a_test.py::test_two"]
    d = build(tmp_path, ids)
    (d / "_shapes.json").write_text(json.dumps({"format": 1, "shapes": {ids[0]: {}}, "schema": {}}))
    findings, _ = cf.check(ids, str(d))
    assert [f[1] for f in findings if f[0] == "shapes"] == [ids[1]]


def test_base_keys_subset_of_base_collections(tmp_path):
    ids = ["a_test.py::test_one"]
    d = build(tmp_path, ids)
    base = json.dumps({"nodeid": "_base", "collections": {"index": [], "texts": []}}) + "\n"
    (d / "_base.json").write_text(base)
    manifest = json.loads((d / "_manifest.json").read_text())
    manifest["base"]["sha256"] = sha(base)
    (d / "_manifest.json").write_text(json.dumps(manifest))
    findings, _ = cf.check(ids, str(d))
    assert [f[0] for f in findings] == ["base"] and "texts" in findings[0][1]


def test_main_prints_fix_lines_once_and_exits_zero_when_clean(tmp_path, capsys):
    ids = ["a_test.py::test_one"]
    d = build(tmp_path, ids)
    assert cf.main(["--fixture-dir", str(d)], collected=set(ids)) == 0
    sub = tmp_path / "empty"
    sub.mkdir()
    d2 = build(sub, [])
    rc = cf.main(["--fixture-dir", str(d2)], collected={"a::1", "a::2"})
    out = capsys.readouterr().out
    assert rc == 1 and out.count(f"Fix: {cf.RERECORD} --only 'a::1'") == 1


def test_sanitize_matches_exporter():
    assert cf.sanitize_nodeid is exp.sanitize_nodeid
