# encoding=utf-8
import django
django.setup()

from sefaria.model import *
from datetime import datetime
from sefaria.system.database import db


db.drop_collection("global_story")
db.drop_collection("user_story")

# Convert Global Notifications
mappping = {
    "general": "newContent",
    "index": "newIndex",
    "version": "newVersion"
}

pns = NotificationSet({"type": "sheet publish"})
total = pns.count()
print "Converting {} sheet publish notifications.".format(total)
count = 0
for pn in pns:
    count += 1
    if count % 1000 == 0:
        print "{}/{}".format(count, total)

    ps = UserStory({
        "storyForm": "publishSheet",
        "uid": pn.uid,
        "timestamp": int((pn.date - datetime(1970, 1, 1)).total_seconds()),
        "data": pn.content
    })
    ps.data["publisher_id"] = ps.data["publisher"]
    del ps.data["publisher"]
    ps.save()

#pns.delete()

gns = GlobalNotificationSet(sort=[("_id", -1)])
total = gns.count()
print "Converting {} sheet publish notifications.".format(total)
count = 0
for gn in gns:
    count += 1
    if count % 10 == 0:
        print "{}/{}".format(count, total)
    # write to global story
    assert isinstance(gn, GlobalNotification)
    gs = GlobalStory({
        "storyForm": mappping[gn.type],
        "data": gn.content,
        "timestamp": int((gn.date - datetime(1970,1,1)).total_seconds())
    })
    gs.save()

    # get user notifications that refer to this global
    uns = NotificationSet({"is_global": True, "global_id": gn._id})
    for un in uns:
        us = UserStory(global_story=gs, uid=un.uid)
        us.save()

    # uns.delete()
#gns.delete()

