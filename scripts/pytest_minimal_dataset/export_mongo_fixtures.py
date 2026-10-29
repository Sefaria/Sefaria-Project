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
# Raised from 8 MiB. _base.json now carries whole library families (see
# BASE_LIBRARY_CATEGORIES) so that the ~1,200 tests which resolve refs but issue
# no Mongo command of their own can run under mongomock instead of nowhere. The
# binding ceiling is the 20 MiB total for sefaria/tests/fixtures/mongo in
# .team/fixture-size-spec.md; the overlays occupy ~2.9 MiB, which leaves ~17 MiB
# here. See check_total_budget() -- the total, not this number, is the hard line.
MAX_BASE_BYTES = 17 * 1024 * 1024
MAX_TOTAL_BYTES = 20 * 1024 * 1024
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
    # Named by ref/schema/link/library tests outside the three families below.
    # ~220 KB together; each one is cited by at least one test.
    "Chafetz Chaim",
    "Hadran",
    "Orot",
    "Orot HaKodesh",
    "Pesach Haggadah",
    "Shulchan Arukh, Even HaEzer",
    "Shulchan Arukh, Orach Chayim",
    "Siddur Ashkenaz",
    "The Book of Susanna",
]

# Whole top-level library families copied into _base.json, with their
# commentaries. Most of the suite never issues a Mongo command itself -- it
# resolves refs through the `library` singleton, which is built once from
# whatever `index` documents the mock holds. A per-test title list cannot serve
# those tests, because a ref they never name (a link target, a commentary, a
# Hebrew alt title) still has to resolve. These three families are what the
# unmarked suite actually cites, and together they fit the size budget; adding
# Halakhah as well would cost another 6.5 MiB and break the 20 MiB total.
BASE_LIBRARY_CATEGORIES = ("Tanakh", "Mishnah", "Talmud")

# Debris in the local dump, not real corpus data: an `index` document left
# behind by a crashed test run. It sits directly under the Tanakh category,
# where the real corpus has no text at all, and it breaks
# autospell_test.py::TestSearchCategories, which asserts exactly that.
BASE_EXCLUDED_INDEX_TITLES = frozenset({"Delete Me"})

# Small collections copied whole. `term` and `category` complete the library
# metadata for the families above (a partial `category` set silently reshapes
# the TOC). `topic_link_types` supplies the `is-a` slug that TopicSet graph
# queries validate against, and `websites` supplies the bad-url rules
# WebPage.should_be_excluded() consults -- with it absent, a page that should be
# excluded is saved instead, and the test passes or fails for the wrong reason.
# `topic_data_sources` (11 docs) supplies the `sefaria` data source every
# topic-link fixture validates against.
BASE_WHOLE_COLLECTIONS = ("term", "category", "topic_link_types", "topic_data_sources", "websites")

# Collections whose keys _base.json is allowed to hold.
BASE_COLLECTIONS = ("index", "category", "term", "topic_data_sources", "topic_link_types", "websites", "topics")

# An unfiltered read (find/aggregate with no replayable filter, plus the getMore
# batches of its cursor) that returned more than this many documents is a
# library-wide scan: `library.rebuild()` reading every `index` doc, a TOC rebuild
# reading every `vstate` doc (category.py), and the like. Its reply ids are not
# copied. Copying them put the whole `index` collection into _base.json (~37 MB
# against the 17 MiB cap), and the whole `vstate` collection (`content` is kept,
# see VSTATE_RESPONSE_FIELDS) with other scanned collections into each overlay of
# a test that rebuilds the library (~450 MB) when every needs_mongo test was
# re-recorded against the full dump. Under the mock those reads are served by _base.json; a test that
# asserts on a specific document still gets it from its own filtered reads.
# Smaller unfiltered reads (whole `websites`, `groups`, ...) are still copied.
SCAN_COPY_LIMIT = 1000
# Only these collections are skipped when scanned: the reviewed library-bootstrap
# scans (index maps, TOC rebuild reading vstate, topic graph). A scan of any other
# collection is still copied, so an oversized fixture fails loudly instead of
# silently exporting no documents.
SCAN_SKIP_COLLECTIONS = frozenset({"index", "vstate", "topics", "topic_links"})

