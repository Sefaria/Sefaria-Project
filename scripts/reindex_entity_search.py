#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
On-demand full reindex of the entity-search indices (`topic` and/or `book`).

These indices power /api/entity-search (the Topics / Authors / Books tabs). The
weekly Elasticsearch cron rebuilds them alongside `text`/`sheet`; this script runs
the same rebuild on demand for one or both entity types.

Each index is rebuilt with the same blue-green (a/b) swap as the cron, so search
stays available on the old data during the rebuild, with zero downtime.

Usage:
    python scripts/reindex_entity_search.py --type all      # topic + book (default)
    python scripts/reindex_entity_search.py --type topic    # topics + authors only
    python scripts/reindex_entity_search.py --type book     # books only
"""
import argparse
import os
import sys

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django
django.setup()

from sefaria.search import index_entities, setup_logging


def main():
    parser = argparse.ArgumentParser(description="On-demand entity-search reindex")
    parser.add_argument("--type", choices=["topic", "book", "all"], default="all",
                        help="Which entity index(es) to rebuild (default: all)")
    parser.add_argument("-d", "--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    setup_logging(args.debug)

    types = ("topic", "book") if args.type == "all" else (args.type,)
    elapsed = index_entities(types=types, debug=args.debug)
    print(f"Entity reindex complete for {types} in {elapsed}.")
    sys.exit(0)


if __name__ == "__main__":
    main()
