#!/usr/bin/env python3
"""
Deterministic minimal-dataset generator (owns: scripts/pytest_minimal_dataset/).

Reads the Mongo-usage recorder artifacts written by sefaria/conftest.py +
sefaria/system/database.py's QueryCounter (one JSONL file per test nodeid
under <worktree>/.artifacts/mongo-usage/, plus a roll-up _index.json), and
materializes a minimal database on the same local mongod that contains only
the documents the recorded test run actually touched.

No LLM involved at runtime -- this is a pure data-replay tool.

STRATEGY (must be read before touching the copy logic below):

Two strategies were possible:
  (a) copy exactly the recorded reply doc_ids
  (b) replay the recorded filters against the full source DB and copy
      every match

This script's primary strategy is (b): every recorded find/count/distinct/
update/delete/findAndModify filter, and every $match-bearing aggregate
pipeline, is re-run against the full source DB and every matching document is
copied. Rationale: doc_ids are frozen at the moment the recording pytest run
happened; a later run of the same test may see a different ObjectId order or
a range/regex filter may match a different (but equally valid) document if
the source dataset changes between the recording pass and the run against
the minimal dataset. Replaying the filter is what keeps the minimal dataset
representative of "what this test's query touches", not just "what it
happened to return once".

Strategy (a) -- the raw doc_ids recorded in each JSONL line -- is used only
as a supplementary safety net, for the cases where filter replay cannot be
trusted to reproduce the same result set:
  - aggregate pipelines with no $match stage (the filter we can extract is
    empty/None, so there is nothing safe to replay)
  - any record where filter extraction failed or filter is null but doc_ids
    were returned (e.g. getMore continuing a cursor whose originating find
    was on the same collection)
  - insert command replies, where there is no query at all -- these are
    genuinely new documents the test itself creates, not something to copy
    from source, so they are used only for capturing the ids the app
    assigned client-side, and are not depended upon for source-copy at all

Every collection that appears in _index.json (i.e. was touched by at least
one command in the recording) also has its indexes copied from source,
including for collections whose only recorded traffic was writes (insert/
update/delete): a unique index enforced in production must be enforced in
the minimal dataset too, or a test that depends on a DuplicateKeyError will
silently pass for the wrong reason.

Usage:
    ./venv/bin/python scripts/pytest_minimal_dataset/generate_minimal_dataset.py \\
        --source-db sefaria --target-db sefaria_min --host 127.0.0.1 --port 27018

If the artifact directory is empty or missing, this script re-runs the
recording pass itself (pytest against --source-db) before generating,
per the work item's instructions, rather than failing outright.
"""
import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict

import pymongo
from bson import ObjectId
from pymongo.errors import BulkWriteError, OperationFailure

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_ARTIFACT_DIR = os.path.join(REPO_ROOT, ".artifacts", "mongo-usage")

# Mutated by main() to point at whatever --artifact-dir was passed (default:
# the live recorder output directory). Kept as a module global -- deliberately,
# since this is a single-shot CLI script, not a library -- so load_records()/
# load_index()/artifacts_present() don't need it threaded through every call.
ARTIFACT_DIR = DEFAULT_ARTIFACT_DIR


def index_path():
    return os.path.join(ARTIFACT_DIR, "_index.json")


def artifacts_present():
    return os.path.isdir(ARTIFACT_DIR) and os.path.isfile(index_path()) and any(
        f.endswith(".jsonl") for f in os.listdir(ARTIFACT_DIR)
    )


def rerun_recording(test_target="sefaria/tests"):
    print(f"[generate_minimal_dataset] no recorder artifacts found under {ARTIFACT_DIR}; "
          f"re-running the recording pass: pytest {test_target}", file=sys.stderr)
    env = dict(os.environ)
    env.setdefault("LOCAL_TEST_DB_NAME", "sefaria")
    result = subprocess.run(
        [os.path.join(REPO_ROOT, "venv", "bin", "pytest"), test_target, "-q", "--no-header",
         "-p", "no:cacheprovider"],
        cwd=REPO_ROOT, env=env,
    )
    # Recording is a side effect of running the suite; a nonzero exit code
    # from the suite itself does not mean the recording failed, so we do not
    # treat it as fatal here -- but we do require the artifacts to now exist.
    if not artifacts_present():
        raise SystemExit(
            f"[generate_minimal_dataset] recording pass finished (pytest exit={result.returncode}) "
            f"but still produced no artifacts under {ARTIFACT_DIR}; cannot proceed."
        )


