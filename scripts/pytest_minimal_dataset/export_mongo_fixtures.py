#!/usr/bin/env python3
"""
Export deterministic per-test Mongo fixtures from recorded QueryCounter artifacts.

The output is one Extended JSON fixture per pytest nodeid. Each fixture contains
only documents selected by replaying that test's recorded Mongo filters against a
local source database, with recorded returned _ids as the bounded fallback.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict

import pymongo
from bson import json_util
from pymongo.errors import OperationFailure

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_ARTIFACT_DIR = os.path.join(REPO_ROOT, ".artifacts", "mongo-usage")
DEFAULT_FIXTURE_DIR = os.path.join(REPO_ROOT, "sefaria", "tests", "fixtures", "mongo")

sys.path.insert(0, SCRIPT_DIR)
from generate_minimal_dataset import needs_doc_id_fallback, normalize_filters, to_object_id  # noqa: E402


def sanitize_nodeid(nodeid):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", nodeid)


def load_records(path):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def find_shared_titles(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "sharedTitle" and isinstance(item, str):
                yield item
            else:
                yield from find_shared_titles(item)
    elif isinstance(value, list):
        for item in value:
            yield from find_shared_titles(item)


def artifact_paths(artifact_dir, test_file):
    prefix = test_file.rstrip(":")
    for fname in sorted(os.listdir(artifact_dir)):
        if not fname.endswith(".jsonl"):
            continue
        path = os.path.join(artifact_dir, fname)
        first = next(load_records(path), None)
        if first and first.get("nodeid", "").startswith(prefix):
            yield path


def collect_docs(source_db, records):
    ids_to_copy = defaultdict(set)
    filters_to_replay = defaultdict(list)
    touched_titles = set()

    for record in records:
        collection = record.get("collection")
        if not collection:
            continue
        filt = record.get("filter")
        if isinstance(filt, dict) and isinstance(filt.get("title"), str):
            touched_titles.add(filt["title"])
        filters_to_replay[collection].extend(normalize_filters(record))
        if needs_doc_id_fallback(record):
            ids_to_copy[collection].update(record.get("doc_ids") or [])

    docs_by_collection = defaultdict(dict)
    for collection, filters in filters_to_replay.items():
        for filt in filters:
            try:
                cursor = source_db[collection].find(filt, projection=None)
            except OperationFailure as e:
                raise SystemExit(f"could not replay filter on {collection}: {filt!r}: {e}") from e
            for doc in cursor:
                docs_by_collection[collection][str(doc["_id"])] = doc

    for collection, id_strs in ids_to_copy.items():
        missing = [i for i in id_strs if i not in docs_by_collection[collection]]
        if not missing:
            continue
        try:
            cursor = source_db[collection].find({"_id": {"$in": [to_object_id(i) for i in missing]}})
        except OperationFailure as e:
            raise SystemExit(f"could not resolve doc_id fallback on {collection}: {e}") from e
        for doc in cursor:
            docs_by_collection[collection][str(doc["_id"])] = doc

    # Ref parsing relies on Library's title maps, which are built when
    # sefaria.model imports. The recorder starts per test, so include matching
    # Index metadata explicitly for title-bearing recorded filters.
    if touched_titles:
        for doc in source_db["index"].find({"title": {"$in": sorted(touched_titles)}}):
            docs_by_collection["index"][str(doc["_id"])] = doc

    shared_titles = set()
    for doc in docs_by_collection.get("index", {}).values():
        shared_titles.update(find_shared_titles(doc.get("schema")))
        shared_titles.update(find_shared_titles(doc.get("alt_structs")))
    if shared_titles:
        for doc in source_db["term"].find({"name": {"$in": sorted(shared_titles)}}):
            docs_by_collection["term"][str(doc["_id"])] = doc

    category_paths = set()
    for doc in docs_by_collection.get("index", {}).values():
        categories = doc.get("categories") or []
        for i in range(1, len(categories) + 1):
            category_paths.add(tuple(categories[:i]))
    for path in sorted(category_paths):
        doc = source_db["category"].find_one({"path": list(path)})
        if doc:
            docs_by_collection["category"][str(doc["_id"])] = doc
        shared_titles.update(path)

    already_loaded_terms = {
        doc.get("name") for doc in docs_by_collection.get("term", {}).values()
    }
    missing_terms = sorted(shared_titles - already_loaded_terms)
    if missing_terms:
        for doc in source_db["term"].find({"name": {"$in": missing_terms}}):
            docs_by_collection["term"][str(doc["_id"])] = doc

    return {
        collection: [docs[key] for key in sorted(docs.keys())]
        for collection, docs in sorted(docs_by_collection.items())
    }


def write_fixture(output_dir, nodeid, collections):
    os.makedirs(output_dir, exist_ok=True)
    payload = {
        "nodeid": nodeid,
        "collections": collections,
    }
    path = os.path.join(output_dir, sanitize_nodeid(nodeid) + ".json")
    with open(path, "w") as f:
        f.write(json_util.dumps(payload, indent=2, sort_keys=True))
        f.write("\n")
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("test_file", help="pytest file path to export, e.g. sefaria/tests/recommendation_test.py")
    ap.add_argument("--artifact-dir", default=DEFAULT_ARTIFACT_DIR)
    ap.add_argument("--output-dir", default=DEFAULT_FIXTURE_DIR)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=27018)
    ap.add_argument("--source-db", default="sefaria")
    args = ap.parse_args()

    if args.host != "127.0.0.1":
        raise SystemExit("refusing to export fixtures from a non-loopback Mongo host")

    paths = list(artifact_paths(args.artifact_dir, args.test_file))
    if not paths:
        raise SystemExit(f"no recorder artifacts found for {args.test_file!r} under {args.artifact_dir}")

    client = pymongo.MongoClient(args.host, args.port, serverSelectionTimeoutMS=5000)
    source_db = client[args.source_db]

    written = []
    for path in paths:
        records = list(load_records(path))
        if not records:
            continue
        nodeid = records[0]["nodeid"]
        collections = collect_docs(source_db, records)
        written.append(write_fixture(args.output_dir, nodeid, collections))

    for path in written:
        print(path)


if __name__ == "__main__":
    main()
