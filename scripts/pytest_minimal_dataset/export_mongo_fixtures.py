#!/usr/bin/env python3
"""
Export deterministic per-test Mongo fixtures from recorded QueryCounter artifacts.

The output is one Extended JSON fixture per pytest nodeid. Each fixture contains
only documents selected by replaying that test's recorded Mongo filters against a
local source database, with recorded returned _ids as the bounded fallback.
"""
import argparse
import hashlib
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
MAX_FIXTURE_BYTES = 2 * 1024 * 1024

# Tests whose assertions do not depend on how many `links` documents come back.
# Each entry cites the assertion lines that justify sampling. Verified by reading
# the test body -- an entry without that justification is a bug.
LINK_SAMPLE_SAFE = {
    # modtools_test.py:968-974 asserts only status_code == 200 and the presence of
    # the 'has_dependencies' and 'dependent_indices' keys. It never reads the count.
    "sefaria/tests/modtools_test.py::TestCheckIndexDependenciesAPI::test_check_dependencies_returns_info",
}
MAX_BASE_BYTES = 8 * 1024 * 1024
NOT_MOCKABLE_MANIFEST = os.path.join(DEFAULT_FIXTURE_DIR, "_not-mockable.json")
_oversized_fixtures = []
LINK_RESPONSE_FIELDS = {
    "anchorRef", "category", "ref", "type", "refs",
    "is_first_comment", "first_comment_indexes", "first_comment_section_ref",
    "expandedRefs0", "expandedRefs1", "generated_by",
    "inline_citation"
}
TEXTS_RESPONSE_FIELDS = {
    "title", "language", "versionTitle", "versionSource", "isPrimary", "isSource"
}
GROUPS_RESPONSE_FIELDS = {
    "slug", "name", "listed", "toc"
}
TOPICS_RESPONSE_FIELDS = {
    "slug", "titles", "isTopLevelDisplay", "displayOrder"
}
TOPIC_LINKS_RESPONSE_FIELDS = {
    "toTopic", "fromTopic", "linkType", "class", "dataSource", "order"
}
VSTATE_RESPONSE_FIELDS = {
    "title", "content"
}

# Determined by reading the test body and its recorded call path. The default
# is no chapter content; if a test genuinely needs segment text, add its title
# here rather than weakening or skipping the test.
TEXT_CONTENT_TITLES = {
    "sefaria/tests/links_test.py::Test_links_from_get_text::test_links_from_padded_ref": {"Exodus"},
}

# Titles required in _base.json at module/class import/collection time before
# per-test fixtures are loaded (e.g. Test_AutoLinker eager class attributes).
BASE_EXTRA_TITLES = [
    "Kos Eliyahu on Pesach Haggadah",
]

sys.path.insert(0, SCRIPT_DIR)
from generate_minimal_dataset import (  # noqa: E402
    extract_match_filter,
    needs_doc_id_fallback,
    normalize_filters,
    to_object_id,
)


def doc_id_sort_key(doc):
    val = doc.get("_id")
    if isinstance(val, dict):
        return json.dumps(val, sort_keys=True, default=str)
    return str(val if val is not None else "")


def sanitize_nodeid(nodeid):
    if not isinstance(nodeid, str) or not nodeid:
        raise ValueError(f"cannot write Mongo fixture: invalid nodeid {nodeid!r}")
    sanitized = re.sub(r"[^A-Za-z0-9_.-]", "_", nodeid)
    if not sanitized:
        raise ValueError(f"cannot write Mongo fixture: nodeid {nodeid!r} has no filename")
    if len(sanitized) <= 180:
        return sanitized
    digest = hashlib.sha256(nodeid.encode("utf-8")).hexdigest()[:16]
    return f"{sanitized[:160]}_{digest}"


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


def referenced_fields(value):
    """Return fields anywhere in a filter or aggregate expression."""
    if isinstance(value, str) and value.startswith("$"):
        return {value[1:].split(".", 1)[0]}
    if isinstance(value, dict):
        fields = set()
        for key, item in value.items():
            if key.startswith("$"):
                fields.update(referenced_fields(item))
            else:
                fields.add(key)
        return fields
    if isinstance(value, list):
        fields = set()
        for item in value:
            fields.update(referenced_fields(item))
        return fields
    return set()