def load_records():
    """Yield every recorded Mongo-command dict across all per-test JSONL files."""
    for fname in sorted(os.listdir(ARTIFACT_DIR)):
        if not fname.endswith(".jsonl"):
            continue
        path = os.path.join(ARTIFACT_DIR, fname)
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    print(f"[generate_minimal_dataset] WARNING: skipping malformed line in {fname}",
                          file=sys.stderr)


def load_index():
    with open(index_path()) as f:
        return json.load(f)


def to_object_id(v):
    """Best-effort conversion of a stringified _id back to the type it was stored as.
    Recorded doc_ids are always strings (see QueryCounter._stringify/str(_id) in the
    recorder); most Sefaria _ids are ObjectId, but not all collections use them."""
    if isinstance(v, str) and len(v) == 24:
        try:
            return ObjectId(v)
        except Exception:
            return v
    return v


def extract_match_filter(pipeline):
    """Merge every leading/any $match stage in an aggregate pipeline into one filter.
    Returns None if the pipeline has no $match stage to replay safely."""
    if not isinstance(pipeline, list):
        return None
    matches = [stage["$match"] for stage in pipeline if isinstance(stage, dict) and "$match" in stage]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    return {"$and": matches}


def normalize_filters(record):
    """Return a list of *non-empty* filter dicts to replay for this one record.

    A bare `find({})` / `count({})` etc. is deliberately EXCLUDED here even
    though `{}` is technically a valid filter: replaying `{}` against the
    full source DB copies the entire collection, which for Sefaria's largest
    collections (links, marked_up_text_chunks, webpages, ref_data,
    dibur_hamatchils -- each 1-5M documents) would make the "minimal" dataset
    larger than the source, violating the whole point of this generator. For
    an empty/absent filter we fall back to strategy (a) -- the doc_ids
    actually returned -- which is both safe (bounded by what the test really
    read) and complete for a fully-iterated cursor, since the recorder also
    captures getMore/nextBatch replies.
    """
    cmd = record.get("command")
    filt = record.get("filter")
    if cmd in ("find", "count", "distinct", "findAndModify"):
        if isinstance(filt, dict) and filt:
            return [filt]
        return []
    if cmd == "aggregate":
        mf = extract_match_filter(filt)
        if isinstance(mf, dict) and mf:
            return [mf]
        return []
    if cmd in ("update", "delete"):
        if isinstance(filt, list):
            return [f for f in filt if isinstance(f, dict) and f]
        return []
    # insert and anything else: no query to replay
    return []


def needs_doc_id_fallback(record):
    """True for records where filter replay is not possible/safe (including a
    bare `{}` filter -- see normalize_filters) and we fall back to strategy
    (a): the raw doc_ids captured in the reply."""
    cmd = record.get("command")
    if cmd == "insert":
        return False  # these are documents the test itself creates; nothing to copy from source
    filters = normalize_filters(record)
    return len(filters) == 0


def copy_indexes(source_db, target_db, collection):
    """Copy every non-default index from source to target. Returns
    (copied_count, failed_names) -- text indexes in particular cannot be
    replayed via IndexModel from a listIndexes doc (the reply key spec uses
    synthetic _fts/_ftsx keys, not the original 'text' spec), so a collection
    with a $text index will report a failure here; a test that depends on
    $text search against that collection will fail against the minimal
    dataset until this is handled specially."""
    try:
        source_indexes = list(source_db[collection].list_indexes())
    except OperationFailure:
        return 0, []
    copied = 0
    failed = []
    for idx in source_indexes:
        idx = dict(idx)
        if idx.get("name") == "_id_":
            continue  # automatic on every collection
        # Mongo can report an index key value as a float (e.g. 1.0). pymongo's
        # client-side validator rejects anything that is not int/str, raising
        # TypeError before the server is ever contacted -- which aborted the whole
        # generator run mid-way. Coerce integral floats back to int here.
        key = [(k, int(v) if isinstance(v, float) and v.is_integer() else v)
               for k, v in idx.pop("key").items()]
        idx.pop("v", None)
        idx.pop("ns", None)
        name = idx.pop("name")
        try:
            target_db[collection].create_indexes(
                [pymongo.IndexModel(key, name=name, **idx)]
            )
            copied += 1
        except (OperationFailure, TypeError, ValueError) as e:
            # TypeError/ValueError come from pymongo's own client-side index-spec
            # validation (text indexes report synthetic _fts/_ftsx keys that cannot
            # be replayed). An index we cannot recreate must never abort the run.
            failed.append(name)
            print(f"[generate_minimal_dataset] WARNING: could not recreate index "
                  f"{collection}.{name}: {e}", file=sys.stderr)
    return copied, failed


