"""
Create the `user_last_place` collection (UserLastPlace) with its indexes.

Run once per environment, before the deploy that introduces UserLastPlace: every plain read
upserts into it by (uid, book), so without the indexes each read scans the collection, and
without the unique one a late, older read can insert a second record for a book instead of
being rejected. Safe to re-run.

Then, after the deploy, run backfill_user_last_place.py.

The indexes are also listed in sefaria.system.database.ensure_indices().

Usage (`./run` sets PYTHONPATH and DJANGO_SETTINGS_MODULE; a bare `python` cannot import sefaria):
    ./run scripts/migrations/create_user_last_place_collection.py
"""

import django

django.setup()

import pymongo

from sefaria.system.database import db

COLLECTION = "user_last_place"


def main():
    if COLLECTION not in db.list_collection_names():
        db.create_collection(COLLECTION)
    collection = db[COLLECTION]
    collection.create_index([("uid", pymongo.ASCENDING), ("book", pymongo.ASCENDING)], unique=True)
    collection.create_index([("uid", pymongo.ASCENDING), ("time_stamp", pymongo.DESCENDING)])
    print(f"{COLLECTION} indexes: {sorted(collection.index_information())}")


if __name__ == "__main__":
    main()
