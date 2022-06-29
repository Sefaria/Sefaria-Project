import django
django.setup()
from collections import defaultdict
from sefaria.system.database import db
from pymongo import UpdateOne

if __name__ == '__main__':
    updates = []
    for user in db.profiles.find({}):
        old_prefs = user.get("version_preferences_by_corpus", False)
        new_prefs = defaultdict(dict)
        if not old_prefs: continue
        for corpus, pref in old_prefs.items():
            if corpus == "undefined": continue
            new_prefs[corpus][pref['lang']] = pref['vtitle']
        updates += [UpdateOne({"_id": user['_id']}, {"$set": {"version_preferences_by_corpus": new_prefs}})]
    db.profiles.bulk_write(updates)
