# -*- coding: utf-8 -*-
"""
Wipe the retired experiments program's data. The framework code (model, admin tooling,
opt-in endpoint) stays, parked for a future experiment — only its data goes:

  * every Postgres `UserExperimentSettings` row is archived and deleted;
  * the Mongo `profiles.experiments` field is archived wherever it is True, then unset
    everywhere. False values are the serialized-on-save default, record nothing a user
    chose, and are not archived.

Every writer of the flag (`reader.models._set_user_experiments`) writes the row in the
same call, so a True profile normally has a row behind it; the run reports how many
diverge instead of assuming none do (deleting a Django account cascades the row away
and leaves the profile — the one known source).

The rows are the only record of a deliberate assistant choice, so before touching
anything the script backfills `settings.library_assistant` onto any profile still
missing it, per the opt-out launch's rules: a row's value wins, no row means True.
Registration writes the key for every new account, so this is normally a no-op. If any
profile still lacks the key after the backfill, the script aborts without deleting
anything.

Backfilled writes are archived to `db.library_assistant_migration_archive`, continuing
the launch migration's record; deleted rows and True-flagged profiles go to
`db.experiments_data_archive` (`source`: "row" or "profile"). A run names its target
databases before printing any count, and a real run ends by re-reading both stores and
printing PASS or WARN per check.

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

from django.conf import settings as django_settings

from sefaria.system.database import db
from sefaria.helper.library_assistant import SETTING_KEY
from reader.models import UserExperimentSettings

ARCHIVE_COLLECTION = "experiments_data_archive"
BACKFILL_ARCHIVE_COLLECTION = "library_assistant_migration_archive"

SETTING_PATH = f"settings.{SETTING_KEY}"
COHORT_ROW = "whitelist_row"
COHORT_BACKFILL = "backfill"
SOURCE_ROW = "row"
SOURCE_PROFILE = "profile"

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
        # Re-read rather than trusting the scan, so the archive records exactly what this
        # run changed. Deduplicated: a handful of ids own more than one profile document.
        pending = list({p["id"] for p in db.profiles.find(_unmigrated({"id": {"$in": batch}}), {"id": 1})})
        if not pending:
            continue
        # Archive before writing: a crash between the two over-records (an entry with no
        # write, visible by comparison); writing first would under-record, with no way to
        # tell which profiles were missed.
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


def _print_targets():
    """Name the databases every count below comes from."""
    # Printed, not asserted — the script runs against prod and local alike. A run pointed
    # at the wrong database prints numbers that look perfectly consistent.
    print(f"Mongo database:    {db.name}")
    print(f"Postgres database: {django_settings.DATABASES['default']['NAME']}\n")


def _report_divergence(rows, flagged_true):
    """Report True-flagged profiles with no row behind them. Informational, never blocks."""
    # Ids are compared as stored: some profile ids are strings and one is null, so
    # coercing either side to text would invent matches with the Postgres ints.
    row_uids = {uid for uid, _ in rows}
    orphaned = [uid for uid in flagged_true if uid not in row_uids]
    print(f"Profiles with experiments=True and no UserExperimentSettings row: {len(orphaned)}"
          f" (deleted accounts, expected near zero)")


def _archive(run_id, rows, flagged_true, wiped_at):
    """Record both stores' meaningful values. Returns the number of entries written."""
    entries = [
        {
            "run_id": run_id,
            "uid": uid,
            "experiments": experiments,
            "source": SOURCE_ROW,
            "wiped_at": wiped_at,
        }
        for uid, experiments in rows
    ]
    entries += [
        {
            "run_id": run_id,
            "uid": uid,
            "experiments": True,
            "source": SOURCE_PROFILE,
            "wiped_at": wiped_at,
        }
        for uid in flagged_true
    ]
    if entries:
        db[ARCHIVE_COLLECTION].insert_many(entries)
    return len(entries)


