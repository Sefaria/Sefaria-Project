# -*- coding: utf-8 -*-
"""
Roll back the Library Assistant opt-out flip.

Unsets `settings.library_assistant` on the profiles that
`migrate_experiments_to_library_assistant.py` wrote — and only where the stored value is
still the one the migration wrote. A user who changed the setting themselves after the
flip has expressed a real preference; that survives the rollback untouched.

Everyone unset falls back to the pre-migration rule (on the experiments whitelist AND
`profile.experiments` true), which is live code until the experiments framework is
removed. That removal ends the rollback window, and this script refuses to run once it has
happened rather than quietly turning the assistant off for everyone it touches.

Usage (`./run` sets PYTHONPATH and DJANGO_SETTINGS_MODULE; a bare `python` cannot import
sefaria):
    ./run scripts/migrations/rollback_library_assistant_migration.py --dry-run
    ./run scripts/migrations/rollback_library_assistant_migration.py
    ./run scripts/migrations/rollback_library_assistant_migration.py --run-id <run_id>
"""

import argparse

import django

django.setup()

from sefaria.system.database import db
from sefaria.helper import library_assistant
from sefaria.helper.library_assistant import SETTING_KEY

# Same directory as this script, which is sys.path[0] when it is run.
from migrate_experiments_to_library_assistant import (
    ARCHIVE_COLLECTION,
    SETTING_PATH,
    BATCH_SIZE,
)


def _archived_entries(run_id):
    query = {"run_id": run_id} if run_id else {}
    # `_id` ascending is insertion order and uses the default index, so the last entry
    # seen for a user is the most recent value written for them.
    return db[ARCHIVE_COLLECTION].find(query, {"uid": 1, "value": 1}).sort("_id", 1)


def _fallback_is_live():
    """
    Whether an unset profile still reads as its pre-flip value.

    Unsetting the key only returns a user to their old behavior while the legacy rule is
    there to fall back to. Once it is gone, absent reads as off, so this script would turn
    the assistant off for everyone it touched while reporting a clean success.
    """
    return hasattr(library_assistant, "_legacy_enabled")


def rollback(dry_run=False, run_id=None):
    if not _fallback_is_live():
        print(
            f"Refusing to run: the legacy fallback is gone, so unsetting {SETTING_KEY} "
            f"would turn the assistant off rather than restore what each user had.\n"
            f"Undoing the flip now means writing values, not removing them."
        )
        return

    # One entry per user. The archive holds an entry per profile per run, and a profile is
    # written twice whenever a flip is rolled back and run again; counting those separately
    # reports a rollback that worked as one that left every re-written profile untouched.
    latest = {entry["uid"]: bool(entry["value"]) for entry in _archived_entries(run_id)}

    by_value = {True: [], False: []}
    for uid, value in latest.items():
        by_value[value].append(uid)

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
            # Count users, not documents: a handful of ids own more than one profile
            # document, which would otherwise make `kept` negative and overstate `unset`.
            matching = len(db.profiles.distinct("id", unchanged))
            kept += len(batch) - matching
            if not dry_run:
                db.profiles.update_many(unchanged, {"$unset": {SETTING_PATH: ""}})
            unset += matching

    print(f"{SETTING_KEY} unset on {unset} users" + (" (dry run)" if dry_run else ""))
    print(f"left alone (user changed it after the migration, or profile gone): {kept}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Undo the library_assistant backfill.")
    parser.add_argument("--dry-run", action="store_true", help="report counts without writing")
    parser.add_argument("--run-id", help="roll back a single migration run (default: every archived run)")
    args = parser.parse_args()
    rollback(dry_run=args.dry_run, run_id=args.run_id)
