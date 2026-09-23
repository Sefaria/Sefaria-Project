"""
Import disambiguated objects from JSON files (as produced by export_disambiguated_objects_to_json.py)
back into MongoDB.

For each document, checks whether it already exists using the natural key for that collection:
  links                  - matched by _id
  linker_output          - matched by (ref, versionTitle, language)
  marked_up_text_chunks  - matched by (ref, versionTitle, language)

Overwrites existing documents; inserts new ones. Reports new/updated counts per collection.
"""
import argparse
import json
import os
import sys
from bson import ObjectId
from tqdm import tqdm

import django
django.setup()

from sefaria.system.database import db

_STREAM_BUF_SIZE = 1 << 20  # 1 MB


def _iter_json_array(path, desc=None):
    """Stream items from a JSON array file one at a time without loading the whole file."""
    decoder = json.JSONDecoder()
    buf = ""
    prev_tell = 0
    with open(path, encoding="utf-8") as f, \
         tqdm(total=os.path.getsize(path), unit="B", unit_scale=True, desc=desc) as bar:

        def _read():
            nonlocal prev_tell
            chunk = f.read(_STREAM_BUF_SIZE)
            cur = f.tell()
            bar.update(cur - prev_tell)
            prev_tell = cur
            return chunk

        while "[" not in buf:
            chunk = _read()
            if not chunk:
                return
            buf += chunk
        buf = buf[buf.index("[") + 1:]
        while True:
            buf = buf.lstrip(" \n\r\t,")
            if not buf:
                chunk = _read()
                if not chunk:
                    return
                buf += chunk
                continue
            if buf[0] == "]":
                return
            try:
                obj, idx = decoder.raw_decode(buf)
                yield obj
                buf = buf[idx:]
            except json.JSONDecodeError:
                chunk = _read()
                if not chunk:
                    return
                buf += chunk


def _deserialize_doc(doc):
    """Convert _id string back to ObjectId if present."""
    result = dict(doc)
    if "_id" in result:
        result["_id"] = ObjectId(result["_id"])
    return result


def _upsert_links(collection, path, label):
    new_count = updated_count = skipped_count = deleted_count = 0
    for raw in _iter_json_array(path, desc=label):
        doc = _deserialize_doc(raw)
        oid = doc["_id"]
        refs = doc.get("refs", [])
        id_match = collection.find_one({"_id": oid})
        refs_match = None
        if len(refs) == 2:
            refs_match = (
                collection.find_one({"refs.0": refs[0], "refs.1": refs[1]}) or
                collection.find_one({"refs.0": refs[1], "refs.1": refs[0]})
            )
        if id_match and refs_match and id_match["_id"] != refs_match["_id"]:
            # _id and refs point to different docs — delete the stale _id doc, leave the refs doc
            collection.delete_one({"_id": oid})
            deleted_count += 1
        elif id_match:
            collection.replace_one({"_id": oid}, doc)
            updated_count += 1
        elif refs_match:
            skipped_count += 1
        else:
            collection.insert_one(doc)
            new_count += 1
    print(f"{label}: {new_count} new, {updated_count} updated, {skipped_count} skipped, {deleted_count} deleted (stale _id with duplicate refs)")
    return new_count, updated_count


def _upsert_by_ref_key(collection, path, label):
    new_count = updated_count = skipped_count = deleted_count = 0
    for raw in _iter_json_array(path, desc=label):
        doc = _deserialize_doc(raw)
        oid = doc.get("_id")
        query = {k: doc[k] for k in ("ref", "versionTitle", "language") if k in doc}
        if len(query) < 3:
            print(f"  WARNING: skipping doc missing ref/versionTitle/language keys: {query}", file=sys.stderr)
            continue
        id_match = collection.find_one({"_id": oid}) if oid else None
        ref_match = collection.find_one(query)
        if id_match and ref_match and id_match["_id"] != ref_match["_id"]:
            # _id and ref key point to different docs — delete stale _id doc, leave ref-key doc
            collection.delete_one({"_id": oid})
            deleted_count += 1
        elif id_match:
            collection.replace_one({"_id": oid}, doc)
            updated_count += 1
        elif ref_match:
            replacement = {**doc, "_id": ref_match["_id"]}
            collection.replace_one({"_id": ref_match["_id"]}, replacement)
            updated_count += 1
        else:
            collection.insert_one(doc)
            new_count += 1
    print(f"{label}: {new_count} new, {updated_count} updated, {skipped_count} skipped, {deleted_count} deleted (stale _id with duplicate ref key)")
    return new_count, updated_count


def main():
    parser = argparse.ArgumentParser(description="Import disambiguated objects from JSON files into MongoDB")
    parser.add_argument("--links", required=True, help="Path to links.json")
    parser.add_argument("--linker-output", required=True, help="Path to linker_output.json")
    parser.add_argument("--marked-up-text-chunks", required=True, help="Path to marked_up_text_chunks.json")
    args = parser.parse_args()

    _upsert_links(db.links, args.links, "links")
    _upsert_by_ref_key(db.linker_output, args.linker_output, "linker_output")
    _upsert_by_ref_key(db.marked_up_text_chunks, args.marked_up_text_chunks, "marked_up_text_chunks")


if __name__ == "__main__":
    main()
