# -*- coding: utf-8 -*-
"""
Wipe the retired experiments program's data, keeping the framework code.

The experiments framework (model, admin tooling, opt-in endpoint) stays in the codebase,
parked for a future experiment — but the data it accumulated for the Library Assistant
rollout is not retained. This script clears both stores:

  * every Postgres `UserExperimentSettings` row is archived and deleted;
  * the Mongo `profiles.experiments` field is unset everywhere. Its True values mirror
    the archived rows; everything else is the serialized-on-save False default.

Run it only AFTER `migrate_experiments_to_library_assistant.py` has given every profile
a `settings.library_assistant` key: the migration reads its cohorts from the very rows
this script deletes. The script refuses to run while any profile is missing the key
(override with --force).

Every deleted row is archived to `db.experiments_data_archive` (user id, experiments
value, run id) — alongside `db.library_assistant_migration_archive`, this preserves the
full pre-wipe record.

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

SETTING_PATH = f"settings.{SETTING_KEY}"


def wipe(dry_run=False, force=False):
    run_id = uuid.uuid4().hex

    unmigrated = db.profiles.count_documents({SETTING_PATH: {"$exists": False}})
    if unmigrated and not force:
        print(f"{'WARNING' if dry_run else 'ABORT'}: {unmigrated} profiles still have"
              f" no {SETTING_KEY} key.")
        print("Run migrate_experiments_to_library_assistant.py first — it reads its")
        print("cohorts from the rows this script deletes. (--force overrides.)")
        # A dry run writes nothing, so it goes on to report. Rehearsing the wipe on an
        # environment that has yet to be migrated is exactly when the counts are wanted.
        if not dry_run:
            return
        print()

    rows = list(UserExperimentSettings.objects.values_list("user_id", "experiments"))
    flagged = db.profiles.count_documents({"experiments": {"$exists": True}})

    print(f"UserExperimentSettings rows to archive and delete: {len(rows)}"
          f" (experiments=True: {sum(1 for _, e in rows if e)},"
          f" experiments=False: {sum(1 for _, e in rows if not e)})")
    print(f"Mongo profiles carrying an `experiments` field to unset: {flagged}")

    if dry_run:
        print("\n--dry-run: nothing written.")
        return

    print(f"\nrun_id: {run_id}")
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
    deleted, _ = UserExperimentSettings.objects.all().delete()
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
    parser.add_argument("--force", action="store_true", help="run even if profiles are missing the setting key")
    wipe(**vars(parser.parse_args()))
