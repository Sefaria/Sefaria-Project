"""
Export linker_editor_history entries to a JSON file, for replay against another environment
via replay_linker_editor_history.py.
"""
import argparse
import json

import django
django.setup()

from tqdm import tqdm

from sefaria.system.database import db


def _serialize(doc):
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    return doc


def main():
    parser = argparse.ArgumentParser(description="Export linker_editor_history to a JSON file")
    parser.add_argument("--output", "-o", required=True, help="Output JSON file path")
    args = parser.parse_args()

    # Sort by _id (not `created`, which is only second-resolution and can tie within a
    # replay/import burst) -- ObjectIds are monotonic at millisecond+counter resolution, so
    # this is the reliable original write order to preserve for replay.
    cursor = db.linker_editor_history.find().sort("_id", 1)
    total = db.linker_editor_history.count_documents({})

    entries = [_serialize(doc) for doc in tqdm(cursor, total=total, desc="Exporting", unit="doc")]

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"Exported {len(entries):,} linker_editor_history entries to {args.output}")


if __name__ == "__main__":
    main()
