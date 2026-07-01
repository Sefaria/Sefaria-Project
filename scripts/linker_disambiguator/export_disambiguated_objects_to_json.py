"""
Export disambiguated objects from linker_disambiguation_tmp to JSON files.

Reads linker_disambiguation_tmp to determine which documents were touched
by the disambiguator, then fetches their current state from the target
collections and saves them to JSON files.

Output files:
  links.json               - link objects (type='link' records that have a 'link' field)
  linker_output.json       - linker_output docs (1:1 with mutc records, matched by ref/versionTitle/language)
  marked_up_text_chunks.json - marked_up_text_chunk docs (type='mutc' records)
"""
import argparse
import json
import os
from bson import ObjectId
from datetime import datetime

import django
django.setup()

from tqdm import tqdm

from sefaria.system.database import db


def _serialize(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    return obj


def _open_json_array(f):
    f.write("[\n")


def _write_item(f, item, first):
    if not first:
        f.write(",\n")
    json.dump(item, f, ensure_ascii=False, indent=2)


def _close_json_array(f):
    f.write("\n]\n")


LINK_BATCH_SIZE = 1000


def main():
    parser = argparse.ArgumentParser(description="Export disambiguated objects to JSON files")
    parser.add_argument("--output-dir", "-o", default=".", help="Output directory (default: current dir)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    mutc_keys = set()
    link_ids = []
    seen_link_ids = set()

    total = db.linker_disambiguation_tmp.count_documents({})
    cursor = db.linker_disambiguation_tmp.find(
        {}, {"type": 1, "ref": 1, "versionTitle": 1, "language": 1, "link": 1, "id": 1}
    )
    with tqdm(cursor, total=total, desc="Scanning tmp collection", unit="doc") as bar:
        for doc in bar:
            doc_type = doc.get("type")
            if doc_type == "mutc":
                ref = doc.get("ref")
                vtitle = doc.get("versionTitle")
                lang = doc.get("language")
                if ref and vtitle and lang:
                    mutc_keys.add((ref, vtitle, lang))
            elif doc_type == "link" and doc.get("link"):
                link_id = doc.get("id")
                if link_id and link_id not in seen_link_ids:
                    link_ids.append(link_id)
                    seen_link_ids.add(link_id)
    del seen_link_ids

    print(f"Unique MUTC keys: {len(mutc_keys):,}, unique link IDs: {len(link_ids):,}")

    mutc_path = os.path.join(args.output_dir, "marked_up_text_chunks.json")
    lo_path = os.path.join(args.output_dir, "linker_output.json")
    links_path = os.path.join(args.output_dir, "links.json")

    mutc_count = lo_count = 0
    with open(mutc_path, "w", encoding="utf-8") as mutc_f, \
         open(lo_path, "w", encoding="utf-8") as lo_f:
        _open_json_array(mutc_f)
        _open_json_array(lo_f)
        with tqdm(mutc_keys, total=len(mutc_keys), desc="Fetching MUTC + linker_output", unit="key") as bar:
            for ref, vtitle, lang in bar:
                query = {"ref": ref, "versionTitle": vtitle, "language": lang}
                mutc = db.marked_up_text_chunks.find_one(query)
                if mutc:
                    _write_item(mutc_f, _serialize(mutc), mutc_count == 0)
                    mutc_count += 1
                lo = db.linker_output.find_one(query)
                if lo:
                    _write_item(lo_f, _serialize(lo), lo_count == 0)
                    lo_count += 1
        _close_json_array(mutc_f)
        _close_json_array(lo_f)
    del mutc_keys
    print(f"Saved {mutc_count:,} marked_up_text_chunks to {mutc_path}")
    print(f"Saved {lo_count:,} linker_output docs to {lo_path}")

    link_count = 0
    num_batches = (len(link_ids) + LINK_BATCH_SIZE - 1) // LINK_BATCH_SIZE
    with open(links_path, "w", encoding="utf-8") as links_f:
        _open_json_array(links_f)
        with tqdm(range(0, len(link_ids), LINK_BATCH_SIZE), total=num_batches, desc="Fetching links", unit="batch") as bar:
            for batch_start in bar:
                batch = link_ids[batch_start:batch_start + LINK_BATCH_SIZE]
                for link in db.links.find({"_id": {"$in": batch}}):
                    _write_item(links_f, _serialize(link), link_count == 0)
                    link_count += 1
        _close_json_array(links_f)
    print(f"Saved {link_count:,} links to {links_path}")


if __name__ == "__main__":
    main()
