"""
./manage.py ensure_mongo_indexes [--check] [--collection NAME ...]

Creates the MongoDB indexes the code relies on (sefaria/system/database.py ensure_indices), which nothing at startup, in the
Helm chart or in a cron creates. Run it on any database built another way, e.g. a cauldron restored from a dump: a query that
hints an index (sefaria/sheets.py and sefaria/model/webpage.py hint "expandedRefs_1") fails with a 500 where it is missing.

--check     list the missing indexes and exit 1 if there are any; create nothing.
--collection  only these collections (repeatable).

Creating is idempotent. On a large collection an index build takes a while and some load; prefer --check first in production.
"""

import sys

from django.core.management.base import BaseCommand

from sefaria.system import database


def _describe(col, args, kwargs):
    return f"{col}: {database._index_key(args)}{' ' + str(kwargs) if kwargs else ''}"


class Command(BaseCommand):
    help = "Create (or, with --check, list) the MongoDB indexes the code relies on that this database lacks."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="list the missing indexes; create nothing")
        parser.add_argument(
            "--collection", action="append", dest="collections", help="only this collection (repeatable)"
        )

    def handle(self, *args, check=False, collections=None, **options):
        missing = database.missing_indices(collections=collections)
        for spec in missing:
            self.stdout.write(("missing " if check else "creating ") + _describe(*spec))
        if check:
            self.stdout.write(f"{len(missing)} missing")
            if missing:
                sys.exit(1)
            return
        database.create_indices(missing)
        still = database.missing_indices(collections=collections)
        for spec in still:
            self.stderr.write("could not create " + _describe(*spec))
        self.stdout.write(f"created {len(missing) - len(still)}, {len(still)} still missing")
        if still:
            sys.exit(1)
