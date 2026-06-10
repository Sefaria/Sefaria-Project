# encoding=utf-8
"""
Index ONLY the topics and books related to Rashi and Rambam into Elasticsearch.

This is a small dev subset for working on entity search without reindexing all
~34k topics and ~6.5k books. It builds fresh `topic` and `book` indices containing:
  - the Rashi and Rambam author topics themselves (topic index)
  - every book (Index) they authored (book index)

Authored books are found via the Index `authors` field (AuthorTopic.get_authored_indexes()),
which is authoritative - more reliable than matching title prefixes like "Rashi on..."
or "Mishneh Torah on...".

Usage:
    python scripts/sindex_rashi_rambam.py
"""
import django

django.setup()
from sefaria.model import Topic, AuthorTopic
from sefaria.search import (
    create_index,
    clear_index,
    make_topic_doc,
    make_book_doc,
    es_client,
    SEARCH_INDEX_NAME_TOPIC,
    SEARCH_INDEX_NAME_BOOK,
)

AUTHOR_SLUGS = ['rashi', 'rambam']


def build_fresh_index(base_name, type):
    """Drop any existing index for this type (including blue-green -a/-b variants and
    the alias) from prior runs, then create a fresh one with the right mapping."""
    for suffix in ['-a', '-b', '']:  # delete -a/-b first so the alias is gone before we clear the literal name
        clear_index(base_name + suffix)
    create_index(base_name, type, force=True)


def main():
    build_fresh_index(SEARCH_INDEX_NAME_TOPIC, 'topic')
    build_fresh_index(SEARCH_INDEX_NAME_BOOK, 'book')

    authors = []
    for slug in AUTHOR_SLUGS:
        topic = Topic.init(slug)
        if not isinstance(topic, AuthorTopic):
            print(f"WARNING: slug {slug!r} is not an AuthorTopic (found={topic is not None}) - skipping")
            continue
        authors.append(topic)

    # --- author topics ---
    topic_count = 0
    for author in authors:
        doc = make_topic_doc(author)
        if doc is None:
            print(f"WARNING: could not build topic doc for {author.slug!r}")
            continue
        es_client.create(index=SEARCH_INDEX_NAME_TOPIC, id=author.slug, body=doc)
        topic_count += 1
    print(f"Indexed {topic_count} author topics into '{SEARCH_INDEX_NAME_TOPIC}'.")

    # --- their books ---
    book_count = 0
    failed = []
    for author in authors:
        books = author.get_authored_indexes()
        print(f"  {author.slug}: {len(books)} authored books")
        for book in books:
            try:
                doc = make_book_doc(book)
                if doc is None:
                    failed.append(book.title)
                    continue
                es_client.create(index=SEARCH_INDEX_NAME_BOOK, id=book.title, body=doc)
                book_count += 1
            except Exception as e:
                failed.append(book.title)
    print(f"Indexed {book_count} books into '{SEARCH_INDEX_NAME_BOOK}'."
          + (f" Failed: {len(failed)} {failed[:10]}" if failed else ""))


if __name__ == '__main__':
    main()
