"""
Backfill `user_last_place` from the legacy `last_place` flag in `user_history`.

UserLastPlace replaces the flag: from the deploy that introduces it, every read of a book records
the book's last place there, and nothing maintains the flag. Books a user hasn't read since then
have their last place only in the flag, and UserProfile.get_last_places() falls back to it for
them. This script copies those places over, so the fallback can be removed once it has run in
every environment.

Run it any time after create_user_last_place_collection.py and the deploy. Until it has
finished, the fallback keeps every last place available, so it can run slowly, be stopped, and be
resumed with --start-uid. A place is written only when it's newer than what's recorded for that
(uid, book), so a read recorded since the deploy is never overwritten, and a run is safe to repeat.
Sheets and sidebar (secondary) reads aren't tracked and are skipped.

It goes user by user, over the ids in `profiles`, and never scans user_history: each user's
flagged records come from the (uid, secondary, last_place, time_stamp) index.

Usage (`./run` sets PYTHONPATH and DJANGO_SETTINGS_MODULE; a bare `python` cannot import sefaria):
    ./run scripts/migrations/backfill_user_last_place.py --dry-run
    ./run scripts/migrations/backfill_user_last_place.py
    ./run scripts/migrations/backfill_user_last_place.py --start-uid 123456   # resume
    ./run scripts/migrations/backfill_user_last_place.py --uid 123            # one user, for checking
"""

import argparse
import time

import django

django.setup()

from pymongo import UpdateOne
from pymongo.errors import BulkWriteError

from sefaria.system.database import db

BATCH_SIZE = 1000
PROGRESS_EVERY_USERS = 10000
DUPLICATE_KEY = 11000

PROJECTION = {
    "uid": 1,
    "book": 1,
    "ref": 1,
    "he_ref": 1,
    "versions": 1,
    "language": 1,
    "time_stamp": 1,
    "server_time_stamp": 1,
}


def legacy_last_places(uid):
    """The user's records carrying the legacy flag. Matches the (uid, secondary, last_place, time_stamp) index."""
    query = {"uid": uid, "secondary": False, "last_place": True, "book": {"$ne": "Sheet"}}
    return db.user_history.find(query, PROJECTION)


def upsert_for(doc):
    """An upsert making `doc` its book's last place, unless a newer place is recorded."""
    place = {
        "ref": doc["ref"],
        "he_ref": doc.get("he_ref", ""),
        "versions": doc.get("versions") or {},
        "time_stamp": doc["time_stamp"],
        "server_time_stamp": doc.get("server_time_stamp", doc["time_stamp"]),
        "history_id": doc["_id"],
        "language": doc.get("language"),  # absent on records from before the field existed
    }
    # A newer recorded place makes the filter miss; the upsert then hits the unique (uid, book) index.
    return UpdateOne(
        {"uid": doc["uid"], "book": doc["book"], "time_stamp": {"$lt": doc["time_stamp"]}},
        {"$set": place},
        upsert=True,
    )


def write_batch(ops):
    """Returns (written, skipped as older than the recorded place)."""
    try:
        result = db.user_last_place.bulk_write(ops, ordered=False)
        return result.upserted_count + result.modified_count, 0
    except BulkWriteError as e:
        errors = e.details.get("writeErrors", [])
        if any(err.get("code") != DUPLICATE_KEY for err in errors):
            raise
        return e.details.get("nUpserted", 0) + e.details.get("nModified", 0), len(errors)


def has_unique_index():
    return any(
        spec.get("unique") and [k for k, _ in spec["key"]] == ["uid", "book"]
        for spec in db.user_last_place.index_information().values()
    )


def user_ids(start_uid=0):
    return (p["id"] for p in db.profiles.find({"id": {"$gte": start_uid}}, {"id": 1, "_id": 0}).sort("id", 1))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Count the legacy places without writing")
    parser.add_argument("--uid", type=int, help="Only this user")
    parser.add_argument("--start-uid", type=int, default=0, help="Resume from this user id")
    parser.add_argument("--pause", type=float, default=0, help="Seconds to sleep after each batch, to ease load")
    args = parser.parse_args()

    if not args.dry_run and not has_unique_index():
        # Without it, the "newer place recorded" case inserts a duplicate (uid, book) instead of failing.
        raise SystemExit(
            "user_last_place has no unique (uid, book) index; run create_user_last_place_collection.py first"
        )

    uids = [args.uid] if args.uid is not None else user_ids(args.start_uid)
    users = places = written = skipped = 0
    ops = []

    def flush():
        nonlocal ops, written, skipped
        if ops and not args.dry_run:
            w, s = write_batch(ops)
            written, skipped = written + w, skipped + s
            time.sleep(args.pause)
        ops = []

    for uid in uids:
        users += 1
        for doc in legacy_last_places(uid):
            places += 1
            ops.append(upsert_for(doc))
        if len(ops) >= BATCH_SIZE:
            flush()
        if users % PROGRESS_EVERY_USERS == 0:
            print(f"{users} users (last uid {uid}), {places} places, {written} written, {skipped} skipped")
    flush()
    action = "found" if args.dry_run else f"found, {written} written, {skipped} skipped (a newer place was recorded)"
    print(f"Done: {users} users, {places} places {action}")


if __name__ == "__main__":
    main()
