"""
database.py -- connection to MongoDB
The system attribute _called_from_test is set in the py.test conftest.py file
"""

import sys
import urllib.parse

import pymongo
from pymongo import monitoring
from pymongo.errors import OperationFailure

from sefaria.settings import *


class QueryCounter(monitoring.CommandListener):
    count = 0
    queries = []
    tracked_commands = None

    def started(self, event):
        if self.tracked_commands is not None and event.command_name not in self.tracked_commands:
            return
        import traceback

        QueryCounter.count += 1
        QueryCounter.queries.append(
            {
                "command": event.command_name,
                "collection": event.command.get(event.command_name),
                "traceback": "".join(traceback.format_stack()[-6:-1]),
            }
        )

    def succeeded(self, event):
        pass

    def failed(self, event):
        pass

    @classmethod
    def reset(cls, tracked_commands=None):
        cls.count = 0
        cls.queries = []
        cls.tracked_commands = tracked_commands


def check_db_exists(db_name):
    dbnames = client.list_database_names()
    return db_name in dbnames


def connect_to_db(db_name):
    if not check_db_exists(db_name):
        raise SystemError(f"Database {db_name} does not exist!")
    return client[db_name]


def get_test_db():
    return client[TEST_DB]


# Resilience for long-running batch jobs (the weekly ES reindex) AND the
# online path: bound dead-socket hangs. Without socketTimeoutMS, pymongo
# defaults to None (infinite) and a dead Mongo TCP connection blocks reads
# until OS TCP keepalive (~2h) notices. 5 min is 2-3x the slowest legitimate
# query and lets AutoReconnect retry / retryReads recover quickly.
MONGO_CLIENT_TIMEOUT_KWARGS = {
    "socketTimeoutMS": 300_000,  # 5 min ceiling on any single socket read
    "connectTimeoutMS": 20_000,  # pymongo default, set explicitly
    "serverSelectionTimeoutMS": 60_000,  # wait through a full replica election
}

if hasattr(sys, "_doc_build"):
    db = ""
else:
    # TEST_DB = SEFARIA_DB + "_test"
    TEST_DB = SEFARIA_DB

    # If we have jsut a single instance mongo (such as for development) the MONGO_HOST param should contain jsut the host string e.g "localhost")
    _event_listeners = [QueryCounter()] if hasattr(sys, "_called_from_test") else []

    if MONGO_REPLICASET_NAME is None:
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            client = pymongo.MongoClient(
                MONGO_HOST,
                MONGO_PORT,
                username=SEFARIA_DB_USER,
                password=SEFARIA_DB_PASSWORD,
                event_listeners=_event_listeners,
                **MONGO_CLIENT_TIMEOUT_KWARGS,
            )
        else:
            client = pymongo.MongoClient(
                MONGO_HOST, MONGO_PORT, event_listeners=_event_listeners, **MONGO_CLIENT_TIMEOUT_KWARGS
            )
    # Else if we are using a replica set mongo, we need to connect with a URI that containts a comma separated list of 'host:port' strings
    else:
        if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
            # and also escape user/pass
            username = urllib.parse.quote_plus(SEFARIA_DB_USER)
            password = urllib.parse.quote_plus(SEFARIA_DB_PASSWORD)
            connection_uri = f"mongodb://{username}:{password}@{MONGO_HOST}/?ssl=false&readPreference=primaryPreferred&replicaSet={MONGO_REPLICASET_NAME}"
        else:
            connection_uri = (
                f"mongodb://{MONGO_HOST}/?ssl=false&readPreference=primaryPreferred&replicaSet={MONGO_REPLICASET_NAME}"
            )
        # Now connect to the mongo server
        client = pymongo.MongoClient(connection_uri, event_listeners=_event_listeners, **MONGO_CLIENT_TIMEOUT_KWARGS)

    # Now set the db variable to point to the Sefaria database in the server
    if not hasattr(sys, "_called_from_test"):
        db = connect_to_db(SEFARIA_DB)
    else:
        db = connect_to_db(TEST_DB)


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


def _index_key(args):
    """The key of an index spec as ensure_indices lists it ("field" or [(field, direction), ...]), as index_information() gives it."""
    spec = args[0]
    if isinstance(spec, str):
        return [(spec, pymongo.ASCENDING)]
    return [(field, direction) for field, direction in spec]


def missing_indices(active_db=None, collections=None):
    """
    The registered indexes (ensure_indices) that ``active_db`` lacks, as (collection, args, kwargs), optionally only for some
    collections. Compared by key only, not by name, so an index built by hand under another name still counts; options
    (unique, sparse, partial filters, ...) are NOT compared, so an index with the right key but different options is not
    reported.
    """
    active_db = db if active_db is None else active_db
    missing = []
    existing = {}
    for col, args, kwargs in ensure_indices(active_db, collections=collections, dry_run=True):
        if col not in existing:
            try:
                info = getattr(active_db, col).index_information()
            except OperationFailure:
                info = {}
            existing[col] = [[tuple(k) for k in spec["key"]] for spec in info.values()]
        if _index_key(args) not in existing[col]:
            missing.append((col, args, kwargs))
    return missing


