"""
lock.py - Edit Locks for Sefaria texts.

Writes to MongoDB Collection: locks

NOTE: Locks currently assume references at the segment level only.
E.g., locking "Genesis 4" will probably break something.
"""

#Most lock work happens in workflow.py.
#Referenced in reader.views.translation_flow.
#Aim is to handle it not just on campaign pages, but in the reader as well.

import datetime

from . import abstract as abst

LOCK_TIMEOUT = 300  # seconds after which locks expire


class Lock(abst.AbstractMongoRecord):
    collection = 'locks'
    required_attrs = [
        "ref",
        "lang",
        "version",
        "user",
        "time"
    ]
    optional_attrs = []


class LockSet(abst.AbstractMongoSet):
    recordClass = Lock


def set_lock(ref, lang, version, user):
    """
    Creats a lock for ref/lang/version/user.
    user 0 indicates anonymous lock.
    """

    return Lock({
        "ref": ref,
        "lang": lang,
        "version": version,
        "user": user,
        "time": datetime.datetime.now(),
    }).save()


def release_lock(ref, lang, version):
    """
    Deletes locks matching ref/lang/version.
    """
    Lock().delete_by_query({
        "ref": ref,
        "lang": lang,
        "version": version,
    })


def check_lock(ref, lang, version):
    """
    Returns True if a current lock for ref/lang/version exists.
    """
    return bool(Lock().load({
        "ref": ref,
        "lang": lang,
        "version": version
    }))


def expire_locks():
    """
    Remove all locks older than expiry time.
    """
    cutoff = datetime.datetime.now() - datetime.timedelta(seconds=LOCK_TIMEOUT)
    LockSet({"time": {"$lt": cutoff}}).delete()
