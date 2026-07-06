#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Minimally populate the `topic` and `book` entity-search indices in a DEV environment.

Unlike the full reindex (scripts/reindex_entity_search.py), this builds each index
directly under its alias name (no a/b blue-green swap) and indexes only a small
sample, so /api/entity-search returns results locally without waiting on a full
multi-thousand-document rebuild.

Prereq: `SEARCH_INDEX_NAME_TOPIC` and `SEARCH_INDEX_NAME_BOOK` must be defined in
sefaria/local_settings.py (see docs/arch_docs/search_improvements_arch.md).

Usage:
    python scripts/populate_dev_entity_search.py                 # 200 of each
    python scripts/populate_dev_entity_search.py --limit 500
    python scripts/populate_dev_entity_search.py --type book --limit 100
    python scripts/populate_dev_entity_search.py --limit 0       # 0 = all (full local build)
"""
import argparse
import logging

import django
django.setup()

from elasticsearch.helpers import bulk

from sefaria.model import TopicSet, IndexSet
from sefaria.search import (
    create_index,
    make_topic_index_document,
    make_book_index_document,
    _indexer_es_client,
    setup_logging,
)
from sefaria.settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK

logger = logging.getLogger(__name__)


def _populate_topics(limit):
    create_index(SEARCH_INDEX_NAME_TOPIC, 'topic', force=True)
    actions, skipped = [], 0
    for topic in TopicSet(limit=limit):
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


def main():
    parser = argparse.ArgumentParser(description="Populate dev entity-search indices")
    parser.add_argument("--limit", type=int, default=200,
                        help="Max records to index per type (0 = all)")
    parser.add_argument("--type", choices=["topic", "book", "all"], default="all",
                        help="Which entity index(es) to populate (default: all)")
    args = parser.parse_args()

    setup_logging(False)

    if args.type in ("topic", "all"):
        _populate_topics(args.limit)
    if args.type in ("book", "all"):
        _populate_books(args.limit)


if __name__ == "__main__":
    main()
