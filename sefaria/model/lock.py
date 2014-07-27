"""
locks.py - Edit Locks for Sefaria texts.

Writes to MongoDB Collection: locks

NOTE: Locks currently assume references at the segment level only.
E.g., locking "Genesis 4" will probably break something.
"""
import datetime

from sefaria.system.database import db


LOCK_TIMEOUT = 300 # seconds after which locks expire

def set_lock(ref, lang, version, user):
	"""
	Creats a lock for ref/lang/version/user.
	user 0 indicates anonymous lock. 
	"""
	lock = {
		"ref": ref,
		"lang": lang,
		"version": version,
		"user": user,
		"time": datetime.datetime.now(),
	}
	db.locks.save(lock)


def release_lock(ref, lang, version):
	"""
	Deletes locks matching ref/lang/version.
	"""	
	lock = {
		"ref": ref,
		"lang": lang,
		"version": version,
	}
	db.locks.remove(lock)	


def check_lock(ref, lang, version):
	"""
	Returns True if a current lock for ref/lang/version exists.
	"""
	lock = db.locks.find_one({"ref":ref, "lang":lang, "version":version})

	return bool(lock)


def expire_locks():
	"""
	Remove all locks older than expiry time.
	"""
	cutoff = datetime.datetime.now()-datetime.timedelta(seconds=LOCK_TIMEOUT)
	db.locks.remove({"time": {"$lt": cutoff}})