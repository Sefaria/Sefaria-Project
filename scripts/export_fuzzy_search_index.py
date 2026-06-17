"""
Export the ChromaDB fuzzy search index to CSV for inspection.

Usage:
    ./run scripts/export_fuzzy_search_index.py
    ./run scripts/export_fuzzy_search_index.py --output /tmp/keywords.csv
    ./run scripts/export_fuzzy_search_index.py --ref "Genesis 1:1"
    ./run scripts/export_fuzzy_search_index.py --min-rating 4
"""

import argparse
import csv
import logging
import os
import sys
from collections import defaultdict

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from sefaria.helper.fuzzy_search_indexer import COLLECTION_NAME, get_chroma_collection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = "fuzzy_search_index.csv"


def main():
    parser = argparse.ArgumentParser(description="Export ChromaDB fuzzy search index to CSV")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help=f"Output CSV path (default: {DEFAULT_OUTPUT})")
    parser.add_argument("--ref", default=None,
                        help="Filter to a specific ref (exact match)")
    parser.add_argument("--min-rating", type=int, default=None,
                        help="Only include keyphrases with rating >= this value")
    args = parser.parse_args()

    try:
        collection = get_chroma_collection()
    except Exception as e:
        logger.error(f"Could not connect to ChromaDB: {e}")
        sys.exit(1)

    total = collection.count()
    if total == 0:
        logger.warning("Collection is empty — nothing to export")
        sys.exit(0)

    logger.info(f"Collection '{COLLECTION_NAME}' has {total} documents — fetching...")

    PAGE_SIZE = 500
    # ref -> accumulated data
    ref_data: dict = defaultdict(lambda: {"heRef": "", "phrases": [], "en_text": "", "he_text": ""})
    offset = 0
    while offset < total:
        results = collection.get(limit=PAGE_SIZE, offset=offset, include=["metadatas", "documents"])
        offset += PAGE_SIZE
        for meta, doc in zip(results["metadatas"], results["documents"]):
            ref = meta.get("ref", "")
            phrase = meta.get("phrase", doc)
            rating = meta.get("rating", "")

            if args.ref and ref != args.ref:
                continue
            if args.min_rating is not None:
                try:
                    if float(rating) < args.min_rating:
                        continue
                except (TypeError, ValueError):
                    pass

            entry = ref_data[ref]
            entry["heRef"] = meta.get("heRef", "")
            entry["en_text"] = meta.get("en_text", "")
            entry["he_text"] = meta.get("he_text", "")
            entry["phrases"].append(phrase)

    if not ref_data:
        logger.warning("No rows matched the filters")
        sys.exit(0)

    rows = [
        {
            "ref": ref,
            "heRef": data["heRef"],
            "phrases": ", ".join(data["phrases"]),
            "en_text": data["en_text"],
            "he_text": data["he_text"],
        }
        for ref, data in sorted(ref_data.items())
    ]

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["ref", "heRef", "phrases", "en_text", "he_text"])
        writer.writeheader()
        writer.writerows(rows)

    logger.info(f"Exported {len(rows)} refs to {args.output}")


if __name__ == "__main__":
    main()
