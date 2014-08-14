"""
database.py -- connection to MongoDB
The system attribute _called_from_test is set in the py.test conftest.py file
"""
import sys
from sefaria.settings import *
import pymongo

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