def recorded_fields(records, collection):
    fields = set()
    for record in records:
        if record.get("collection") != collection:
            continue
        value = record.get("filter")
        if record.get("command") == "aggregate":
            value = extract_match_filter(value)
        fields.update(referenced_fields(value))
    return fields


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
        if (
            isinstance(filt, dict)
            and isinstance(filt.get("title"), str)
            and record.get("n_returned", 0)
        ):
            touched_titles.add(filt["title"])
        filters_to_replay[collection].extend(normalize_filters(record))
        if needs_doc_id_fallback(record):
            ids_to_copy[collection].update(record.get("doc_ids") or [])

    docs_by_collection = defaultdict(dict)
    nodeid = records[0].get("nodeid", "") if records else ""
    for collection in sorted(filters_to_replay.keys()):
        for filt in filters_to_replay[collection]:
            try:
                cursor = source_db[collection].find(filt, projection=None)
            except OperationFailure as e:
                raise SystemExit(f"could not replay filter on {collection}: {filt!r}: {e}") from e
            # Sampling `links` changes what a test observes, so it is allowed ONLY
            # for tests whose assertions provably do not depend on the number of
            # links returned. Each entry below must cite the assertion lines that
            # justify it. Everything else keeps the full matched set; if that pushes
            # the fixture past MAX_FIXTURE_BYTES the fixture is omitted and the test
            # stays `needs_mongo` (see the omission warning below).
            #
            # Never add a test here to make it fit the ceiling. A test that needs the
            # full link set belongs in the Mongo job, not in a sampled fixture.
            cap = 50 if (collection == "links" and nodeid in LINK_SAMPLE_SAFE) else None
            if cap is not None:
                cursor = cursor.sort("_id", 1)
            for index, doc in enumerate(cursor):
                if cap is not None and index >= cap:
                    break
                docs_by_collection[collection][str(doc["_id"])] = doc

    if nodeid in LINK_SAMPLE_SAFE and "links" in docs_by_collection:
        # Guarantee strictly the FIRST 50 documents by sorted _id
        first_50_keys = sorted(docs_by_collection["links"].keys())[:50]
        docs_by_collection["links"] = {k: docs_by_collection["links"][k] for k in first_50_keys}

    for collection in sorted(ids_to_copy.keys()):
        id_strs = ids_to_copy[collection]
        missing = [i for i in sorted(id_strs) if i not in docs_by_collection[collection]]
        if not missing:
            continue
        try:
            cursor = source_db[collection].find(
                {"_id": {"$in": [to_object_id(i) for i in missing]}}
            ).sort("_id", 1)
        except OperationFailure as e:
            raise SystemExit(f"could not resolve doc_id fallback on {collection}: {e}") from e
        for doc in cursor:
            docs_by_collection[collection][str(doc["_id"])] = doc

    # Ref parsing relies on Library's title maps, which are built when
    # sefaria.model imports. The recorder starts per test, so include matching
    # Index metadata explicitly for title-bearing recorded filters.
    if touched_titles:
        for doc in source_db["index"].find({"title": {"$in": sorted(touched_titles)}}).sort("_id", 1):
            docs_by_collection["index"][str(doc["_id"])] = doc

    shared_titles = set()
    for doc in docs_by_collection.get("index", {}).values():
        shared_titles.update(find_shared_titles(doc.get("schema")))
        shared_titles.update(find_shared_titles(doc.get("alt_structs")))
    if shared_titles:
        for doc in source_db["term"].find({"name": {"$in": sorted(shared_titles)}}).sort("_id", 1):
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
        for doc in source_db["term"].find({"name": {"$in": missing_terms}}).sort("_id", 1):
            docs_by_collection["term"][str(doc["_id"])] = doc

    # Library construction eagerly reads every text document. Keep chapter
    # content only for the explicitly reviewed segment-content titles.
    requested_versions = defaultdict(lambda: {"languages": set(), "version_titles": set()})
    for record in records:
        filt = record.get("filter")
        if not isinstance(filt, dict) or not isinstance(filt.get("title"), str):
            continue
        if not record.get("n_returned", 0):
            continue
        request = requested_versions[filt["title"]]
        if isinstance(filt.get("language"), str):
            request["languages"].add(filt["language"])
        if isinstance(filt.get("versionTitle"), str):
            request["version_titles"].add(filt["versionTitle"])

    content_titles = TEXT_CONTENT_TITLES.get(nodeid, set())
    for doc in docs_by_collection.get("texts", {}).values():
        title = doc.get("title")
        request = requested_versions.get(title) if title in content_titles else None
        if request is None:
            doc["chapter"] = []
            continue
        languages = request["languages"]
        version_titles = request["version_titles"]
        if languages or version_titles:
            if languages and doc.get("language") not in languages:
                doc["chapter"] = []
            if version_titles and doc.get("versionTitle") not in version_titles:
                doc["chapter"] = []

    library = {"index", "category", "term"}
    overlay = {
        collection: [docs[key] for key in sorted(docs.keys())]
        for collection, docs in sorted(docs_by_collection.items())
        if collection not in library
    }
    base_part = {
        collection: [docs[key] for key in sorted(docs.keys())]
        for collection, docs in sorted(docs_by_collection.items())
        if collection in library
    }
    return overlay, base_part