def _verify(run_id, archived):
    """Re-read both stores and report on the state the run left behind."""
    # Independent re-reads, never the run's own counters — what the script believed it
    # did is the thing under test.
    print("\nVerification:")

    rows_left = UserExperimentSettings.objects.count()
    if rows_left:
        print(f"WARN: {rows_left} UserExperimentSettings rows remain — a row landed mid-run;"
              f" it is left in place unarchived. Re-run the script to archive and delete it.")
    else:
        print("PASS: no UserExperimentSettings rows remain.")

    unmigrated = len(db.profiles.distinct("id", _unmigrated()))
    if unmigrated:
        print(f"WARN: {unmigrated} profiles have no {SETTING_KEY} key. Do not blindly re-run:"
              f" with the rows gone the backfill writes True. Check"
              f" db.{BACKFILL_ARCHIVE_COLLECTION} for the user's archived value first.")
    else:
        print(f"PASS: every profile has a {SETTING_KEY} key.")

    # In-flight saves can re-add the field, and later saves re-serialize it as the False
    # default. Harmless either way — nothing reads it.
    flagged_docs = db.profiles.count_documents({"experiments": {"$exists": True}})
    if flagged_docs:
        print(f"WARN: {flagged_docs} profile documents still carry an `experiments` field.")
    else:
        print("PASS: no profile documents carry an `experiments` field.")

    entries = db[ARCHIVE_COLLECTION].count_documents({"run_id": run_id})
    if entries == archived:
        print(f"PASS: {entries} archive entries under this run_id, matching what was archived.")
    else:
        print(f"WARN: {entries} archive entries under this run_id, but the run archived {archived}.")


def wipe(dry_run=False):
    run_id = uuid.uuid4().hex
    _print_targets()
    if not dry_run:
        print(f"run_id: {run_id}\n")

    rows = list(UserExperimentSettings.objects.values_list("user_id", "experiments"))

    _backfill(rows, run_id, dry_run)

    if not dry_run:
        # Hard stop: deleting the rows while a profile still lacks the key would lose the
        # only record of a deliberate choice. Distinct ids — the count must mean users.
        remaining = len(db.profiles.distinct("id", _unmigrated()))
        if remaining:
            print(f"ABORT: {remaining} profiles still have no {SETTING_KEY} key after"
                  f" the backfill. Nothing archived or deleted.")
            return

    # Distinct ids, because the archive is per user; documents, because the unset is per
    # document and a handful of ids own more than one profile document.
    flagged_true = db.profiles.distinct("id", {"experiments": True})
    flagged_docs = db.profiles.count_documents({"experiments": {"$exists": True}})

    _report_divergence(rows, flagged_true)

    print(f"UserExperimentSettings rows to archive and delete: {len(rows)}"
          f" (experiments=True: {sum(1 for _, e in rows if e)},"
          f" experiments=False: {sum(1 for _, e in rows if not e)})")
    print(f"Profiles with experiments=True to archive: {len(flagged_true)}")
    print(f"Mongo profile documents carrying an `experiments` field to unset: {flagged_docs}")

    if dry_run:
        print("\n--dry-run: nothing written.")
        return

    # Both stores are archived before either is touched, so a crash mid-run can only
    # over-record.
    archived = _archive(run_id, rows, flagged_true, datetime.now(timezone.utc))

    # Delete exactly what was archived: a row created since the read above would
    # otherwise go unarchived. Left in place, a re-run archives and deletes it.
    uids = [uid for uid, _ in rows]
    deleted = 0
    for start in range(0, len(uids), BATCH_SIZE):
        batch = uids[start:start + BATCH_SIZE]
        deleted += UserExperimentSettings.objects.filter(user_id__in=batch).delete()[0]
    unset = db.profiles.update_many(
        {"experiments": {"$exists": True}},
        {"$unset": {"experiments": ""}},
    ).modified_count

    print(f"Archived to db.{ARCHIVE_COLLECTION} under run_id {run_id}: {archived}"
          f" ({len(rows)} rows, {len(flagged_true)} profiles)")
    print(f"Postgres rows deleted: {deleted}")
    print(f"Mongo profile documents unset: {unset}")

    _verify(run_id, archived)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Archive and delete the experiments program's data.")
    parser.add_argument("--dry-run", action="store_true", help="report counts without writing")
    wipe(**vars(parser.parse_args()))
