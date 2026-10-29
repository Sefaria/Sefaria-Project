#!/usr/bin/env python3
"""
Structural check of the committed Mongo fixtures against the collected tests.

Collects the needs_mongo tests that run under mongomock (SELECTION) and verifies
that sefaria/tests/fixtures/mongo holds exactly one canonical, manifest-listed
fixture per test, plus a size budget. Needs no Mongo, so it runs in the no-Mongo
CI job. Exit 0: ok, 1: findings, 2: internal error (collection failed).
"""
import argparse
import difflib
import hashlib
import json
import os
import sys

from bson import json_util

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, os.path.join(ROOT, "scripts", "test_impact"))
from export_mongo_fixtures import BASE_COLLECTIONS, sanitize_nodeid  # noqa: E402,F401

# Linker-marked tests keep their fixture; corpus, deep and failing tests need none.
SELECTION = "needs_mongo and not needs_corpus and not deep and not failing"
PATHS = ["./sefaria", "./sso", "./reader", "./powered_by"]
RERECORD = "python scripts/pytest_minimal_dataset/rerecord_fixtures.py"
MANIFEST_FIX = "python scripts/pytest_minimal_dataset/export_mongo_fixtures.py --manifest-only"
SHAPES_MSG = ("_shapes.json is missing; it is written by a re-record run with SEFARIA_FIXTURE_SHAPES=write "
              "(rerecord_fixtures.py does this)")
RESERVED = {"_base.json", "_manifest.json", "_shapes.json"}
MIB = 1024 * 1024
COLLECT_ENV = {"SEFARIA_MOCK_MONGO": "1", "SEFARIA_TEST_MONGO": "1", "LOCAL_TEST_MONGO_PORT": "27099"}


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _load_json(path):
    """A fixture metadata file as a dict. Raises ValueError when it is not valid JSON or not an object."""
    with open(path, "rb") as fh:
        payload = json.loads(fh.read())
    if not isinstance(payload, dict):
        raise ValueError(f"{os.path.basename(path)} must hold a JSON object")
    return payload


