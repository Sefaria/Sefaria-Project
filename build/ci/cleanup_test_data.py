"""Remove stale test fixtures from prior pytest runs in the shared sandbox Mongo.

STALE_TITLES covers every dummy index created by sefaria/helper/tests/auto_linking_test.py
(the only test module that persists named indexes into the shared sandbox Mongo); confirmed
by grepping the test suite for Index().save()/root.add_title() calls.
"""
import re

from sefaria.system.database import db

STALE_TITLES = ["Many to One on Genesis", "One to One on Genesis"]
title_filter = {"title": {"$in": STALE_TITLES}}
ref_regex = "|".join(re.escape(title) for title in STALE_TITLES)

r1 = db.index.delete_many(title_filter)
r2 = db.links.delete_many({"refs": {"$regex": ref_regex}})
r3 = db.texts.delete_many(title_filter)
r4 = db.vstate.delete_many(title_filter)

print(f"Cleaned stale test data: {r1.deleted_count} indexes, {r2.deleted_count} links, "
      f"{r3.deleted_count} texts, {r4.deleted_count} vstates")
