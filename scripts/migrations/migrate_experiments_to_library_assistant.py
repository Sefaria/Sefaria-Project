# -*- coding: utf-8 -*-
"""
Graduate the Library Assistant out of the experiments program.

Until now a single field, `profiles.experiments`, meant two things at once: whether the
user was admitted to the experiments program, and whether they wanted the Library
Assistant. The assistant is now a permanent feature with its own plain user setting at
`profiles.settings.library_assistant`, leaving `experiments` free to mean only
"participates in the experiments program".

This script writes `settings.library_assistant` for every profile:

  * profiles carrying an `experiments` value inherit it — anyone who deliberately turned
    the assistant off stays off (sc-46171, criterion 1)
  * every other profile is backfilled to True, so existing account holders who never
    expressed a preference get the assistant without waiting to log in again
    (sc-46171, criterion 3)

Profiles that already carry `settings.library_assistant` are never touched, so the script
is idempotent and safe to re-run.

IMPORTANT — ordering: run this BEFORE or WITH the deploy that ships the new setting.
`UserProfile` defaults the setting to True, so a user who had opted out but has not yet
been migrated would read as opted in.

Usage:
    python scripts/migrations/migrate_experiments_to_library_assistant.py [--dry-run]
"""

import argparse
import django

django.setup()

from sefaria.system.database import db
from sefaria.helper.library_assistant import SETTING_KEY


def migrate(dry_run=False):
    unset = {f"settings.{SETTING_KEY}": {"$exists": False}}

    # 1. Carry over an explicit preference from the old conflated field.
    inherit_filter = {**unset, "experiments": {"$exists": True}}
    inherited_on = db.profiles.count_documents({**inherit_filter, "experiments": True})
    inherited_off = db.profiles.count_documents({**inherit_filter, "experiments": False})

    # 2. Everyone else gets the assistant.
    backfill_filter = {**unset, "experiments": {"$exists": False}}
    backfilled = db.profiles.count_documents(backfill_filter)

    print(f"inherit experiments=True  -> {SETTING_KEY}=True :  {inherited_on}")
    print(f"inherit experiments=False -> {SETTING_KEY}=False:  {inherited_off}")
    print(f"backfill (no experiments) -> {SETTING_KEY}=True :  {backfilled}")

    if dry_run:
        print("\n--dry-run: nothing written.")
        return

    db.profiles.update_many(
        {**inherit_filter, "experiments": True}, {"$set": {f"settings.{SETTING_KEY}": True}}
    )
    db.profiles.update_many(
        {**inherit_filter, "experiments": False}, {"$set": {f"settings.{SETTING_KEY}": False}}
    )
    db.profiles.update_many(backfill_filter, {"$set": {f"settings.{SETTING_KEY}": True}})

    remaining = db.profiles.count_documents(unset)
    print(f"\nDone. Profiles still missing {SETTING_KEY}: {remaining}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report counts without writing")
    migrate(**vars(parser.parse_args()))