def check(collected, fixture_dir, max_total=20 * MIB, max_base=17 * MIB):
    """Return (findings, warnings). Each finding is (kind, subject, fix_command_or_None)."""
    findings, warnings = [], []
    wanted = {}
    for nid in sorted(collected):
        name = sanitize_nodeid(nid) + ".json"
        if name in wanted:
            findings.append(("collision", f"{nid} and {wanted[name]} -> {name}", None))
        wanted[name] = nid
    # Any underscore-prefixed json (_base, _manifest, _shapes) is metadata, not a per-test fixture.
    present = {n for n in os.listdir(fixture_dir) if n.endswith(".json") and not n.startswith("_")} - RESERVED
    for name, nid in sorted(wanted.items()):
        if name not in present:
            findings.append(("missing", nid, f"{RERECORD} --only '{nid}'"))
    missing_stems = [w[:-5] for w in wanted if w not in present]
    for name in sorted(present - set(wanted)):
        hint = difflib.get_close_matches(name[:-5], missing_stems, n=1)
        findings.append(("orphan", name + (f" (renamed to {hint[0]}?)" if hint else ""),
                         f"git rm sefaria/tests/fixtures/mongo/{name}"))

    manifest_path = os.path.join(fixture_dir, "_manifest.json")
    manifest = None
    if os.path.isfile(manifest_path):
        manifest = _load_json(manifest_path)
    else:
        findings.append(("manifest", "_manifest.json is missing", MANIFEST_FIX))

    for name in sorted(present & set(wanted)):
        with open(os.path.join(fixture_dir, name), "rb") as fh:
            raw = fh.read()
        try:
            payload = json.loads(raw)
        except ValueError as exc:
            findings.append(("canonical", f"{name} is not valid JSON ({exc})", f"{RERECORD} --only '{wanted[name]}'"))
            continue
        fix = f"{RERECORD} --only '{wanted[name]}'"
        if payload.get("nodeid") != wanted[name]:
            findings.append(("nodeid", f"{name} holds nodeid {payload.get('nodeid')!r}, expected {wanted[name]!r}", fix))
        canon = (json_util.dumps(payload, sort_keys=True, indent=2) + "\n").encode("utf-8")
        if canon != raw:
            findings.append(("canonical", f"{name} is not byte-identical to its canonical encoding", fix))
        if manifest is not None:
            entry = manifest.get("fixtures", {}).get(name)
            if entry is None:
                findings.append(("manifest", f"{name} has no _manifest.json entry", MANIFEST_FIX))
            elif entry.get("sha256") != _sha(raw):
                findings.append(("sha", f"{name} does not match its _manifest.json sha256 (hand-edited?)", fix))
    if manifest is not None:
        for name in sorted(set(manifest.get("fixtures", {})) - present):
            findings.append(("manifest", f"_manifest.json lists {name}, which is not on disk", MANIFEST_FIX))

    base_path = os.path.join(fixture_dir, "_base.json")
    if not os.path.isfile(base_path):
        findings.append(("base", "_base.json is missing", RERECORD))
    else:
        with open(base_path, "rb") as fh:
            base_raw = fh.read()
        extras = sorted(set(_load_json(base_path).get("collections", {})) - set(BASE_COLLECTIONS))
        if extras:
            findings.append(("base", f"_base.json has collections outside BASE_COLLECTIONS: {', '.join(extras)}", RERECORD))
        if manifest is not None and manifest.get("base", {}).get("sha256") != _sha(base_raw):
            findings.append(("sha", "_base.json does not match its _manifest.json sha256", MANIFEST_FIX))
        if len(base_raw) > max_base:
            findings.append(("size", f"_base.json is {len(base_raw)} bytes (> {max_base})", None))

    shapes_path = os.path.join(fixture_dir, "_shapes.json")
    if not os.path.isfile(shapes_path):
        findings.append(("shapes", SHAPES_MSG, RERECORD))
    else:
        shapes = _load_json(shapes_path).get("shapes", {})
        for name in sorted(present & set(wanted)):
            if wanted[name] not in shapes:
                findings.append(("shapes", wanted[name], RERECORD))
        for nid in sorted(set(shapes) - set(wanted.values())):
            findings.append(("shapes", f"_shapes.json has an entry for {nid}, which is not a collected needs_mongo test (orphan)",
                             f"{RERECORD} --prune"))

    total = sum(os.path.getsize(os.path.join(fixture_dir, n)) for n in os.listdir(fixture_dir)
                if os.path.isfile(os.path.join(fixture_dir, n)))
    if total > max_total:
        findings.append(("size", f"fixtures total {total} bytes (> {max_total})", None))
    elif total >= 0.95 * max_total:
        warnings.append(f"fixtures total {total} bytes is {100 * total / max_total:.1f}% of the {max_total} budget")
    return findings, warnings


def main(argv=None, collected=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture-dir", default=os.environ.get(
        "SEFARIA_MONGO_FIXTURE_DIR", os.path.join(ROOT, "sefaria", "tests", "fixtures", "mongo")))
    args = parser.parse_args(argv)
    if collected is None:
        import ci_parity
        try:
            collected = ci_parity.collect(["-m", SELECTION] + PATHS, COLLECT_ENV, ROOT)
        except ci_parity.CollectionError as exc:
            print(f"cannot collect tests: {exc}", file=sys.stderr)
            return 2
    try:
        findings, warnings = check(collected, args.fixture_dir)
    except (ValueError, OSError) as exc:  # a corrupt or unreadable metadata file is an internal error, not a finding
        print(f"cannot read the fixtures: {exc}", file=sys.stderr)
        return 2
    for warning in warnings:
        print(f"WARNING: {warning}")
    for kind, subject, _ in findings:
        print(f"[{kind}] {subject}")
    fixes = list(dict.fromkeys(fix for _, _, fix in findings if fix))
    for fix in fixes:
        print(f"Fix: {fix}")
    if findings:
        print(f"{len(findings)} finding(s) across {len(collected)} collected tests")
        return 1
    print(f"ok: {len(collected)} collected tests match the fixtures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
