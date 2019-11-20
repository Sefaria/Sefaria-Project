"""
database.py -- connection to MongoDB
The system attribute _called_from_test is set in the py.test conftest.py file
"""
import sys
from sefaria.settings import *
import pymongo
from pymongo.errors import OperationFailure

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


def get_test_db():
    return client[TEST_DB]


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


def ensure_indices(active_db=None):
    active_db = active_db or db
    indices = [
        ('following', ["follower"],{}),
        ('following', ["followee"],{}),
        ('history', ["revision"],{}),
        ('history', ["method"],{}),
        ('history', [[("ref", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("language", pymongo.ASCENDING)]],{}),
        ('history', ["date"],{}),
        ('history', ["ref"],{}),
        ('history', ["user"],{}),
        ('history', ["rev_type"],{}),
        ('history', ["version"],{}),
        ('history', ["new.refs"],{}),
        ('history', ["new.ref"],{}),
        ('history', ["old.refs"],{}),
        ('history', ["old.ref"],{}),
        ('history', ["title"],{}),
        ('index', ["title"],{}),
        ('index_queue', [[("lang", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("ref", pymongo.ASCENDING)]],{'unique': True}),
        ('links', ["refs"],{}),
        ('links', ["refs.0"],{}),
        ('links', ["refs.1"],{}),
        ('links', ["expandedRefs0"],{}),
        ('links', ["expandedRefs1"],{}),
        ('links', ["source_text_oid"],{}),
        ('links', ["is_first_comment"],{}),
        ('metrics', ["timestamp"], {'unique': True}),
        ('notes', [[("owner", pymongo.ASCENDING), ("ref", pymongo.ASCENDING), ("public", pymongo.ASCENDING)]],{}),
        ('notifications', [[("uid", pymongo.ASCENDING), ("read", pymongo.ASCENDING)]],{}),
        ('notifications', ["uid"],{}),
        ('parshiot', ["date"],{}),
        ('place', [[("point", pymongo.GEOSPHERE)]],{}),
        ('place', [[("area", pymongo.GEOSPHERE)]],{}),
        ('person', ["key"],{}),
        ('profiles', ["slug"],{}),
        ('profiles', ["id"],{}),
        ('sheets', ["id"],{}),
        ('sheets', ["dateModified"],{}),
        ('sheets', ["sources.ref"],{}),
        ('sheets', ["includedRefs"],{}),
        ('sheets', ["tags"],{}),
        ('sheets', ["owner"],{}),
        ('sheets', ["assignment_id"],{}),
        ('sheets', ["is_featured"],{}),
        ('texts', ["title"],{}),
        ('texts', [[("priority", pymongo.DESCENDING), ("_id", pymongo.ASCENDING)]],{}),
        ('texts', [[("versionTitle", pymongo.ASCENDING), ("langauge", pymongo.ASCENDING)]],{}),
        ('word_form', ["form"],{}),
        ('word_form', ["c_form"],{}),
        ('term', ["titles.text"], {'unique': True}),
        ('term', ["category"],{}),
        ('lexicon_entry', [[("headword", pymongo.ASCENDING), ("parent_lexicon", pymongo.ASCENDING)]],{}),
        ('user_story', [[("uid", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)]],{}),
        ('user_story', [[("timestamp", pymongo.DESCENDING)]],{}),
        ('passage', ["ref_list"],{}),
        ('user_history', ["uid"],{}),
        ('user_history', ["sheet_id"],{}),
        ('user_history', ["datetime"],{}),
        ('trend', ["name"],{}),
        ('trend', ["uid"],{}),
        ('webpages', ["refs"],{})
    ]

    for col, args, kwargs in indices:
        try:
            getattr(active_db, col).create_index(*args, **kwargs)
        except OperationFailure as e:
            print("Collection: {}, args: {}, kwargs: {}\n{}".format(col, args, kwargs, e))
