# -*- coding: utf-8 -*-
"""
Wipe the retired experiments program's data, keeping the framework code.

The experiments framework (model, admin tooling, opt-in endpoint) stays in the codebase,
parked for a future experiment — but the data it accumulated for the Library Assistant
rollout is not retained. This script clears both stores:

  * every Postgres `UserExperimentSettings` row is archived and deleted;
  * the Mongo `profiles.experiments` field is unset everywhere. Its True values mirror
    the archived rows; everything else is the serialized-on-save False default.

The rows this script deletes are the only record of a deliberate assistant choice, so
before touching anything it backfills `settings.library_assistant` onto any profile
still missing it, using the opt-out launch's rules: a profile with a
`UserExperimentSettings` row inherits `row.experiments`, so anyone who deliberately
turned the assistant off stays off; every other profile gets True.
(`profiles.experiments` is NOT a signal: `UserProfile` defaults it to False and
serializes it on every save, so users who never enrolled in anything carry
`experiments: False` en masse.) Registration writes the key for every new account, so
the backfill is normally a no-op. If any profile still lacks the key after the
backfill, the script aborts before deleting anything.

Backfilled writes are archived to `db.library_assistant_migration_archive` (user id,
value written, cohort, run id), continuing the launch migration's record; every deleted
row is archived to `db.experiments_data_archive` (user id, experiments value, run id).
Together these preserve the full pre-wipe record.

Usage (`./run` sets PYTHONPATH and DJANGO_SETTINGS_MODULE; a bare `python` cannot import
sefaria):
    ./run scripts/migrations/wipe_experiments_data.py --dry-run
    ./run scripts/migrations/wipe_experiments_data.py
"""

import argparse
import uuid
from datetime import datetime, timezone

import django

django.setup()

from sefaria.system.database import db
from sefaria.helper.library_assistant import SETTING_KEY
from reader.models import UserExperimentSettings

ARCHIVE_COLLECTION = "experiments_data_archive"
BACKFILL_ARCHIVE_COLLECTION = "library_assistant_migration_archive"

SETTING_PATH = f"settings.{SETTING_KEY}"
COHORT_ROW = "whitelist_row"
COHORT_BACKFILL = "backfill"

BATCH_SIZE = 1000


def _unmigrated(extra=None):
    query = {SETTING_PATH: {"$exists": False}}
    if extra:
        query.update(extra)
    return query


def _archive_backfill(run_id, entries):
    if entries:
        db[BACKFILL_ARCHIVE_COLLECTION].insert_many(entries)


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
        _archive_backfill(run_id, [
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


def _backfill(rows, run_id, dry_run):
    """Give every profile missing the setting an explicit value, per the launch rules."""
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

    print(f"Profiles to backfill with {SETTING_KEY} before wiping:")
    print(f"  whitelist row, experiments=True  -> {SETTING_KEY}=True :  {len(row_on)}")
    print(f"  whitelist row, experiments=False -> {SETTING_KEY}=False:  {len(row_off)}")
    print(f"  no whitelist row (never chose)   -> {SETTING_KEY}=True :  {len(backfill)}")

    if dry_run:
        return

    written = _write(row_on, True, COHORT_ROW, run_id)
    written += _write(row_off, False, COHORT_ROW, run_id)
    written += _write(backfill, True, COHORT_BACKFILL, run_id)
    if written:
        print(f"Profiles backfilled (archived to db.{BACKFILL_ARCHIVE_COLLECTION}): {written}")


def wipe(dry_run=False):
    run_id = uuid.uuid4().hex
    if not dry_run:
        print(f"run_id: {run_id}\n")

    rows = list(UserExperimentSettings.objects.values_list("user_id", "experiments"))

    _backfill(rows, run_id, dry_run)

    if not dry_run:
        # Hard stop, not a warning: the rows below are the only record of a deliberate
        # choice, and deleting them while a profile still lacks the key would lose it.
        # Distinct ids, not documents: the abort message must count users.
        remaining = len(db.profiles.distinct("id", _unmigrated()))
        if remaining:
            print(f"ABORT: {remaining} profiles still have no {SETTING_KEY} key after"
                  f" the backfill. Nothing archived or deleted.")
            return

    flagged = db.profiles.count_documents({"experiments": {"$exists": True}})

    print(f"UserExperimentSettings rows to archive and delete: {len(rows)}"
          f" (experiments=True: {sum(1 for _, e in rows if e)},"
          f" experiments=False: {sum(1 for _, e in rows if not e)})")
    print(f"Mongo profiles carrying an `experiments` field to unset: {flagged}")

    if dry_run:
        print("\n--dry-run: nothing written.")
        return

    if rows:
        db[ARCHIVE_COLLECTION].insert_many([
            {
                "run_id": run_id,
                "uid": uid,
                "experiments": experiments,
                "wiped_at": datetime.now(timezone.utc),
            }
            for uid, experiments in rows
        ])
    # Delete exactly what was archived, not everything present at this instant: a row
    # created between the read above and here would otherwise be deleted unarchived.
    # Left in place it survives for a re-run, which archives and deletes it in turn.
    uids = [uid for uid, _ in rows]
    deleted = 0
    for start in range(0, len(uids), BATCH_SIZE):
        batch = uids[start:start + BATCH_SIZE]
        deleted += UserExperimentSettings.objects.filter(user_id__in=batch).delete()[0]
    unset = db.profiles.update_many(
        {"experiments": {"$exists": True}},
        {"$unset": {"experiments": ""}},
    ).modified_count

    print(f"Rows archived to db.{ARCHIVE_COLLECTION} under run_id {run_id}: {len(rows)}")
    print(f"Postgres rows deleted: {deleted}")
    print(f"Mongo profiles unset: {unset}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Archive and delete the experiments program's data.")
    parser.add_argument("--dry-run", action="store_true", help="report counts without writing")
    wipe(**vars(parser.parse_args()))
