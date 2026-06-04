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


def main():
    parser = argparse.ArgumentParser(description="Export disambiguated objects to JSON files")
    parser.add_argument("--output-dir", "-o", default=".", help="Output directory (default: current dir)")
    args = parser.parse_args()

    docs = list(db.linker_disambiguation_tmp.find())
    print(f"Loaded {len(docs)} docs from linker_disambiguation_tmp")

    mutc_keys = set()  # (ref, versionTitle, language)
    link_ids = []      # ObjectId, in order (deduplicated)
    seen_link_ids = set()

    for doc in docs:
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

    print(f"Unique MUTC keys: {len(mutc_keys)}, unique link IDs: {len(link_ids)}")

    mutc_docs = []
    linker_output_docs = []
    for ref, vtitle, lang in mutc_keys:
        query = {"ref": ref, "versionTitle": vtitle, "language": lang}
        mutc = db.marked_up_text_chunks.find_one(query)
        if mutc:
            mutc_docs.append(_serialize(mutc))
        lo = db.linker_output.find_one(query)
        if lo:
            linker_output_docs.append(_serialize(lo))

    link_docs = []
    for link_id in link_ids:
        link = db.links.find_one({"_id": link_id})
        if link:
            link_docs.append(_serialize(link))

    def _write(path, data, label):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(data)} {label} to {path}")

    _write(os.path.join(args.output_dir, "links.json"), link_docs, "links")
    _write(os.path.join(args.output_dir, "linker_output.json"), linker_output_docs, "linker_output docs")
    _write(os.path.join(args.output_dir, "marked_up_text_chunks.json"), mutc_docs, "marked_up_text_chunks docs")


if __name__ == "__main__":
    main()
