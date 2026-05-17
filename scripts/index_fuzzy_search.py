"""
Build the ChromaDB index for semantic/fuzzy search.

Walks the Sefaria library and indexes text segments. Optionally filters by
category and limits total refs indexed.

Usage:
    python scripts/index_fuzzy_search.py --limit 100
    python scripts/index_fuzzy_search.py --limit 500 --category Tanakh
    python scripts/index_fuzzy_search.py --passages --limit 200
"""

import argparse
import logging
import os
import sys

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from sefaria.model import *
from sefaria.helper.fuzzy_search_indexer import COLLECTION_NAME, index_refs, get_chroma_collection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def collect_text_refs(category: str = None, limit: int = None) -> list:
    """Walk the library and collect segment-level refs."""
    refs = []

    if category:
        indices = library.get_indexes_in_category(category, full_records=True)
    else:
        indices = library.all_index_records()

    for index in indices:
        if limit and len(refs) >= limit:
            break
        try:
            all_refs = index.all_segment_refs()
            for ref in all_refs:
                refs.append(ref.normal())
                if limit and len(refs) >= limit:
                    break
        except Exception as e:
            logger.warning(f"Skipping index {index.title}: {e}")

    return refs


def collect_passage_refs(category: str = None, limit: int = None) -> list:
    """Collect refs from the Passage collection (sugyot)."""
    refs = []
    query = {}
    passages = PassageSet(query)
    for passage in passages:
        if limit and len(refs) >= limit:
            break
        try:
            oref = passage.ref()
            if category and category not in oref.index.categories:
                continue
            refs.append(oref.normal())
        except Exception as e:
            logger.warning(f"Skipping passage {passage.full_ref}: {e}")
    return refs


def main():
    parser = argparse.ArgumentParser(description="Index Sefaria texts into ChromaDB for fuzzy search")
    parser.add_argument("--limit", type=int, default=100,
                        help="Max number of refs to index (default: 100)")
    parser.add_argument("--category", default=None,
                        help="Restrict to a category, e.g. Tanakh, Talmud")
    parser.add_argument("--passages", action="store_true",
                        help="Index Passages (sugyot) instead of individual segments")
    parser.add_argument("--batch-size", type=int, default=50,
                        help="Refs per batch (default: 50)")
    parser.add_argument("--workers", type=int, default=4,
                        help="Parallel workers per batch (default: 4)")
    parser.add_argument("--reset", action="store_true",
                        help="Delete and recreate the ChromaDB collection before indexing")
    args = parser.parse_args()

    if args.reset:
        import chromadb
        from django.conf import settings
        client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
        client.delete_collection(COLLECTION_NAME)
        logger.info(f"Deleted ChromaDB collection '{COLLECTION_NAME}'")

    logger.info(f"Collecting refs (limit={args.limit}, category={args.category}, passages={args.passages})")

    if args.passages:
        refs = collect_passage_refs(category=args.category, limit=args.limit)
    else:
        refs = collect_text_refs(category=args.category, limit=args.limit)

    logger.info(f"Collected {len(refs)} refs to index")
    if not refs:
        logger.warning("No refs found — check your --category argument")
        sys.exit(0)

    total = index_refs(refs, batch_size=args.batch_size, max_workers=args.workers)
    logger.info(f"Done. Total keyphrases indexed: {total}")


if __name__ == "__main__":
    main()
