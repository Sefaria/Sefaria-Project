"""
./manage.py ensure_mongo_indexes [--create] [--collection NAME ...]

Lists (default) or creates (--create) the MongoDB indexes the code relies on (sefaria/system/database.py ensure_indices) that this
database lacks. Nothing at startup, in the Helm chart or in a cron creates them: run it on any database built another way, e.g.
a cauldron restored from a dump. A query that hints an index (sefaria/sheets.py and sefaria/model/webpage.py hint
"expandedRefs_1") fails with a 500 where it is missing.

(default)     list each missing index ("would create ...") and exit 1 if there are any; create nothing.
--create      create the missing ones (printing each first), then check again; exit 1 if any are still missing.
--collection  only these collections (repeatable).

Missing means no index with the same key; options (unique, sparse, ...) are not compared. Creating is idempotent. On a large
collection an index build takes a while and some load: run the default listing first, in production especially.
"""

import sys

from django.core.management.base import BaseCommand

from sefaria.system import database


def _describe(col, args, kwargs):
    return f"{col}: {database._index_key(args)}{' ' + str(kwargs) if kwargs else ''}"


class Command(BaseCommand):
    help = "List (or, with --create, create) the MongoDB indexes the code relies on that this database lacks."

    def add_arguments(self, parser):
        parser.add_argument(
            "--create", action="store_true", help="create the missing indexes (default: only list them)"
        )
        parser.add_argument(
            "--collection", action="append", dest="collections", help="only this collection (repeatable)"
        )

    def handle(self, *args, create=False, collections=None, **options):
        missing = database.missing_indices(collections=collections)
        for spec in missing:
            self.stdout.write(("creating " if create else "would create ") + _describe(*spec))
        if not create:
            self.stdout.write(f"{len(missing)} missing" + (" (run with --create to build them)" if missing else ""))
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
