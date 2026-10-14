"""
B9 fixtures, run through `manage.py shell` with the stack's settings (b9-legacy-body.sh). D11_B9_MODE:
  setup     a synthetic user in the e2e band and a legacy Mongo apikeys row whose key is read from D11_B9_KEY_FILE
  inspect   prints "D11B9 links=<n> history=<n> pair=<n>": marker links, the user's history rows, and every link
            between the scratch refs (the post must not touch an existing link)
  teardown  removes the marker links, the user's history rows, the apikeys row and the user; prints what is left
Mongo is the shared local database: every write here is keyed by the synthetic uid or the link marker.
"""
import os

from django.conf import settings
from django.contrib.auth.models import User

from sefaria.system.database import db

assert settings.DATABASES["default"]["HOST"] == "127.0.0.1", "local stack only"
UID = 2_098_000_971
MARKER = "apikeys-e2e-d11-b9"
REFS = ["Obadiah 1:21", "Song of Songs 8:14"]
mode = os.environ["D11_B9_MODE"]


def counts():
    return (db.links.count_documents({"generated_by": MARKER}), db.history.count_documents({"user": UID}),
            db.apikeys.count_documents({"uid": UID}), User.objects.filter(id=UID).count())


if mode == "setup":
    key = open(os.environ["D11_B9_KEY_FILE"]).read().strip()
    if not User.objects.filter(id=UID).exists():
        user = User(id=UID, email="apikeys-e2e-d11-legacy@example.com", username="apikeys-e2e-d11-legacy",
                    first_name="D11", last_name="Legacy")
        user.set_unusable_password()
        user.save()
    db.apikeys.delete_many({"uid": UID})
    db.apikeys.insert_one({"uid": UID, "key": key})
    print("D11B9 setup ok")
elif mode == "inspect":
    links, history, keys, users = counts()
    pair = db.links.count_documents({"refs": {"$all": REFS}})
    print("D11B9 links=%d history=%d pair=%d" % (links, history, pair))
elif mode == "teardown":
    db.links.delete_many({"generated_by": MARKER})
    db.history.delete_many({"user": UID})
    db.apikeys.delete_many({"uid": UID})
    User.objects.filter(id=UID).delete()
    print("D11B9 left links=%d history=%d apikeys=%d users=%d" % counts())
