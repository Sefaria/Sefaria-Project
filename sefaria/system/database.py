"""
database.py -- connection to MongoDB
"""

from sefaria.settings import *
import pymongo

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
    db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def use_test(test_db=None):
    global db
    if not test_db:
        test_db = get_default_test_db()
    if test_db not in connection.database_names():
        connection.copy_database(SEFARIA_DB, test_db)
    db = connection[test_db]
    if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
        db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def drop_test(test_db=None):
    if not test_db:
        test_db = get_default_test_db()
    connection.drop(test_db)


def get_default_test_db():
    return SEFARIA_DB + "_test"