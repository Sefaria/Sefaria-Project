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
    client = pymongo.MongoClient(MONGO_HOST, MONGO_PORT)

    if not hasattr(sys, '_called_from_test'):
        db = client[SEFARIA_DB]
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
    else:
        # copydb deprecated in 4.2.  https://docs.mongodb.com/v4.0/release-notes/4.0-compatibility/#deprecate-copydb-clone-cmds
        if TEST_DB not in client.list_database_names():
            client.admin.command('copydb',
                                 fromdb=SEFARIA_DB,
                                 todb=TEST_DB)
        db = client[TEST_DB]
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def drop_test():
    global client
    client.drop_database(TEST_DB)


def refresh_test():
    global client
    drop_test()
    # copydb deprecated in 4.2.  https://docs.mongodb.com/v4.0/release-notes/4.0-compatibility/#deprecate-copydb-clone-cmds
    client.admin.command('copydb',
                         fromdb=SEFARIA_DB,
                         todb=TEST_DB)


def ensure_indices():
    db.following.create_index("follower")
    db.following.create_index("followee")
    db.history.create_index("revision")
    db.history.create_index("method")
    db.history.create_index([("ref", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("language", pymongo.ASCENDING)])
    db.history.create_index("date")
    db.history.create_index("ref")
    db.history.create_index("user")
    db.history.create_index("rev_type")
    db.history.create_index("version")
    db.history.create_index("new.refs")
    db.history.create_index("new.ref")
    db.history.create_index("old.refs")
    db.history.create_index("old.ref")
    db.history.create_index("title")
    db.index.create_index("title")
    db.index_queue.create_index([("lang", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("ref", pymongo.ASCENDING)], unique=True)
    db.links.create_index("refs")
    db.links.create_index("refs.0")
    db.links.create_index("refs.1")
    db.links.create_index("expandedRefs0")
    db.links.create_index("expandedRefs1")
    db.links.create_index("source_text_oid")
    db.links.create_index("is_first_comment")
    db.metrics.create_index("timestamp", unique=True)
    db.notes.create_index([("owner", pymongo.ASCENDING), ("ref", pymongo.ASCENDING), ("public", pymongo.ASCENDING)])
    db.notifications.create_index([("uid", pymongo.ASCENDING), ("read", pymongo.ASCENDING)])
    db.notifications.create_index("uid")
    db.parshiot.create_index("date")
    db.place.create_index([("point", pymongo.GEOSPHERE)])
    db.place.create_index([("area", pymongo.GEOSPHERE)])
    db.person.create_index("key")
    db.profiles.create_index("slug")
    db.profiles.create_index("id")
    db.sheets.create_index("id")
    db.sheets.create_index("dateModified")
    db.sheets.create_index("sources.ref")
    db.sheets.create_index("includedRefs")
    db.sheets.create_index("tags")
    db.sheets.create_index("owner")
    db.sheets.create_index("assignment_id")
    db.sheets.create_index("is_featured")
    db.texts.create_index("title")
    db.texts.create_index([("priority", pymongo.DESCENDING), ("_id", pymongo.ASCENDING)])
    db.texts.create_index([("versionTitle", pymongo.ASCENDING), ("langauge", pymongo.ASCENDING)])
    db.word_form.create_index("form")
    db.word_form.create_index("c_form")
    db.term.create_index("titles.text", unique=True)
    db.lexicon_entry.create_index([("headword", pymongo.ASCENDING), ("parent_lexicon", pymongo.ASCENDING)])
    db.user_story.create_index([("uid", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)])
    db.user_story.create_index([("timestamp", pymongo.DESCENDING)])
    db.passage.create_index("ref_list")
    db.user_history.create_index("uid")
    db.user_history.create_index("sheet_id")
    db.user_history.create_index("datetime")
    db.trend.create_index("name")
    db.trend.create_index("uid")
    db.webpages.create_index("refs")
    db.manuscript_image.create_index("expanded_refs")
    db.manuscript_image.create_index("image_id")
