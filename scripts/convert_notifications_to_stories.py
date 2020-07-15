# encoding=utf-8
import django
django.setup()

from sefaria.model import *
from datetime import datetime
from sefaria.system.database import db, ensure_indices


db.drop_collection("shared_story")
db.drop_collection("user_story")


pns = NotificationSet({"type": "sheet publish"}, sort=[("_id", -1)])
total = len(pns)
print("Converting {} sheet publish notifications.".format(total))

for count, pn in enumerate(pns):
    if count % 1000 == 0:
        print("{}/{}".format(count, total))

    UserStory.from_sheet_publish_notification(pn).save()

#pns.delete()


gns = GlobalNotificationSet(sort=[("_id", -1)])
total = len(gns)
print("Converting {} global notifications.".format(total))
for count, gn in enumerate(gns):
    if count % 10 == 0:
        print("{}/{}".format(count, total))

    # write to shared story
    assert isinstance(gn, GlobalNotification)
    gs = SharedStory.from_global_notification(gn).save()

    # get user notifications that refer to this global
    uns = NotificationSet({"is_global": True, "global_id": gn._id})
    for un in uns:
        UserStory.from_shared_story(un.uid, gs).save()

    # uns.delete()
#gns.delete()

ensure_indices()
