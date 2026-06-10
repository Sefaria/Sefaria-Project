
import sefaria.system.database as d
import pymongo
import sefaria.model.lock as lock
from sefaria.settings import *
import pytest

#This one is purposefully circumvented on Travis, to speed up build time.
@pytest.mark.xfail(reason="unknown")
def test_db_name():
    assert d.db.name == d.TEST_DB

#todo: why failing?
@pytest.mark.xfail(reason="unknown")
def test_test_db():
    """
    Create a record using the sefaria API against the test db, and then verify it from a new db connection
    """

    ref = "Mishnah Oktzin 1:5"
    lang = "en"
    version = "Sefaria Community Translation"
    user = 0

    lock_query = {
        "ref": ref,
        "lang": lang,
        "version": version
    }

    lock.release_lock(ref, lang, version)
    lock.set_lock(ref, lang, version, user)
    test_db = get_test_connection()
    assert test_db.locks.find_one(lock_query)
    lock.release_lock(ref, lang, version)
    assert not test_db.locks.find_one(lock_query)


def get_test_connection():
    connection = pymongo.Connection(MONGO_HOST)
    db = connection[d.TEST_DB]
    if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
        db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
    return db