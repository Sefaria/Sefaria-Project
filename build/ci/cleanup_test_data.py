"""Remove stale test fixtures from prior pytest runs in the shared sandbox Mongo."""
import re

from sefaria.system.database import db

STALE_TITLES = ["Many to One on Genesis", "One to One on Genesis"]
title_filter = {"title": {"$in": STALE_TITLES}}
ref_regex = "|".join(re.escape(title) for title in STALE_TITLES)

# Profile docs written by reader/tests users. Runs that die mid-test skip their
# teardown, and this Mongo persists between runs. All such users carry ids above
# this floor, where no real user can exist — keep in sync with
# SYNTHETIC_USER_ID_FLOOR in reader/conftest.py (not importable here: this script
# runs without django.setup()).
SYNTHETIC_USER_ID_FLOOR = 2_000_000_000

r1 = db.index.delete_many(title_filter)
r2 = db.links.delete_many({"refs": {"$regex": ref_regex}})
r3 = db.texts.delete_many(title_filter)
r4 = db.vstate.delete_many(title_filter)
r5 = db.profiles.delete_many({"id": {"$gte": SYNTHETIC_USER_ID_FLOOR}})

print(f"Cleaned stale test data: {r1.deleted_count} indexes, {r2.deleted_count} links, "
      f"{r3.deleted_count} texts, {r4.deleted_count} vstates, "
      f"{r5.deleted_count} synthetic profiles")
