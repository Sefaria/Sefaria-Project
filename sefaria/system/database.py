"""
database.py -- connection to MongoDB
The system attribute _called_from_test is set in the py.test conftest.py file
"""
import sys
from sefaria.settings import *
import pymongo

if hasattr(sys, '_doc_build'):
    db = ""
else:
    TEST_DB = SEFARIA_DB + "_test"
    connection = pymongo.Connection(MONGO_HOST)

    if not hasattr(sys, '_called_from_test'):
        db = connection[SEFARIA_DB]
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
    else:
        if TEST_DB not in connection.database_names():
            connection.copy_database(SEFARIA_DB, TEST_DB)
        db = connection[TEST_DB]
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def drop_test():
    global connection
    connection.drop_database(TEST_DB)


def refresh_test():
    global connection
    drop_test()
    connection.copy_database(SEFARIA_DB, TEST_DB)


def ensure_indices():
    db.following.ensure_index("follower")
    db.following.ensure_index("followee")
    db.history.ensure_index("revision")
    db.history.ensure_index("method")
    db.history.ensure_index([("ref", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("language", pymongo.ASCENDING)])
    db.history.ensure_index("date")
    db.history.ensure_index("ref")
    db.history.ensure_index("user")
    db.history.ensure_index("rev_type")
    db.history.ensure_index("version")
    db.history.ensure_index("new.refs")
    db.history.ensure_index("new.ref")
    db.history.ensure_index("old.refs")
    db.history.ensure_index("old.ref")
    db.history.ensure_index("title")
    db.index.ensure_index("title")
    db.index_queue.ensure_index([("lang", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("ref", pymongo.ASCENDING)], unique=True)
    db.links.ensure_index("refs")
    db.links.ensure_index("refs.0")
    db.links.ensure_index("refs.1")
    db.metrics.ensure_index("timestamp", unique=True)
    db.notes.ensure_index([("owner", pymongo.ASCENDING), ("ref", pymongo.ASCENDING), ("public", pymongo.ASCENDING)])
    db.notifications.ensure_index([("uid", pymongo.ASCENDING), ("read", pymongo.ASCENDING)])
    db.notifications.ensure_index("uid")
    db.parshiot.ensure_index("date")
    db.place.ensure_index([("point", pymongo.GEOSPHERE)])
    db.place.ensure_index([("area", pymongo.GEOSPHERE)])
    db.profiles.ensure_index("slug")
    db.sheets.ensure_index("id")
    db.sheets.ensure_index("dateModified")
    db.sheets.ensure_index("sources.ref")
    db.texts.ensure_index("title")
    db.texts.ensure_index([("priority", pymongo.DESCENDING), ("_id", pymongo.ASCENDING)])
    db.texts.ensure_index([("versionTitle", pymongo.ASCENDING), ("langauge", pymongo.ASCENDING)])
    db.word_form.ensure_index("form")