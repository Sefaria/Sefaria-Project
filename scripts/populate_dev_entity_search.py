#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Minimally populate the `topic`, `book` and `category` entity-search indices in a DEV
environment.

Unlike the full reindex (scripts/reindex_entity_search.py), this builds each index
directly under its alias name (no a/b blue-green swap) and indexes only a small
sample, so /api/entity-search returns results locally without waiting on a full
multi-thousand-document rebuild.

`--limit` does not apply to categories: the whole set is only ~376 documents, and a
partial one would make category resolution silently miss queries.

Prereq: `SEARCH_INDEX_NAME_TOPIC`, `SEARCH_INDEX_NAME_BOOK` and
`SEARCH_INDEX_NAME_CATEGORY` must be defined in sefaria/local_settings.py (see
docs/arch_docs/search_improvements_arch.md).

Usage:
    python scripts/populate_dev_entity_search.py                 # 200 of each + all categories
    python scripts/populate_dev_entity_search.py --limit 500
    python scripts/populate_dev_entity_search.py --type book --limit 100
    python scripts/populate_dev_entity_search.py --type category
    python scripts/populate_dev_entity_search.py --limit 0       # 0 = all (full local build)
"""
import argparse
import logging
import os
import sys

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django
django.setup()

from elasticsearch.helpers import bulk

from sefaria.model import TopicSet, IndexSet
from sefaria.search import (
    create_index,
    index_categories,
    library_topic_slugs,
    make_topic_index_document,
    make_book_index_document,
    _indexer_es_client,
    setup_logging,
)
from sefaria.settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK, SEARCH_INDEX_NAME_CATEGORY

logger = logging.getLogger(__name__)


def _populate_topics(limit):
    create_index(SEARCH_INDEX_NAME_TOPIC, 'topic', force=True)
    actions, skipped = [], 0
    # Restrict to the `library` TopicPool before applying `limit`, matching the full
    # indexer — otherwise the sample would be mostly uncurated topics that the real
    # index excludes.
    for topic in TopicSet({"slug": {"$in": library_topic_slugs()}}, limit=limit):
        doc = make_topic_index_document(topic)
        if doc is None:
            skipped += 1
            continue
        actions.append({"_index": SEARCH_INDEX_NAME_TOPIC, "_id": doc['slug'], "_source": doc})
    succeeded, errors = bulk(_indexer_es_client, actions, raise_on_error=False)
    logger.info(f"dev topics: indexed {succeeded}, skipped {skipped}, errors {len(errors)}")


def _populate_books(limit):
    create_index(SEARCH_INDEX_NAME_BOOK, 'book', force=True)
    actions, skipped, cache = [], 0, {}
    for index in IndexSet(limit=limit):
        try:
            doc = make_book_index_document(index, cache)
        except Exception as e:
            logger.warning(f"skip book '{getattr(index, 'title', '<unknown>')}': {e}")
            skipped += 1
            continue
        if doc is None:
            skipped += 1
            continue
        actions.append({"_index": SEARCH_INDEX_NAME_BOOK, "_id": doc['title_en'], "_source": doc})
    succeeded, errors = bulk(_indexer_es_client, actions, raise_on_error=False)
    logger.info(f"dev books: indexed {succeeded}, skipped {skipped}, errors {len(errors)}")


def _populate_categories():
    # No limit: the main-category set is small enough to index whole, and the real
    # indexer is cheap enough to reuse directly rather than sampling.
    create_index(SEARCH_INDEX_NAME_CATEGORY, 'category', force=True)
    result = index_categories(SEARCH_INDEX_NAME_CATEGORY)
    logger.info(f"dev categories: indexed {result['succeeded']}, "
                f"skipped {len(result['skipped'])}, errors {len(result['errors'])}")


def main():
    parser = argparse.ArgumentParser(description="Populate dev entity-search indices")
    parser.add_argument("--limit", type=int, default=200,
                        help="Max records to index per type (0 = all; ignored for categories)")
    parser.add_argument("--type", choices=["topic", "book", "category", "all"], default="all",
                        help="Which entity index(es) to populate (default: all)")
    args = parser.parse_args()

    setup_logging(False)

    if args.type in ("topic", "all"):
        _populate_topics(args.limit)
    if args.type in ("book", "all"):
        _populate_books(args.limit)
    if args.type in ("category", "all"):
        _populate_categories()


if __name__ == "__main__":
    main()
