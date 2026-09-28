#!/usr/bin/env python
"""
Audit linker markup records with stale versionTitle values.

This script scans `marked_up_text_chunks` and/or `linker_output` and prints
records whose `ref` resolves to a current text title but whose
`title + language + versionTitle` no longer matches any Version. For each
invalid record, it can try to repair `versionTitle` by finding the one current
Version where every saved non-deleted span's charRange still matches span.text.

Default behavior is read-only. Pass `--repair` to update uniquely repairable
records, or `--delete` to delete invalid records.

Usage:
    ./run scripts/audit_linker_chunk_version_titles.py
    ./run scripts/audit_linker_chunk_version_titles.py --collection linker_output
    ./run scripts/audit_linker_chunk_version_titles.py --repair
    ./run scripts/audit_linker_chunk_version_titles.py --delete
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone

import django

django.setup()

from bson import ObjectId

from sefaria.model import Ref, TextChunk
from sefaria.system.database import db


COLLECTIONS = {
    "marked_up_text_chunks": db.marked_up_text_chunks,
    "linker_output": db.linker_output,
}
BATCH_SIZE = 1000


class UnmatchableSpans(Exception):
    pass


def _json_default(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _version_exists_cache_key(doc):
    ref = doc.get("ref")
    language = doc.get("language")
    version_title = doc.get("versionTitle")
    if not ref or not language or not version_title:
        return None, "missing_key"
    try:
        title = Ref(ref).index.title
    except Exception:
        return None, "invalid_ref"
    return (title, language, version_title), None


def _active_span_checks(doc):
    checks = []
    for span in doc.get("spans") or []:
        if span.get("deleted"):
            continue
        char_range = span.get("charRange")
        text = span.get("text")
        if (
            not isinstance(char_range, list)
            or len(char_range) != 2
            or not all(isinstance(i, int) for i in char_range)
            or not isinstance(text, str)
        ):
            raise UnmatchableSpans("malformed_span")
        checks.append((char_range[0], char_range[1], text))
    if not checks:
        raise UnmatchableSpans("no_active_spans")
    return checks


def _candidate_version_titles(title, language, cache):
    key = (title, language)
    if key not in cache:
        cache[key] = sorted(db.texts.distinct("versionTitle", {
            "title": title,
            "language": language,
        }))
    return cache[key]


def _text_matches_spans(oref, language, version_title, span_checks):
    text = TextChunk(oref, lang=language, vtitle=version_title).text
    if not isinstance(text, str):
        return False
    for start, end, span_text in span_checks:
        if start < 0 or end < start or end > len(text):
            return False
        if text[start:end] != span_text:
            return False
    return True


def _repair_candidates(doc, title, language, version_cache):
    try:
        oref = Ref(doc["ref"])
        span_checks = _active_span_checks(doc)
    except UnmatchableSpans as exc:
        return [], str(exc)
    except Exception:
        return [], "invalid_ref"

    matches = []
    for version_title in _candidate_version_titles(title, language, version_cache):
        try:
            is_match = _text_matches_spans(oref, language, version_title, span_checks)
        except Exception:
            is_match = False
        if is_match:
            matches.append(version_title)
    return matches, None


def _find_invalid_version_title_docs(collection, collection_name, limit=None):
    summary = Counter()
    version_exists_cache = {}
    version_cache = {}
    projection = {"ref": 1, "versionTitle": 1, "language": 1, "spans": 1}
    cursor = collection.find({}, projection)
    if limit:
        cursor = cursor.limit(limit)

    try:
        for doc in cursor:
            summary["scanned"] += 1
            cache_key, skip_reason = _version_exists_cache_key(doc)
            if skip_reason:
                summary[skip_reason] += 1
                continue

            if cache_key not in version_exists_cache:
                title, language, version_title = cache_key
                version_exists_cache[cache_key] = db.texts.count_documents({
                    "title": title,
                    "language": language,
                    "versionTitle": version_title,
                }, limit=1) > 0

            if version_exists_cache[cache_key]:
                summary["valid"] += 1
                continue

            summary["invalid_version_title"] += 1
            title, language, version_title = cache_key
            candidates, repair_blocked_reason = _repair_candidates(doc, title, language, version_cache)
            if len(candidates) == 1:
                repair_status = "repairable_unique_match"
            elif len(candidates) > 1:
                repair_status = "ambiguous_matches"
            else:
                repair_status = repair_blocked_reason or "no_matching_version"
            summary[repair_status] += 1
            yield {
                "collection": collection_name,
                "_id": doc["_id"],
                "ref": doc.get("ref"),
                "title": title,
                "language": language,
                "versionTitle": version_title,
                "repairStatus": repair_status,
                "candidateVersionTitles": candidates,
            }, summary
    finally:
        cursor.close()

    yield None, summary


def _print_invalid_doc(invalid_doc):
    print(json.dumps(invalid_doc, ensure_ascii=False, default=_json_default))


def _flush_deletes(collection, ids_to_delete, dry_run):
    if not ids_to_delete or dry_run:
        return 0
    result = collection.delete_many({"_id": {"$in": ids_to_delete}})
    return result.deleted_count


def _repair_doc(collection, invalid_doc, dry_run):
    candidates = invalid_doc.get("candidateVersionTitles") or []
    if len(candidates) != 1:
        return 0
    if dry_run:
        return 0
    result = collection.update_one(
        {"_id": invalid_doc["_id"], "versionTitle": invalid_doc["versionTitle"]},
        {"$set": {"versionTitle": candidates[0]}},
    )
    return result.modified_count


def audit_collection(collection_name, delete=False, repair=False, limit=None):
    collection = COLLECTIONS[collection_name]
    summary = Counter()
    ids_to_delete = []
    deleted = 0
    repaired = 0

    for invalid_doc, latest_summary in _find_invalid_version_title_docs(collection, collection_name, limit=limit):
        summary = latest_summary
        if invalid_doc is None:
            break
        _print_invalid_doc(invalid_doc)
        if repair and invalid_doc["repairStatus"] == "repairable_unique_match":
            repaired += _repair_doc(collection, invalid_doc, dry_run=False)
        elif delete:
            ids_to_delete.append(invalid_doc["_id"])
            if len(ids_to_delete) >= BATCH_SIZE:
                deleted += _flush_deletes(collection, ids_to_delete, dry_run=False)
                ids_to_delete = []

    deleted += _flush_deletes(collection, ids_to_delete, dry_run=not delete)
    summary["deleted"] = deleted
    summary["repaired"] = repaired
    return summary


def main():
    parser = argparse.ArgumentParser(description="Print, repair, or delete linker markup records whose versionTitle has no matching Version.")
    parser.add_argument(
        "--collection",
        choices=["both", *COLLECTIONS.keys()],
        default="both",
        help="collection to scan",
    )
    action_group = parser.add_mutually_exclusive_group()
    action_group.add_argument("--repair", action="store_true", help="repair records when exactly one current Version matches all saved span ranges")
    action_group.add_argument("--delete", action="store_true", help="delete invalid version-title records after printing them")
    parser.add_argument("--limit", type=int, help="scan at most this many records per collection")
    args = parser.parse_args()

    collection_names = COLLECTIONS.keys() if args.collection == "both" else [args.collection]
    overall = {}
    for collection_name in collection_names:
        summary = audit_collection(collection_name, delete=args.delete, repair=args.repair, limit=args.limit)
        overall[collection_name] = dict(summary)

    print(json.dumps({
        "mode": "delete" if args.delete else "repair" if args.repair else "dry-run",
        "summary": overall,
        "finishedAt": datetime.now(timezone.utc),
    }, ensure_ascii=False, default=_json_default, indent=2))


if __name__ == "__main__":
    main()
