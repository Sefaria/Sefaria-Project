#!/usr/bin/env python
"""
Populate local Elasticsearch topic and book indices with a broad sample
from the database — all authors, all books, and all (or a limited number of)
topics, across all languages.

The existing sindex_rashi_rambam.py only indexes 2 authors and their books.
This script indexes the full corpus so Topics / Authors / Books search tabs
work across everything Sefaria has.

Topics are sorted by numSources descending before indexing, so if you apply
--topics-limit the most referenced topics are indexed first.

Usage:
    PYTHONPATH=. python scripts/populate_sample_entities.py --force
    PYTHONPATH=. python scripts/populate_sample_entities.py --force --topics-limit 2000
"""

import argparse
import os
import sys
from urllib.parse import urlparse

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
import django
django.setup()

from elasticsearch.helpers import bulk as es_bulk

from sefaria.model import library
from sefaria.model.topic import TopicSet, AuthorTopic
from sefaria.search import (
    create_index,
    clear_index,
    make_topic_doc,
    make_book_doc,
    es_client,
    SEARCH_INDEX_NAME_TOPIC,
    SEARCH_INDEX_NAME_BOOK,
)

SEARCH_URL = os.getenv("SEARCH_URL", "http://localhost:9200")


def is_local_url(url):
    parsed = urlparse(url)
    return parsed.hostname in {"localhost", "127.0.0.1", "::1"}


def build_fresh_index(name, index_type):
    """Drop any existing index variants (-a, -b, bare) then create fresh."""
    for suffix in ["-a", "-b", ""]:
        clear_index(name + suffix)
    create_index(name, index_type, force=True)


def index_topics(topics_limit=None, chunk_size=500):
    """
    Index all topics (including authors) sorted by numSources descending.
    Returns (indexed_count, failed_slugs).
    """
    all_topics = list(TopicSet())
    all_topics.sort(key=lambda t: getattr(t, "numSources", 0) or 0, reverse=True)

    if topics_limit:
        all_topics = all_topics[:topics_limit]

    total = len(all_topics)
    actions = []
    failed = []
    indexed = 0

    def flush(final=False):
        nonlocal indexed
        if not actions:
            return
        try:
            es_bulk(es_client, actions, chunk_size=chunk_size)
            indexed += len(actions)
        except Exception as e:
            print(f"    bulk error: {e}")
            failed.extend(a["_id"] for a in actions)
        actions.clear()

    for i, topic in enumerate(all_topics, 1):
        doc = make_topic_doc(topic)
        if doc is None:
            failed.append(getattr(topic, "slug", "?"))
            continue

        slug = getattr(topic, "slug", "") or ""
        if len(slug.encode()) > 512:
            failed.append(slug)
            continue

        actions.append({
            "_index": SEARCH_INDEX_NAME_TOPIC,
            "_id": topic.slug,
            "_source": doc,
        })

        if len(actions) >= chunk_size:
            flush()

        if i % 500 == 0 or i == total:
            print(f"  topics: {i}/{total} processed, {indexed} indexed so far")

    flush()
    return indexed, failed


def index_books(books_limit=None, chunk_size=500):
    """
    Index all book (Index) records. Returns (indexed_count, failed_titles).
    """
    all_books = list(library.all_index_records())
    if books_limit:
        all_books = all_books[:books_limit]

    total = len(all_books)
    actions = []
    failed = []
    indexed = 0

    def flush():
        nonlocal indexed
        if not actions:
            return
        try:
            es_bulk(es_client, actions, chunk_size=chunk_size)
            indexed += len(actions)
        except Exception as e:
            print(f"    bulk error: {e}")
            failed.extend(a["_id"] for a in actions)
        actions.clear()

    for i, book in enumerate(all_books, 1):
        doc = make_book_doc(book)
        if doc is None:
            failed.append(getattr(book, "title", "?"))
            continue

        actions.append({
            "_index": SEARCH_INDEX_NAME_BOOK,
            "_id": book.title,
            "_source": doc,
        })

        if len(actions) >= chunk_size:
            flush()

        if i % 500 == 0 or i == total:
            print(f"  books: {i}/{total} processed, {indexed} indexed so far")

    flush()
    return indexed, failed


def main():
    parser = argparse.ArgumentParser(
        description="Populate local ES topic and book indices from the full DB."
    )
    parser.add_argument("--force", action="store_true",
                        help="Recreate indices even if they already exist.")
    parser.add_argument("--allow-nonlocal", action="store_true",
                        help="Allow writing to a non-localhost ES instance.")
    parser.add_argument("--topics-limit", type=int, default=None,
                        help="Cap on number of topics to index (default: all). "
                             "Topics are sorted by numSources descending so the "
                             "most referenced ones are indexed first.")
    parser.add_argument("--books-limit", type=int, default=None,
                        help="Cap on number of books to index (default: all).")
    parser.add_argument("--chunk-size", type=int, default=500,
                        help="Docs per bulk request (default: 500).")
    args = parser.parse_args()

    if not args.allow_nonlocal and not is_local_url(SEARCH_URL):
        raise RuntimeError(f"Refusing to write to non-local ES: {SEARCH_URL}")

    if not es_client.ping():
        raise RuntimeError(f"Could not connect to Elasticsearch at {SEARCH_URL}")

    # --- topics + authors ---
    print(f"Building fresh topic index ({SEARCH_INDEX_NAME_TOPIC})…")
    build_fresh_index(SEARCH_INDEX_NAME_TOPIC, "topic")

    topic_count, topic_failed = index_topics(
        topics_limit=args.topics_limit,
        chunk_size=args.chunk_size,
    )
    limit_note = f" (limit: {args.topics_limit})" if args.topics_limit else ""
    print(f"Topics done: {topic_count} indexed{limit_note}.")
    if topic_failed:
        print(f"  Failed slugs ({len(topic_failed)}): {topic_failed[:10]}")

    # --- books ---
    print(f"\nBuilding fresh book index ({SEARCH_INDEX_NAME_BOOK})…")
    build_fresh_index(SEARCH_INDEX_NAME_BOOK, "book")

    book_count, book_failed = index_books(
        books_limit=args.books_limit,
        chunk_size=args.chunk_size,
    )
    limit_note = f" (limit: {args.books_limit})" if args.books_limit else ""
    print(f"Books done: {book_count} indexed{limit_note}.")
    if book_failed:
        print(f"  Failed titles ({len(book_failed)}): {book_failed[:10]}")

    print(f"\nDone. topic={topic_count}, book={book_count}")
    print(f"Try: curl 'http://localhost:9200/{SEARCH_INDEX_NAME_TOPIC}/_search?q=prayer&pretty'")


if __name__ == "__main__":
    main()