def write_fixture(output_dir, nodeid, collections, records=None):
    os.makedirs(output_dir, exist_ok=True)
    records = records or []
    if nodeid != "_base":
        for collection, docs in collections.items():
            query_fields = recorded_fields(records, collection)
            # A collection with no recorded field references is retained as
            # captured; projecting it to _id alone would create a vacuous
            # fixture. Texts are the intentional exception because chapter is
            # skeletonised below.
            if not query_fields and collection != "texts":
                continue
            fields = {"_id"} | query_fields
            if collection == "links":
                fields |= LINK_RESPONSE_FIELDS
            if collection == "texts":
                fields |= TEXTS_RESPONSE_FIELDS
            if collection == "groups":
                fields |= GROUPS_RESPONSE_FIELDS
            if collection == "topics":
                fields |= TOPICS_RESPONSE_FIELDS
            if collection == "topic_links":
                fields |= TOPIC_LINKS_RESPONSE_FIELDS
            if collection == "vstate":
                fields |= VSTATE_RESPONSE_FIELDS
            content_titles = TEXT_CONTENT_TITLES.get(nodeid, set())
            for doc in docs:
                if collection == "texts":
                    if doc.get("title") not in content_titles:
                        doc["chapter"] = []
                    fields.add("chapter")
                for key in list(doc):
                    if key not in fields:
                        del doc[key]
    sorted_collections = {
        coll: sorted(collections[coll], key=doc_id_sort_key)
        for coll in sorted(collections.keys())
    }
    payload = {
        "nodeid": nodeid,
        "collections": sorted_collections,
    }
    dump_kwargs = {"sort_keys": True}
    if nodeid != "_base":
        dump_kwargs["indent"] = 2
    encoded = json_util.dumps(payload, **dump_kwargs) + "\n"
    path = os.path.join(output_dir, sanitize_nodeid(nodeid) + ".json")
    size = len(encoded.encode("utf-8"))
    if nodeid == "_base" and size > MAX_BASE_BYTES:
        print(
            f"WARNING: not rewriting _base.json: generated fixture is {size} bytes (> {MAX_BASE_BYTES})",
            file=sys.stderr,
        )
        return None
    if nodeid != "_base" and size > MAX_FIXTURE_BYTES:
        _oversized_fixtures.append({"nodeid": nodeid, "reason": "oversized"})
        print(
            f"WARNING: omitting {nodeid}: generated fixture is {size} bytes (> {MAX_FIXTURE_BYTES})",
            file=sys.stderr,
        )
        return None
    with open(path, "w") as f:
        f.write(encoded)
    # Validate the artifact immediately so a partial/tool-corrupted write can
    # never be mistaken for a usable fixture.
    with open(path) as f:
        json.load(f)
    return path


def write_base_fixture(output_dir, collections):
    """Write the shared library metadata fixture from a prepared union."""
    allowed = {"index", "category", "term"}
    trimmed = {key: docs for key, docs in collections.items() if key in allowed}
    return write_fixture(output_dir, "_base", trimmed)