def ensure_indices(active_db=None, collections=None, dry_run=False):
    """
    Create every index the code relies on (create_index is idempotent: an existing index costs nothing).

    Nothing at startup, in the chart or in a cron runs this: ``./manage.py ensure_mongo_indexes`` lists what is missing and
    ``--create`` builds it (reader/management/commands/ensure_mongo_indexes.py); run it wherever a database was built some
    other way, e.g. a cauldron restored from a dump. A
    query that hints an index (``hint="expandedRefs_1"``) fails outright where the index is missing.

    ``collections`` limits it to those collections; ``dry_run`` creates nothing and returns the registered specs.
    Returns the (collection, args, kwargs) specs it handled.
    """
    active_db = db if active_db is None else active_db
    indices = [
        ("following", ["follower"], {}),
        ("following", ["followee"], {}),
        ("groups", ["name"], {}),
        ("groups", ["sheets"], {}),
        ("groups", ["slug"], {"unique": True}),
        ("groups", ["privateSlug"], {"unique": True}),
        ("groups", ["members"], {}),
        ("groups", ["admins"], {}),
        ("history", ["revision"], {}),
        ("history", ["method"], {}),
        (
            "history",
            [[("ref", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("language", pymongo.ASCENDING)]],
            {},
        ),
        ("history", ["date"], {}),
        ("history", ["ref"], {}),
        ("history", ["user"], {}),
        ("history", ["rev_type"], {}),
        ("history", ["version"], {}),
        ("history", ["new.refs"], {}),
        ("history", ["new.ref"], {}),
        ("history", ["old.refs"], {}),
        ("history", ["old.ref"], {}),
        ("history", ["title"], {}),
        ("index", ["title"], {}),
        (
            "index_queue",
            [[("lang", pymongo.ASCENDING), ("version", pymongo.ASCENDING), ("ref", pymongo.ASCENDING)]],
            {"unique": True},
        ),
        ("index", ["categories.0"], {}),
        ("index", ["order.0"], {}),
        ("index", ["order.1"], {}),
        # ('links', [[("refs.0",  1), ("refs.1", 1)]], {"unique": True}),
        ("links", [[("refs", pymongo.ASCENDING), ("generated_by", pymongo.ASCENDING)]], {}),
        ("links", ["refs.0"], {}),
        ("links", ["refs.1"], {}),
        ("links", ["expandedRefs0"], {}),
        ("links", ["expandedRefs1"], {}),
        ("links", ["source_text_oid"], {}),
        ("links", ["is_first_comment"], {}),
        ("links", ["inline_citation"], {}),
        ("metrics", ["timestamp"], {"unique": True}),
        ("media", ["ref.sefaria_ref"], {}),
        ("notes", [[("owner", pymongo.ASCENDING), ("ref", pymongo.ASCENDING), ("public", pymongo.ASCENDING)]], {}),
        ("notifications", [[("uid", pymongo.ASCENDING), ("read", pymongo.ASCENDING)]], {}),
        ("notifications", ["uid"], {}),
        ("notifications", ["content.sheet_id"], {}),
        ("parshiot", ["date"], {}),
        ("place", [[("point", pymongo.GEOSPHERE)]], {}),
        ("place", [[("area", pymongo.GEOSPHERE)]], {}),
        ("place", ["key"], {}),
        ("person", ["key"], {}),
        ("profiles", ["slug"], {}),
        ("profiles", ["id"], {}),
        ("sheets", ["id"], {}),
        ("sheets", ["dateModified"], {}),
        ("sheets", ["sources.ref"], {}),
        ("sheets", ["includedRefs"], {}),
        ("sheets", ["expandedRefs"], {}),
        # Picked by the planner for get_sheets_for_ref (public / collection / owner queries); they exist on prod.
        (
            "sheets",
            [
                [
                    ("expandedRefs", pymongo.ASCENDING),
                    ("status", pymongo.ASCENDING),
                    ("group", pymongo.ASCENDING),
                    ("views", pymongo.DESCENDING),
                ]
            ],
            {},
        ),
        (
            "sheets",
            [[("expandedRefs", pymongo.ASCENDING), ("status", pymongo.ASCENDING), ("views", pymongo.DESCENDING)]],
            {},
        ),
        (
            "sheets",
            [[("expandedRefs", pymongo.ASCENDING), ("owner", pymongo.ASCENDING), ("views", pymongo.DESCENDING)]],
            {},
        ),
        ("sheets", ["tags"], {}),
        ("sheets", ["owner"], {}),
        ("sheets", ["assignment_id"], {}),
        ("sheets", ["is_featured"], {}),
        ("sheets", ["displayedCollection"], {}),
        ("sheets", ["sheetLanguage"], {}),
        ("sheets", [[("views", pymongo.DESCENDING)]], {}),
        ("sheets", ["categories"], {}),
        ("links", [[("owner", pymongo.ASCENDING), ("date_modified", pymongo.DESCENDING)]], {}),
        ("texts", ["title"], {}),
        ("texts", [[("priority", pymongo.DESCENDING), ("_id", pymongo.ASCENDING)]], {}),
        ("texts", [[("versionTitle", pymongo.ASCENDING), ("language", pymongo.ASCENDING)]], {}),
        ("texts", ["actualLanguage"], {}),
        ("texts", [[("digitizedBySefaria", pymongo.ASCENDING), ("title", pymongo.ASCENDING)]], {}),
        ("topics", ["titles.text"], {}),
        ("topic_links", ["class"], {}),
        ("topic_links", ["expandedRefs"], {}),
        ("topic_links", ["toTopic"], {}),
        ("topic_links", ["fromTopic"], {}),
        ("word_form", ["form"], {}),
        ("word_form", ["c_form"], {}),
        ("word_form", ["refs"], {}),
        ("term", ["titles.text"], {"unique": True}),
        ("term", ["category"], {}),
        ("lexicon_entry", [[("headword", pymongo.ASCENDING), ("parent_lexicon", pymongo.ASCENDING)]], {}),
        ("user_story", ["uid"], {}),
        ("user_story", [[("uid", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)]], {}),
        ("user_story", [[("timestamp", pymongo.DESCENDING)]], {}),
        ("passage", ["ref_list"], {}),
        # update_pagesheetrank() upserts one UpdateOne({"ref": ...}) per tref into
        # ref_data. Unindexed, each upsert is a COLLSCAN of the whole collection
        # (~1.27M docs, ~434ms each), so the weekly reindex dies on NetworkTimeout
        # long before it reaches Elasticsearch.
        ("ref_data", ["ref"], {}),
        ("user_history", ["uid"], {}),
        ("user_history", ["sheet_id"], {}),
        ("user_history", ["datetime"], {}),
        ("user_history", ["ref"], {}),
        ("user_history", [[("time_stamp", pymongo.DESCENDING)]], {}),
        ("user_history", [[("uid", pymongo.ASCENDING), ("server_time_stamp", pymongo.ASCENDING)]], {}),
        ("user_history", [[("uid", pymongo.ASCENDING), ("saved", pymongo.ASCENDING)]], {}),
        ("user_history", [[("uid", pymongo.ASCENDING), ("ref", pymongo.ASCENDING)]], {}),
        (
            "user_history",
            [[("uid", pymongo.ASCENDING), ("book", pymongo.ASCENDING), ("last_place", pymongo.ASCENDING)]],
            {},
        ),
        (
            "user_history",
            [
                [
                    ("uid", pymongo.ASCENDING),
                    ("secondary", pymongo.ASCENDING),
                    ("last_place", pymongo.ASCENDING),
                    ("time_stamp", pymongo.ASCENDING),
                ]
            ],
            {},
        ),
        (
            "user_history",
            [[("uid", pymongo.ASCENDING), ("secondary", pymongo.ASCENDING), ("time_stamp", pymongo.ASCENDING)]],
            {},
        ),
        ("trend", ["name"], {}),
        ("trend", ["uid"], {}),
        ("webpages", ["refs"], {}),
        ("webpages", ["expandedRefs"], {}),
        ("websites", ["domains"], {}),
        ("manuscript_pages", ["expanded_refs"], {}),
        (
            "manuscript_pages",
            [[("manuscript_slug", pymongo.ASCENDING), ("page_id", pymongo.ASCENDING)]],
            {"unique": True},
        ),
        ("manuscripts", ["slug"], {}),
        ("manuscripts", ["title"], {}),
        ("messages", [[("room_id", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)]], {}),
        ("vstate", ["title"], {}),
        ("vstate", ["flags.enComplete"], {}),
        ("guide", ["expanded_refs"], {}),
        ("topics", ["parasha"], {}),
        ("webpages_text", ["url"], {}),
        ("linker_editor_history", ["uid"], {}),
        ("linker_editor_history", ["action"], {}),
        ("linker_editor_history", ["index_title"], {}),
        ("linker_editor_history", ["slug"], {}),
        ("linker_editor_history", ["created"], {}),
        # hinted by sefaria/helper/linker/tasks.py (MarkedUpTextChunkSet(..., hint="ref_1"))
        ("marked_up_text_chunks", ["ref"], {}),
    ]

    if collections is not None:
        indices = [spec for spec in indices if spec[0] in collections]
    if dry_run:
        return indices
    create_indices(indices, active_db)
    return indices


def create_indices(specs, active_db=None):
    """create_index for each (collection, args, kwargs); a failure is printed and the rest go on."""
    active_db = db if active_db is None else active_db
    for col, args, kwargs in specs:
        try:
            getattr(active_db, col).create_index(*args, **kwargs)
        except OperationFailure as e:
            print(f"Collection: {col}, args: {args}, kwargs: {kwargs}\n{e}")