sys.path.insert(0, SCRIPT_DIR)
from generate_minimal_dataset import (  # noqa: E402
    extract_match_filter,
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


def library_wide_scans(records):
    """Positions of the records that belong to an unfiltered read over SCAN_COPY_LIMIT documents.

    A scan is a find/aggregate with no replayable filter plus the getMore batches
    that continue its cursor (matched on collection and the recorder's cursor_id).
    Returns (positions, [(collection, documents returned)]) for the scans found.
    """
    scans = {}
    origin_of_cursor = {}
    for pos, record in enumerate(records):
        command = record.get("command")
        key = (record.get("collection"), record.get("cursor_id"))
        if command in ("find", "aggregate"):
            if not normalize_filters(record):
                scans[pos] = [pos]
            if record.get("cursor_id"):
                origin_of_cursor[key] = pos
        elif command == "getMore" and record.get("cursor_id"):
            origin = origin_of_cursor.get(key)
            if origin in scans:
                scans[origin].append(pos)
    positions = set()
    summary = []
    for origin, members in sorted(scans.items()):
        returned = sum(len(records[p].get("doc_ids") or []) for p in members)
        if returned > SCAN_COPY_LIMIT and records[origin].get("collection") in SCAN_SKIP_COLLECTIONS:
            positions.update(members)
            summary.append((records[origin].get("collection"), returned))
    return positions, summary


def collect_docs(source_db, records):
    ids_to_copy = defaultdict(set)
    filters_to_replay = defaultdict(list)
    touched_titles = set()
    scan_positions, scans = library_wide_scans(records)
    for collection, returned in scans:
        print(
            f"note: {records[0].get('nodeid')}: not copying {returned} {collection} doc(s) of an unfiltered "
            f"scan over SCAN_COPY_LIMIT ({SCAN_COPY_LIMIT}); _base.json serves library-wide reads",
            file=sys.stderr,
        )

    for pos, record in enumerate(records):
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
        # Also copy the reply's doc_ids when a filter was replayed: recorded filters
        # are JSON with default=str, so ObjectId / regex / datetime values come back
        # as plain strings and replaying them matches nothing. The dedupe below only
        # fetches ids the replay did not already return. Inserted documents are the
        # test's own and have nothing to copy; sampled `links` stay capped.
        if record.get("command") != "insert" and pos not in scan_positions and not (
            collection == "links" and record.get("nodeid") in LINK_SAMPLE_SAFE
        ):
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
        parts = ", ".join(
            f"{coll} {len(docs)} docs {len(json_util.dumps(docs).encode('utf-8'))} B"
            for coll, docs in sorted_collections.items()
        )
        print(
            f"WARNING: omitting {nodeid}: generated fixture is {size} bytes (> {MAX_FIXTURE_BYTES}): {parts}",
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
    trimmed = {key: docs for key, docs in collections.items() if key in BASE_COLLECTIONS}
    return write_fixture(output_dir, "_base", trimmed)


def refresh_base_from_source(source_db, accumulator):
    """Re-read every base document carried over from an earlier export: edits at the source win, ids that
    vanished are dropped. Returns {collection: [dropped ids]}."""
    dropped = {}
    for collection, docs in accumulator.items():
        if not docs: continue
        fresh = {str(d["_id"]): d for d in source_db[collection].find({"_id": {"$in": [d["_id"] for d in docs.values()]}})}
        for key in list(docs):
            if key in fresh: docs[key] = fresh[key]
            else: dropped.setdefault(collection, []).append(key); del docs[key]
    return dropped


def write_manifest(output_dir, source=None):
    fixtures = {}
    for name in sorted(os.listdir(output_dir)):
        if name.startswith("_") or not name.endswith(".json"): continue
        raw = open(os.path.join(output_dir, name), "rb").read()
        payload = json.loads(raw)
        fixtures[name] = {"nodeid": payload["nodeid"], "sha256": hashlib.sha256(raw).hexdigest(),
                          "collections": sorted(payload["collections"])}
    base = os.path.join(output_dir, "_base.json")
    if not os.path.isfile(base):
        raise SystemExit(f"cannot write manifest: {base} is missing")
    manifest = {"format": 1, "source": source or {}, "fixtures": fixtures,
                "base": {"sha256": hashlib.sha256(open(base, "rb").read()).hexdigest()}}
    with open(os.path.join(output_dir, "_manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True); fh.write("\n")


def enrich_base_with_library_families(source_db, accumulator):
    """Add whole library families and small reference collections to _base.json.

    Deterministic for a given source database: every selection is a full query
    result, never a sample, and write_fixture sorts by _id.
    """
    for doc in source_db["index"].find(
        {"categories.0": {"$in": list(BASE_LIBRARY_CATEGORIES)}}
    ).sort("_id", 1):
        accumulator["index"][str(doc["_id"])] = doc
    for key in [k for k, doc in accumulator["index"].items()
                if doc.get("title") in BASE_EXCLUDED_INDEX_TITLES]:
        del accumulator["index"][key]

    # A commentary whose base text is absent makes the TOC build log a
    # "No book named ..." skip for it, which the skip-tracking audit tests read
    # as corruption. Close over base_text_titles until nothing new is found.
    while True:
        have = {doc.get("title") for doc in accumulator["index"].values()}
        wanted = sorted({
            title
            for doc in accumulator["index"].values()
            for title in (doc.get("base_text_titles") or [])
            if title not in have and title not in BASE_EXCLUDED_INDEX_TITLES
        })
        added = 0
        for doc in source_db["index"].find({"title": {"$in": wanted}}).sort("_id", 1) if wanted else []:
            if str(doc["_id"]) not in accumulator["index"]:
                accumulator["index"][str(doc["_id"])] = doc
                added += 1
        if not added:
            break

    for collection in BASE_WHOLE_COLLECTIONS:
        for doc in source_db[collection].find({}).sort("_id", 1):
            accumulator[collection][str(doc["_id"])] = doc

    # TopicLinkType._validate() requires every slug in validFrom/validTo to be
    # an existing Topic. The full `topics` collection is ~11 MB, so copy only
    # the topics those link types name.
    slugs = set()
    for doc in accumulator.get("topic_link_types", {}).values():
        slugs.update(doc.get("validFrom") or [])
        slugs.update(doc.get("validTo") or [])
    if slugs:
        for doc in source_db["topics"].find({"slug": {"$in": sorted(slugs)}}).sort("_id", 1):
            accumulator["topics"][str(doc["_id"])] = doc


def fixture_dir_bytes(output_dir):
    return sum(
        os.path.getsize(os.path.join(output_dir, name))
        for name in os.listdir(output_dir)
        if os.path.isfile(os.path.join(output_dir, name))
    )


def check_total_budget(output_dir):
    """Fail loudly when the committed fixture payload exceeds the 20 MiB total."""
    total = fixture_dir_bytes(output_dir)
    if total > MAX_TOTAL_BYTES:
        raise SystemExit(
            f"fixture payload under {output_dir} is {total} bytes (> {MAX_TOTAL_BYTES}); "
            "shrink BASE_LIBRARY_CATEGORIES before committing"
        )
    return total


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
    """Merge base docs into the accumulator. Returns {collection: number of ids it did not hold yet}."""
    added = {}
    for collection, docs in collections.items():
        if collection not in BASE_COLLECTIONS:
            continue
        for doc in docs:
            key = str(doc.get("_id"))
            if key not in accumulator[collection]:
                added[collection] = added.get(collection, 0) + 1
            accumulator[collection][key] = doc
    return added


def report_base_contributors(contributions, top=10):
    """Name the tests that added the most new base docs, so a base over the cap points at its cause."""
    ranked = sorted(contributions.items(), key=lambda item: (-sum(item[1].values()), item[0]))[:top]
    for nodeid, added in ranked:
        if added:
            detail = ", ".join(f"{coll} {n}" for coll, n in sorted(added.items()))
            print(f"  base docs added by {nodeid}: {detail}", file=sys.stderr)


def load_existing_base(path):
    if not os.path.isfile(path):
        return {}
    try:
        with open(path) as f:
            payload = json_util.loads(f.read())
    except (ValueError, OSError):
        return {}
    collections = payload.get("collections") or {}
    if not set(collections) <= set(BASE_COLLECTIONS):
        return {}
    return collections


def load_source_stamp(path, output_dir):
    """Manifest `source`: the --source-stamp-json object when given, else what the existing manifest records."""
    if path:
        with open(path) as f:
            return json.load(f)
    existing = os.path.join(output_dir, "_manifest.json")
    if os.path.isfile(existing):
        try:
            with open(existing) as f:
                return json.load(f).get("source") or None
        except (ValueError, OSError):
            return None
    return None


def report_dropped(dropped):
    for collection, ids in sorted(dropped.items()):
        print(f"dropped {len(ids)} {collection} doc(s) deleted from source: {', '.join(ids)}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("test_files", nargs="*", help="pytest file path(s) to export, e.g. sefaria/tests/recommendation_test.py")
    ap.add_argument("--artifact-dir", default=DEFAULT_ARTIFACT_DIR)
    ap.add_argument("--output-dir", default=DEFAULT_FIXTURE_DIR)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=27018)
    ap.add_argument("--source-db", default="sefaria")
    ap.add_argument(
        "--base-only", action="store_true",
        help="rebuild _base.json only (existing base + library families); leave per-test overlays untouched",
    )
    ap.add_argument(
        "--manifest-only", action="store_true",
        help="rewrite _manifest.json from the fixture files in --output-dir and exit",
    )
    ap.add_argument(
        "--source-stamp-json", metavar="PATH",
        help="JSON object merged into the manifest's source (dump_url, last_modified, etag, recorded_at, git_sha)",
    )
    args = ap.parse_args()

    if args.manifest_only:
        write_manifest(args.output_dir, load_source_stamp(args.source_stamp_json, args.output_dir))
        return

    if args.host != "127.0.0.1":
        raise SystemExit("refusing to export fixtures from a non-loopback Mongo host")
    if not args.base_only and not args.test_files:
        ap.error("test_files is required unless --base-only or --manifest-only is given")

    client = pymongo.MongoClient(args.host, args.port, serverSelectionTimeoutMS=5000)
    source_db = client[args.source_db]

    if args.base_only:
        base_acc = defaultdict(dict)
        merge_base_docs(base_acc, load_existing_base(os.path.join(args.output_dir, "_base.json")))
        report_dropped(refresh_base_from_source(source_db, base_acc))
        enrich_base_with_extra_titles(source_db, base_acc)
        enrich_base_with_library_families(source_db, base_acc)
        path = write_base_fixture(
            args.output_dir,
            {collection: list(docs.values()) for collection, docs in base_acc.items()},
        )
        if path is None:
            raise SystemExit(f"_base.json was NOT rewritten: it would exceed MAX_BASE_BYTES ({MAX_BASE_BYTES})")
        total = check_total_budget(args.output_dir)
        print(f"{path} ({os.path.getsize(path)} bytes; fixture total {total} bytes)")
        return

    written = []
    oversized = []
    contributions = {}
    base_acc = defaultdict(dict)
    merge_base_docs(base_acc, load_existing_base(os.path.join(args.output_dir, "_base.json")))
    report_dropped(refresh_base_from_source(source_db, base_acc))
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
            collections, base_part = collect_docs(source_db, records)
            contributions[nodeid] = merge_base_docs(base_acc, base_part)
            path = write_fixture(args.output_dir, nodeid, collections, records)
            if path:
                written.append(path)
            else:
                oversized.append(nodeid)

    if base_acc:
        enrich_base_with_extra_titles(source_db, base_acc)
        enrich_base_with_library_families(source_db, base_acc)
        path = write_base_fixture(
            args.output_dir,
            {collection: list(docs.values()) for collection, docs in base_acc.items()},
        )
        if path is None:
            report_base_contributors(contributions)
            raise SystemExit(f"_base.json was NOT rewritten: it would exceed MAX_BASE_BYTES ({MAX_BASE_BYTES})")
        check_total_budget(args.output_dir)

    for path in written:
        print(path)

    write_manifest(args.output_dir, load_source_stamp(args.source_stamp_json, args.output_dir))
    if oversized:
        raise SystemExit(
            f"fixtures over MAX_FIXTURE_BYTES ({MAX_FIXTURE_BYTES} bytes) were not written; "
            f"mark these needs_corpus: {', '.join(oversized)}"
        )


if __name__ == "__main__":
    main()
