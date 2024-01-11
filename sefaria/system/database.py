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
    # TEST_DB = SEFARIA_DB + "_test"
    TEST_DB = SEFARIA_DB 
    client = pymongo.MongoClient(MONGO_HOST, MONGO_PORT)

    if not hasattr(sys, '_called_from_test'):
        db = client[SEFARIA_DB]
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
    else:
        db = client[TEST_DB]
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def get_test_db():
    return client[TEST_DB]


def drop_test():
    global client
    client.drop_database(TEST_DB)


# Not used
# def refresh_test():
#     global client
#     drop_test()
#     # copydb deprecated in 4.2.  https://docs.mongodb.com/v4.0/release-notes/4.0-compatibility/#deprecate-copydb-clone-cmds
#     client.admin.command('copydb',
#                          fromdb=SEFARIA_DB,
#                          todb=TEST_DB)


def ensure_indices(active_db=None):
    active_db = active_db or db
    indices = [
        ('following', ["follower"], {}),
        ('following', ["followee"], {}),
        ('groups', ["name"], {}),
        ('groups', ["sheets"], {}),
        ('groups', ["slug"], {'unique': True}),
        ('groups', ["privateSlug"], {'unique': True}),
        ('groups', ["members"], {}),
        ('groups', ["admins"], {}),
        ('history', ["revision"], {}),
        ('history', ["method"], {}),
        ('history', [[("ref", pymongo.ASCENDING), ("version",
         pymongo.ASCENDING), ("language", pymongo.ASCENDING)]], {}),
        ('history', ["date"], {}),
        ('history', ["ref"], {}),
        ('history', ["user"], {}),
        ('history', ["rev_type"], {}),
        ('history', ["version"], {}),
        ('history', ["new.refs"], {}),
        ('history', ["new.ref"], {}),
        ('history', ["old.refs"], {}),
        ('history', ["old.ref"], {}),
        ('history', ["title"], {}),
        ('index', ["title"], {}),
        ('index_queue', [[("lang", pymongo.ASCENDING), ("version",
         pymongo.ASCENDING), ("ref", pymongo.ASCENDING)]], {'unique': True}),
        ('index', ["categories.0"], {}),
        ('index', ["order.0"], {}),
        ('index', ["order.1"], {}),
        # ('links', [[("refs.0",  1), ("refs.1", 1)]], {"unique": True}),
        ('links', [[("refs", pymongo.ASCENDING),
         ("generated_by", pymongo.ASCENDING)]], {}),
        ('links', ["refs.0"], {}),
        ('links', ["refs.1"], {}),
        ('links', ["expandedRefs0"], {}),
        ('links', ["expandedRefs1"], {}),
        ('links', ["source_text_oid"], {}),
        ('links', ["is_first_comment"], {}),
        ('links', ["inline_citation"], {}),
        ('metrics', ["timestamp"], {'unique': True}),
        ('media', ["ref.sefaria_ref"], {}),
        ('notes', [[("owner", pymongo.ASCENDING), ("ref",
         pymongo.ASCENDING), ("public", pymongo.ASCENDING)]], {}),
        ('notifications', [
         [("uid", pymongo.ASCENDING), ("read", pymongo.ASCENDING)]], {}),
        ('notifications', ["uid"], {}),
        ('notifications', ["content.sheet_id"], {}),
        ('parshiot', ["date"], {}),
        ('place', [[("point", pymongo.GEOSPHERE)]], {}),
        ('place', [[("area", pymongo.GEOSPHERE)]], {}),
        ('person', ["key"], {}),
        ('profiles', ["slug"], {}),
        ('profiles', ["id"], {}),
        ('sheets', ["id"], {}),
        ('sheets', ["dateModified"], {}),
        ('sheets', ["sources.ref"], {}),
        ('sheets', ["includedRefs"], {}),
        ('sheets', ["expandedRefs"], {}),
        ('sheets', ["tags"], {}),
        ('sheets', ["owner"], {}),
        ('sheets', ["assignment_id"], {}),
        ('sheets', ["is_featured"], {}),
        ('sheets', ["displayedCollection"], {}),
        ('sheets', ["sheetLanguage"], {}),
        ('sheets', [[("views", pymongo.DESCENDING)]], {}),
        ('sheets', ["categories"], {}),
        ('links', [[("owner", pymongo.ASCENDING),
         ("date_modified", pymongo.DESCENDING)]], {}),
        ('texts', ["title"], {}),
        ('texts', [[("priority", pymongo.DESCENDING),
         ("_id", pymongo.ASCENDING)]], {}),
        ('texts', [[("versionTitle", pymongo.ASCENDING),
         ("langauge", pymongo.ASCENDING)]], {}),
        ('texts', ["actualLanguage"], {}),
        ('topics', ["titles.text"], {}),
        ('topic_links', ["class"], {}),
        ('topic_links', ["expandedRefs"], {}),
        ('topic_links', ["toTopic"], {}),
        ('topic_links', ["fromTopic"], {}),
        ('word_form', ["form"], {}),
        ('word_form', ["c_form"], {}),
        ('word_form', ["refs"], {}),
        ('term', ["titles.text"], {'unique': True}),
        ('term', ["category"], {}),
        ('lexicon_entry', [[("headword", pymongo.ASCENDING),
         ("parent_lexicon", pymongo.ASCENDING)]], {}),
        ('user_story', ["uid"], {}),
        ('user_story', [[("uid", pymongo.ASCENDING),
         ("timestamp", pymongo.DESCENDING)]], {}),
        ('user_story', [[("timestamp", pymongo.DESCENDING)]], {}),
        ('passage', ["ref_list"], {}),
        ('user_history', ["uid"], {}),
        ('user_history', ["sheet_id"], {}),
        ('user_history', ["datetime"], {}),
        ('user_history', ["ref"], {}),
        ('user_history', [[("time_stamp", pymongo.DESCENDING)]], {}),
        ('user_history', [[("uid", pymongo.ASCENDING),
         ("server_time_stamp", pymongo.ASCENDING)]], {}),
        ('user_history', [
         [("uid", pymongo.ASCENDING), ("saved", pymongo.ASCENDING)]], {}),
        ('user_history', [
         [("uid", pymongo.ASCENDING), ("ref", pymongo.ASCENDING)]], {}),
        ('user_history', [[("uid", pymongo.ASCENDING), ("book",
         pymongo.ASCENDING), ("last_place", pymongo.ASCENDING)]], {}),
        ('user_history', [[("uid", pymongo.ASCENDING), ("secondary", pymongo.ASCENDING),
         ("last_place", pymongo.ASCENDING), ("time_stamp", pymongo.ASCENDING)]], {}),
        ('user_history', [[("uid", pymongo.ASCENDING), ("secondary",
         pymongo.ASCENDING), ("time_stamp", pymongo.ASCENDING)]], {}),
        ('trend', ["name"], {}),
        ('trend', ["uid"], {}),
        ('webpages', ["refs"], {}),
        ('webpages', ["expandedRefs"], {}),
        ('manuscript_pages', ['expanded_refs'], {}),
        ('manuscript_pages', [[("manuscript_slug", pymongo.ASCENDING),
         ("page_id", pymongo.ASCENDING)]], {'unique': True}),
        ('manuscripts', ['slug'], {}),
        ('manuscripts', ['title'], {}),
        ('messages', [[("room_id", pymongo.ASCENDING),
         ("timestamp", pymongo.DESCENDING)]], {}),
        ('vstate', ["title"], {}),
        ('vstate', ["flags.enComplete"], {}),
    ]

    for col, args, kwargs in indices:
        try:
            getattr(active_db, col).create_index(*args, **kwargs)
        except OperationFailure as e:
            print("Collection: {}, args: {}, kwargs: {}\n{}".format(col, args, kwargs, e))