def insert_batched(collection_handle, docs, batch_size=1000):
    """insert_many in batches, tolerating duplicate _ids across overlapping
    filters (BulkWriteError code 11000) without aborting the whole batch."""
    written = 0
    docs = list(docs)
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        try:
            collection_handle.insert_many(batch, ordered=False)
            written += len(batch)
        except BulkWriteError as e:
            write_errors = e.details.get("writeErrors", [])
            duplicates = sum(1 for we in write_errors if we.get("code") == 11000)
            other = [we for we in write_errors if we.get("code") != 11000]
            written += len(batch) - len(write_errors)
            if other:
                print(f"[generate_minimal_dataset] WARNING: {len(other)} non-duplicate "
                      f"write error(s) inserting into {collection_handle.name}: {other[:3]}",
                      file=sys.stderr)
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=27018)
    ap.add_argument("--source-db", default="sefaria")
    ap.add_argument("--target-db", default="sefaria_min")
    ap.add_argument("--test-target", default="sefaria/tests",
                     help="pytest target used to (re)generate recorder artifacts if absent")
    ap.add_argument("--artifact-dir", default=DEFAULT_ARTIFACT_DIR,
                     help="Directory of recorder JSONL files + _index.json to generate from. "
                          "Point this at a frozen copy (e.g. .artifacts/mongo-usage.recording) "
                          "to avoid the verification pytest run (which is itself instrumented "
                          "by the same conftest.py) overwriting the very artifacts you generated from.")
    args = ap.parse_args()

    global ARTIFACT_DIR
    ARTIFACT_DIR = args.artifact_dir

    if args.host != "127.0.0.1":
        raise SystemExit(
            "REFUSING: this generator only ever talks to 127.0.0.1 (local disposable mongod). "
            "Never point it at a shared cluster."
        )

    if not artifacts_present():
        rerun_recording(args.test_target)

    index = load_index()
    touched_collections = set()
    for meta in index.values():
        touched_collections.update(meta.get("collections", []))

    client = pymongo.MongoClient(args.host, args.port, serverSelectionTimeoutMS=5000)
    source_db = client[args.source_db]
    target_db = client[args.target_db]

    print(f"[generate_minimal_dataset] source artifact dir: {ARTIFACT_DIR}", file=sys.stderr)
    print(f"[generate_minimal_dataset] dropping stale target database '{args.target_db}'", file=sys.stderr)
    client.drop_database(args.target_db)

    # collection -> set of stringified _ids already queued for copy (dedupe across records)
    ids_to_copy = defaultdict(set)
    # collection -> list of raw filter dicts to replay
    filters_to_replay = defaultdict(list)

    stats = {"records": 0, "filter_replays": 0, "doc_id_fallback_requested": 0, "inserts_seen": 0}

    for record in load_records():
        stats["records"] += 1
        collection = record.get("collection")
        if not collection:
            continue
        touched_collections.add(collection)
        cmd = record.get("command")

        filters = normalize_filters(record)
        if filters:
            filters_to_replay[collection].extend(filters)
            stats["filter_replays"] += len(filters)

        if needs_doc_id_fallback(record):
            for doc_id in record.get("doc_ids") or []:
                ids_to_copy[collection].add(doc_id)
            stats["doc_id_fallback_requested"] += len(record.get("doc_ids") or [])

        if cmd == "insert":
            stats["inserts_seen"] += 1
            # Nothing to copy from source: these are test-created documents.
            # We still need the collection (and its indexes) to exist, which
            # happens below via touched_collections + copy_indexes.

    # Resolve filter replays into concrete docs by querying the source DB.
    docs_by_collection = defaultdict(dict)  # collection -> {_id_str: doc}
    zero_match_filters = []  # (collection, filter) pairs that matched nothing -- likely non-determinism risk
    for collection, filters in filters_to_replay.items():
        for filt in filters:
            try:
                cursor = source_db[collection].find(filt, projection=None)
            except OperationFailure as e:
                print(f"[generate_minimal_dataset] WARNING: could not replay filter on "
                      f"{collection}: {filt!r}: {e}", file=sys.stderr)
                continue
            matched = 0
            for doc in cursor:
                docs_by_collection[collection][str(doc["_id"])] = doc
                matched += 1
            if matched == 0:
                zero_match_filters.append((collection, filt))

    # Resolve doc_id fallbacks directly, tracking requested vs. actually-found
    # per collection -- this is the direct under-collection measurement: a
    # requested id that source no longer has (e.g. it was deleted by an
    # earlier mutating test in the same recorded run) will under-collect.
    doc_id_resolution = {}  # collection -> (requested, found)
    for collection, id_strs in ids_to_copy.items():
        missing = [i for i in id_strs if i not in docs_by_collection[collection]]
        found_here = 0
        if missing:
            oids = [to_object_id(i) for i in missing]
            try:
                for doc in source_db[collection].find({"_id": {"$in": oids}}):
                    docs_by_collection[collection][str(doc["_id"])] = doc
                    found_here += 1
            except OperationFailure as e:
                print(f"[generate_minimal_dataset] WARNING: could not resolve doc_id fallback on "
                      f"{collection}: {e}", file=sys.stderr)
        doc_id_resolution[collection] = (len(id_strs), len(id_strs) - len(missing) + found_here)

    # Write documents + indexes into the target DB.
    total_docs_written = 0
    index_failures = {}
    for collection in sorted(touched_collections):
        if collection not in target_db.list_collection_names():
            target_db.create_collection(collection)
        docs = docs_by_collection.get(collection, {})
        if docs:
            total_docs_written += insert_batched(target_db[collection], docs.values())
        copied, failed = copy_indexes(source_db, target_db, collection)
        if failed:
            index_failures[collection] = failed

    print(f"[generate_minimal_dataset] records processed: {stats['records']}")
    print(f"[generate_minimal_dataset] filter-replay (strategy b) filters issued: {stats['filter_replays']}")
    print(f"[generate_minimal_dataset] doc_id-fallback (strategy a) ids requested: {stats['doc_id_fallback_requested']}")
    print(f"[generate_minimal_dataset] insert commands seen (not copied from source): {stats['inserts_seen']}")
    print(f"[generate_minimal_dataset] collections materialized: {len(touched_collections)}")
    print(f"[generate_minimal_dataset] total documents written to '{args.target_db}': {total_docs_written}")
    if zero_match_filters:
        print(f"[generate_minimal_dataset] WARNING: {len(zero_match_filters)} replayed filter(s) matched "
              f"zero documents in source (possible non-determinism / already-mutated data):", file=sys.stderr)
        for collection, filt in zero_match_filters[:10]:
            print(f"    {collection}: {filt!r}", file=sys.stderr)
    print("[generate_minimal_dataset] doc_id fallback resolution per collection (requested -> found):")
    for collection, (requested, found) in sorted(doc_id_resolution.items()):
        marker = "" if found >= requested else "  <-- UNDER-COLLECTED"
        print(f"    {collection}: {requested} -> {found}{marker}")
    if index_failures:
        print(f"[generate_minimal_dataset] WARNING: index recreation failed for "
              f"{sum(len(v) for v in index_failures.values())} index(es) "
              f"(text indexes cannot be replayed from listIndexes output):", file=sys.stderr)
        for collection, names in index_failures.items():
            print(f"    {collection}: {names}", file=sys.stderr)


if __name__ == "__main__":
    main()
