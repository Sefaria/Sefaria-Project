# -*- coding: utf-8 -*-
"""
Roll back the Library Assistant opt-out flip.

Unsets `settings.library_assistant` on the profiles that
`migrate_experiments_to_library_assistant.py` wrote — and only where the stored value is
still the one the migration wrote. A user who changed the setting themselves after the
flip has expressed a real preference; that survives the rollback untouched.

Everyone unset falls back to the pre-migration rule (on the experiments whitelist AND
`profile.experiments` true), which is live code until the experiments framework is
removed. That removal ends the rollback window.

Usage:
    python scripts/migrations/rollback_library_assistant_migration.py --dry-run
    python scripts/migrations/rollback_library_assistant_migration.py
    python scripts/migrations/rollback_library_assistant_migration.py --run-id <run_id>
"""

import argparse

import django

django.setup()

from sefaria.system.database import db
from sefaria.helper.library_assistant import SETTING_KEY

# Same directory as this script, which is sys.path[0] when it is run.
from migrate_experiments_to_library_assistant import (
    ARCHIVE_COLLECTION,
    SETTING_PATH,
    BATCH_SIZE,
)


def _archived_entries(run_id):
    query = {"run_id": run_id} if run_id else {}
    return db[ARCHIVE_COLLECTION].find(query, {"uid": 1, "value": 1})


def rollback(dry_run=False, run_id=None):
    by_value = {True: [], False: []}
    for entry in _archived_entries(run_id):
        by_value[bool(entry["value"])].append(entry["uid"])

    if not by_value[True] and not by_value[False]:
        scope = f"run_id {run_id}" if run_id else "any run"
        print(f"Nothing archived for {scope} — nothing to roll back.")
        return

    unset = 0
    kept = 0
    for value, uids in by_value.items():
        for start in range(0, len(uids), BATCH_SIZE):
            batch = uids[start:start + BATCH_SIZE]
            # Only where the stored value still matches what the migration wrote.
            unchanged = {"id": {"$in": batch}, SETTING_PATH: value}
            matching = db.profiles.count_documents(unchanged)
            kept += len(batch) - matching
            if dry_run:
                unset += matching
                continue
            unset += db.profiles.update_many(unchanged, {"$unset": {SETTING_PATH: ""}}).modified_count

    print(f"{SETTING_KEY} unset on {unset} profiles" + (" (dry run)" if dry_run else ""))
    print(f"left alone (user changed it after the migration, or profile gone): {kept}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Undo the library_assistant backfill.")
    parser.add_argument("--dry-run", action="store_true", help="report counts without writing")
    parser.add_argument("--run-id", help="roll back a single migration run (default: every archived run)")
    args = parser.parse_args()
    rollback(dry_run=args.dry_run, run_id=args.run_id)
