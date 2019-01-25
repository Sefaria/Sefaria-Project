# encoding=utf-8
import django
django.setup()

from sefaria.model import *
from datetime import datetime


mappping = {
    "general": "newContent",
    "index": "newIndex",
    "version": "newVersion"
}

gns = GlobalNotificationSet(sort=[("_id", -1)])
for gn in gns:
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

