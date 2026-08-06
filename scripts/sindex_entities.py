# encoding=utf-8
"""
Manual reindex of the entity search indices (topics/authors and books).

Builds fresh Elasticsearch indices for topics (including authors) and Index (book)
records, using the same blue-green alias swap as the text/sheet reindex. Run on
demand - there is no cron/freshness mechanism for these types yet.

Usage:
    python scripts/sindex_entities.py            # reindex both topics and books
    python scripts/sindex_entities.py topic      # reindex only topics/authors
    python scripts/sindex_entities.py book       # reindex only books
"""
import sys
import django

django.setup()
from sefaria.search import index_all_of_type

types = sys.argv[1:] or ['topic', 'book']
for t in types:
    print(f"Reindexing '{t}'...")
    index_all_of_type(t)
    print(f"Done reindexing '{t}'.")