def enrich_base_with_extra_titles(source_db, accumulator):
    """Ensure titles needed during test collection/import exist in _base.json."""
    if not BASE_EXTRA_TITLES:
        return
    for doc in source_db["index"].find({"title": {"$in": BASE_EXTRA_TITLES}}).sort("_id", 1):
        accumulator["index"][str(doc["_id"])] = doc

    shared_titles = set()
    for doc in accumulator.get("index", {}).values():
        shared_titles.update(find_shared_titles(doc.get("schema")))
        shared_titles.update(find_shared_titles(doc.get("alt_structs")))
    if shared_titles:
        for doc in source_db["term"].find({"name": {"$in": sorted(shared_titles)}}).sort("_id", 1):
            accumulator["term"][str(doc["_id"])] = doc

    category_paths = set()
    for doc in accumulator.get("index", {}).values():
        categories = doc.get("categories") or []
        for i in range(1, len(categories) + 1):
            category_paths.add(tuple(categories[:i]))
    for path in sorted(category_paths):
        doc = source_db["category"].find_one({"path": list(path)})
        if doc:
            accumulator["category"][str(doc["_id"])] = doc
        shared_titles.update(path)

    already_loaded_terms = {
        doc.get("name") for doc in accumulator.get("term", {}).values()
    }
    missing_terms = sorted(shared_titles - already_loaded_terms)
    if missing_terms:
        for doc in source_db["term"].find({"name": {"$in": missing_terms}}).sort("_id", 1):
            accumulator["term"][str(doc["_id"])] = doc


def merge_base_docs(accumulator, collections):
    for collection, docs in collections.items():
        if collection not in {"index", "category", "term"}:
            continue
        for doc in docs:
            accumulator[collection][str(doc.get("_id"))] = doc


def load_existing_base(path):
    if not os.path.isfile(path):
        return {}
    try:
        with open(path) as f:
            payload = json.load(f)
    except (ValueError, OSError):
        return {}
    collections = payload.get("collections") or {}
    if not set(collections) <= {"index", "category", "term"}:
        return {}
    return collections


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("test_files", nargs="+", help="pytest file path(s) to export, e.g. sefaria/tests/recommendation_test.py")
    ap.add_argument("--artifact-dir", default=DEFAULT_ARTIFACT_DIR)
    ap.add_argument("--output-dir", default=DEFAULT_FIXTURE_DIR)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=27018)
    ap.add_argument("--source-db", default="sefaria")
    args = ap.parse_args()

    if args.host != "127.0.0.1":
        raise SystemExit("refusing to export fixtures from a non-loopback Mongo host")

    client = pymongo.MongoClient(args.host, args.port, serverSelectionTimeoutMS=5000)
    source_db = client[args.source_db]

    existing_manifest = {}
    partial_library_manifest = {}
    if os.path.isfile(NOT_MOCKABLE_MANIFEST):
        try:
            with open(NOT_MOCKABLE_MANIFEST) as f:
                for entry in json.load(f):
                    existing_manifest[entry["nodeid"]] = entry
                    if entry.get("reason") == "partial-library":
                        partial_library_manifest[entry["nodeid"]] = entry
        except (ValueError, OSError):
            existing_manifest = {}

    written = []
    written_nodeids = set()
    base_acc = defaultdict(dict)
    merge_base_docs(base_acc, load_existing_base(os.path.join(args.output_dir, "_base.json")))
    for test_file in args.test_files:
        paths = list(artifact_paths(args.artifact_dir, test_file))
        if not paths:
            print(f"no recorder artifacts found for {test_file!r} under {args.artifact_dir}", file=sys.stderr)
            continue
        for path in paths:
            records = list(load_records(path))
            if not records:
                continue
            nodeid = records[0]["nodeid"]
            if nodeid in partial_library_manifest:
                print(f"Skipping {nodeid}: marked as partial-library in not-mockable manifest", file=sys.stderr)
                continue
            collections, base_part = collect_docs(source_db, records)
            merge_base_docs(base_acc, base_part)
            path = write_fixture(args.output_dir, nodeid, collections, records)
            if path:
                written.append(path)
                written_nodeids.add(nodeid)

    if base_acc:
        enrich_base_with_extra_titles(source_db, base_acc)
        write_base_fixture(
            args.output_dir,
            {collection: list(docs.values()) for collection, docs in base_acc.items()},
        )

    for path in written:
        print(path)

    os.makedirs(os.path.dirname(NOT_MOCKABLE_MANIFEST), exist_ok=True)
    # Never remove partial-library entries, only update oversized status
    for nodeid in written_nodeids:
        if nodeid not in partial_library_manifest:
            existing_manifest.pop(nodeid, None)
    for entry in _oversized_fixtures:
        existing_manifest[entry["nodeid"]] = entry
    sorted_manifest = [existing_manifest[k] for k in sorted(existing_manifest.keys())]
    with open(NOT_MOCKABLE_MANIFEST, "w") as f:
        json.dump(sorted_manifest, f, indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
