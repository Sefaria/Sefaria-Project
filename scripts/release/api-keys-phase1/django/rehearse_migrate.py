"""Applies every pending migration one at a time and prints one JSON line per migration with its duration.

Run from the checkout whose migrations are rehearsed, with release_settings (see rehearse-migration.sh):
  python <this file>
"""

import json
import sys
import time

import django

django.setup()

from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402
from django.db.migrations.executor import MigrationExecutor  # noqa: E402


def main():
    executor = MigrationExecutor(connection)
    plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
    if not plan:
        print("no pending migrations", file=sys.stderr)
        return 0
    for migration, backwards in plan:
        if backwards:
            raise SystemExit(f"refusing: the plan unapplies {migration.app_label}.{migration.name}")
        start = time.monotonic()
        call_command("migrate", migration.app_label, migration.name, verbosity=0, interactive=False)
        seconds = time.monotonic() - start
        print(
            json.dumps({"app": migration.app_label, "name": migration.name, "seconds": round(seconds, 3)}), flush=True
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
