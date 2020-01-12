from random import randrange
from pprint import pprint
import urllib.request, urllib.parse, urllib.error
import hashlib

from django.contrib.auth.models import User

from sefaria.system.database import db
from sefaria.model.user_profile import UserProfile

contenders = db.profiles.find({"bio": {"$ne": ""}, "jewish_education": {"$ne": []}})
points = {}
users  = {}
for contender in contenders:
    user = UserProfile(id=contender["id"])
    users[user.id] = user
    gravatar = "http://www.gravatar.com/avatar/" + hashlib.md5(user.email.lower()).hexdigest() + "?d=404"
    r = urllib.request.urlopen(gravatar)
    if r.getcode() == 404:
        points[user.id] = 0
    else:
        sheets = db.sheets.find({"owner": user.id, "status": "public"}).count()
        points[user.id] = 1 + sheets

for i in range(contenders.count()):
    total = sum(points.values())
    count = 0
    winner = randrange(total) if total else 0
    for person in points:
        count += points[person]
        if count > winner:
            print("%d. %s, %s" % (i+1, "www.sefaria.org/profile/" + users[person].slug, users[person].email))
            del points[person]
            break
