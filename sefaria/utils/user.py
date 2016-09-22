"""
user.py - helper functions related to users

Uses MongoDB collections: apikeys
"""

import sefaria.model as model
from sefaria.system.database import db


def generate_api_key(uid):
    """ Save a new random API key for `uid` """
    user = model.UserProfile(id=uid)
    if not user._id:
        print "User %d does not exist." % uid
        return

    import base64, hashlib, random
    key = base64.b64encode(hashlib.sha256( str(random.getrandbits(256)) ).digest(), random.choice(['rA','aZ','gQ','hH','hG','aR','DD'])).rstrip('==')
    db.apikeys.remove({"uid": uid})
    db.apikeys.save({"uid": uid, "key": key})

    print "API Key for %s (uid: %d, email: %s): %s" % (user.full_name, uid, user.email, key)


def reset_all_api_keys():
    """ Updates all existing API keys with new random values """
    keys = db.apikeys.find()
    for key in keys:
        generate_api_key(key["uid"])