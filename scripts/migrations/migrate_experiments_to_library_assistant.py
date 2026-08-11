# -*- coding: utf-8 -*-
"""
Switch the Library Assistant from opt-in to opt-out.

Running this script IS the launch. A profile with no `settings.library_assistant` key
reads as off in `sefaria.helper.library_assistant`; this script gives every profile an
explicit value, so the assistant is on unless the user turned it off.

Cohorts come from **Postgres**, not from Mongo:

  * a `UserExperimentSettings` row is the only record of a deliberate choice — the
    experiments enrollment paths wrote one for every user who made one. Those users
    inherit `row.experiments`, so anyone who deliberately turned the assistant off
    stays off.
  * every other profile is backfilled to True.

`profiles.experiments` is NOT a signal: `UserProfile` defaults it to False and serializes
it on every save, so users who never enrolled in anything carry `experiments: False` en
masse. Keying on that field would read them all as deliberate opt-outs.

Profiles that already carry the setting are never touched, so the script is idempotent
and safe to re-run as a catch-up for any profile that turns up without the key. It never
writes `profiles.experiments` and never touches the Postgres table.

Every write is archived to `db.library_assistant_migration_archive` (user id, value
written, cohort, run id) — the historical record of what this migration changed.

Usage (`./run` sets PYTHONPATH and DJANGO_SETTINGS_MODULE; a bare `python` cannot import
sefaria):
    ./run scripts/migrations/migrate_experiments_to_library_assistant.py --dry-run
    ./run scripts/migrations/migrate_experiments_to_library_assistant.py
"""

import argparse
import uuid
from datetime import datetime, timezone

import django

django.setup()

from sefaria.system.database import db
from sefaria.helper.library_assistant import SETTING_KEY
from reader.models import UserExperimentSettings

ARCHIVE_COLLECTION = "library_assistant_migration_archive"

SETTING_PATH = f"settings.{SETTING_KEY}"
COHORT_ROW = "whitelist_row"
COHORT_BACKFILL = "backfill"

BATCH_SIZE = 1000


def _unmigrated(extra=None):
    query = {SETTING_PATH: {"$exists": False}}
    if extra:
        query.update(extra)
    return query


def _archive(run_id, entries):
    if entries:
        db[ARCHIVE_COLLECTION].insert_many(entries)


def _write(user_ids, value, cohort, run_id):
    """Set the setting for `user_ids`, archiving what was written. Returns the count."""
    written = 0
    for start in range(0, len(user_ids), BATCH_SIZE):
        batch = user_ids[start:start + BATCH_SIZE]
        # Re-read rather than trusting the scan, so the archive records exactly the
        # profiles this run changed and nothing else.
        # Deduplicated: a handful of ids own more than one profile document, and the count
        # and the archive are both per user.
        pending = list({p["id"] for p in db.profiles.find(_unmigrated({"id": {"$in": batch}}), {"id": 1})})
        if not pending:
            continue
        # Archive before writing. A crash between the two leaves an archive entry for a
        # profile that never received the setting — an over-record, visible by comparing
        # the entry against the profile. Writing first would instead leave written
        # profiles with no archive entry at all, and the record would under-report what
        # the run changed with no way to tell which profiles were missed.
        _archive(run_id, [
            {
                "run_id": run_id,
                "uid": uid,
                "value": value,
                "cohort": cohort,
                "written_at": datetime.now(timezone.utc),
            }
            for uid in pending
        ])
        db.profiles.update_many(
            _unmigrated({"id": {"$in": pending}}),
            {"$set": {SETTING_PATH: value}},
        )
        written += len(pending)
    return written


def migrate(dry_run=False):
    run_id = uuid.uuid4().hex

    rows = list(UserExperimentSettings.objects.values_list("user_id", "experiments"))
    row_on = [uid for uid, experiments in rows if experiments]
    row_off = [uid for uid, experiments in rows if not experiments]
    enrolled = {uid for uid, _ in rows}

    # Deduplicated: a handful of ids own more than one profile document, and every cohort
    # count below is per user.
    unmigrated = {p["id"] for p in db.profiles.find(_unmigrated(), {"id": 1})}
    backfill = [uid for uid in unmigrated if uid not in enrolled]
    # Restrict the whitelist cohorts to profiles that actually need writing, so the
    # printed counts match what a real run would do.
    row_on = [uid for uid in row_on if uid in unmigrated]
    row_off = [uid for uid in row_off if uid in unmigrated]

    print(f"whitelist row, experiments=True  -> {SETTING_KEY}=True :  {len(row_on)}")
    print(f"whitelist row, experiments=False -> {SETTING_KEY}=False:  {len(row_off)}")
    print(f"no whitelist row (never chose)   -> {SETTING_KEY}=True :  {len(backfill)}")

    if dry_run:
        print("\n--dry-run: nothing written.")
        return

    print(f"\nrun_id: {run_id}")
    written = _write(row_on, True, COHORT_ROW, run_id)
    written += _write(row_off, False, COHORT_ROW, run_id)
    written += _write(backfill, True, COHORT_BACKFILL, run_id)

    # Distinct ids, not documents: this runs after a successful pass, when it should be 0
    # either way, but a partial run is exactly when the number is read and must mean users.
    remaining = len(db.profiles.distinct("id", _unmigrated()))
    print(f"Profiles written: {written}")
    print(f"Profiles still missing {SETTING_KEY}: {remaining}")
    print(f"Archived to db.{ARCHIVE_COLLECTION} under run_id {run_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill settings.library_assistant.")
    parser.add_argument("--dry-run", action="store_true", help="report cohort counts without writing")
    migrate(**vars(parser.parse_args()))
