
import sefaria.system.database as d
d.use_test()

import pymongo
import sefaria.model.lock as lock
from sefaria.settings import *




def test_test_db():
    """
    Create a record using the sefaria API against the test db, and then verify it from a new db connection
    """

    ref = "Mishnah Oktzin 1:3"
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
    db = connection[d.get_default_test_db()]
    if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
        db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
    return db