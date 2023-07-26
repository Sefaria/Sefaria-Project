# -*- coding: utf-8 -*-

"""
notifications.py - handle user event notifications

Writes to MongoDB Collection: notifications
"""
import re
from datetime import datetime
import json

from django.template.loader import render_to_string

from . import abstract as abst
from . import user_profile
from sefaria.model.collection import Collection
from sefaria.utils.util import strip_tags
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

import structlog
logger = structlog.get_logger(__name__)


class GlobalNotification(abst.AbstractMongoRecord):
    """
    "type" attribute can be: "index", "version", or "general"

    value of "content" attribute for type "general":
        "he"    : hebrew long description (optional)
        "en"    : english long description (optional)
    for type "index":
        "index" : title of index
        "he"    : hebrew long description (optional)
        "en"    : english long description (optional)
    for type "version":
        "index"     : title of index
        "version"   : version title
        "language"  : "en" or "he"
        "he"        : hebrew long description (optional)
        "en"        : english long description (optional)

    """
    collection   = 'global_notification'
    history_noun = 'global notification'

    required_attrs = [
        "type",
        "content",
        "date",
    ]

    optional_attrs = [
    ]

    def _normalize(self):
        from sefaria.model.text import library
        if self.type == "index" or self.type == "version":
            i = library.get_index(self.content.get("index"))
            self.content["index"] = i.title

    def _validate(self):
        from sefaria.model.text import library, Version
        if self.type == "index":
            assert self.content.get("index")
            assert library.get_index(self.content.get("index"))
        elif self.type == "version":
            i = self.content.get("index")
            v = self.content.get("version")
            l = self.content.get("language")

            assert i and v and l

            version = Version().load({
                "title": i,
                "versionTitle": v,
                "language": l,
            })
            assert version, "No Version Found: {}/{}/{}".format(i, v, l)
        elif self.type == "general":
            assert self.content.get("en"), "Please provide an English message."
            assert self.content.get("he"), "Please provide a Hebrew message."
        else:
            raise InputError("Unknown type for GlobalNotification: {}".format(self.type))

    def _init_defaults(self):
        self.content = {}
        self.type    = "general"
        self.date = datetime.now()

    @staticmethod
    def latest_id():
        n = db.global_notification.find_one({}, {"_id": 1}, sort=[["_id", -1]])
        if not n:
            return None
        return n["_id"]

    def make_index(self, index):
        self.type = "index"
        self.content["index"] = index.title
        return self

    def make_version(self, version):
        self.type = "version"
        self.content["version"] = version.versionTitle
        self.content["language"] = version.language
        self.content["index"] = version.title
        return self

    def set_date(self, date):
        self.date = date
        return self

    def set_he(self, msg):
        self.content["he"] = msg
        return self

    def set_en(self, msg):
        self.content["en"] = msg
        return self

    def contents(self):
        d = super(GlobalNotification, self).contents()
        d["_id"] = self.id
        d["date"] = d["date"].isoformat()

        return d

    def client_contents(self):
        n = super(GlobalNotification, self).contents(with_string_id=True)
        n["date"] = n["date"].timestamp()
        return n

    @property
    def id(self):
        return str(self._id)


class GlobalNotificationSet(abst.AbstractMongoSet):
    recordClass = GlobalNotification

    def __init__(self, query=None, page=0, limit=0, sort=[["_id", -1]]):
        super(GlobalNotificationSet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def register_for_user(self, uid):
        for global_note in self:
            Notification().register_global_notification(global_note, uid).save()

    def contents(self):
        return [n.contents() for n in self]

    def client_contents(self):
        return [n.client_contents() for n in self]


class Notification(abst.AbstractMongoRecord):
    collection   = 'notifications'
    history_noun = 'notification'

    required_attrs = [
        "type",
        "date",
        "uid",
        "content",
        "read",
        "is_global",
    ]
    optional_attrs = [
        "read_via",
        "global_id",
        "suspected_spam"
    ]

    def _init_defaults(self):
        self.read      = False
        self.read_via  = None
        self.type      = "unset"
        self.content   = {}
        self.date      = datetime.now()
        self.is_global = False

    def _set_derived_attributes(self):
        if not self.is_global:
            return

        gnote = GlobalNotification().load({"_id": self.global_id})
        if gnote is None:
            logger.error("Tried to load non-existent global notification: {}".format(self.global_id))
        else:
            self.content = gnote.content
            self.type    = gnote.type

    def register_global_notification(self, global_note, user_id):
        self.is_global  = True
        self.global_id  = global_note._id
        self.uid        = user_id
        self.type       = global_note.type
        self.date       = global_note.date
        return self

    @staticmethod
    def latest_global_for_user(uid):
        n = db.notifications.find_one({"uid": uid, "is_global": True}, {"_id": 1}, sort=[["_id", -1]])
        return n["_id"] if n else None

    def make_sheet_like(self, liker_id=None, sheet_id=None):
        """Make this Notification for a sheet like event"""
        self.type                = "sheet like"
        self.content["liker"]    = liker_id
        self.content["sheet_id"] = sheet_id
        return self

    def make_sheet_publish(self, publisher_id=None, sheet_id=None):
        self.type                 = "sheet publish"
        self.content["publisher"] = publisher_id
        self.content["sheet_id"]  = sheet_id
        return self

    def make_follow(self, follower_id=None):
        """Make this Notification for a new Follow event"""
        self.type                = "follow"
        self.content["follower"] = follower_id
        return self

    def make_collection_add(self, adder_id, collection_slug):
        """Make this Notification for being added to a collection"""
        self.type                       = "collection add"
        self.content["adder"]           = adder_id
        self.content["collection_slug"] = collection_slug
        return self

    def make_discuss(self, adder_id=None, discussion_path=None):
        """Make this Notification for a new note added to a conversation event"""
        self.type                         = "discuss"
        self.content["adder"]             = adder_id
        self.content["discussion_path"]   = discussion_path
        return self

    def mark_read(self, via="site"):
        self.read     = True
        self.read_via = via
        return self

    @property
    def id(self):
        return str(self._id)

    @property
    def actor_id(self):
        """The id of the user who acted in this notification"""
        keys = {
            "sheet like":     "liker",
            "sheet publish":  "publisher",
            "follow":         "follower",
            "collection add": "adder",
            "discuss":        "adder",
        }
        return self.content[keys[self.type]]

    def client_contents(self):
        """
        Returns contents of notification in format usable by client, including needed merged
        data from profiles, sheets, etc
        """
        from sefaria.sheets import get_sheet_metadata
        from sefaria.model.following import FollowRelationship

        n = super(Notification, self).contents(with_string_id=True)
        n["date"] = n["date"].timestamp()
        if "global_id" in n:
            n["global_id"] = str(n["global_id"])

        def annotate_user(n, uid):
            user_data = user_profile.public_user_data(uid)
            n["content"].update({
                "name":       user_data["name"],
                "profileUrl": user_data["profileUrl"],
                "imageUrl":   user_data["imageUrl"],
            })

        def annotate_sheet(n, sheet_id):
            sheet_data = get_sheet_metadata(id=sheet_id)
            n["content"]["sheet_title"] = strip_tags(sheet_data["title"], remove_new_lines=True)
            n["content"]["summary"] = sheet_data["summary"]

        def annotate_collection(n, collection_slug):
            try:
               c = Collection().load({"slug": collection_slug})
               n["content"]["collection_name"] = c.name
            except:
               c = Collection().load({"privateSlug": collection_slug})
               n["content"]["collection_name"] = c.name

        def annotate_follow(n, potential_followee):
            """
            Does `self.uid` follow `potential_followee`
            """
            relationship = FollowRelationship(follower=self.uid, followee=potential_followee)
            n["content"]["is_already_following"] = relationship.exists()

        if n["type"] == "sheet like":
            annotate_sheet(n, n["content"]["sheet_id"])
            annotate_user(n, n["content"]["liker"])

        elif n["type"] == "sheet publish":
            annotate_sheet(n, n["content"]["sheet_id"])
            annotate_user(n, n["content"]["publisher"])

        elif n["type"] == "follow":
            annotate_user(n, n["content"]["follower"])
            annotate_follow(n, n["content"]["follower"])

        elif n["type"] == "collection add":
            annotate_user(n, n["content"]["adder"])
            annotate_collection(n, n["content"]["collection_slug"])

        return n


class NotificationSet(abst.AbstractMongoSet):
    recordClass = Notification

    def __init__(self, query=None, page=0, limit=0, sort=[["date", -1]]):
        super(NotificationSet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def _add_global_messages(self, uid):
        """
        Add user Notification records for any new GlobalNotifications
        :return:
        """
        latest_id_for_user = Notification.latest_global_for_user(uid)
        latest_global_id = GlobalNotification.latest_id()
        if latest_global_id and (latest_global_id != latest_id_for_user):
            if latest_id_for_user is None:
                GlobalNotificationSet({}, limit=10).register_for_user(uid)
            else:
                GlobalNotificationSet({"_id": {"$gt": latest_id_for_user}}, limit=10).register_for_user(uid)

    def unread_for_user(self, uid):
        """
        Loads the unread notifications for uid.
        """
        # Add globals ...
        self._add_global_messages(uid)
        self.__init__(query={"uid": uid, "read": False})
        return self

    def unread_personal_for_user(self, uid):
        """
        Loads the unread notifications for uid.
        """
        self.__init__(query={"uid": uid, "read": False, "is_global": False, "suspected_spam": {'$in': [False, None]}})
        return self

    def recent_for_user(self, uid, page=0, limit=10):
        """
        Loads recent notifications for uid.
        """
        self._add_global_messages(uid)
        self.__init__(query={"uid": uid, "suspected_spam": {'$in': [False, None]}}, page=page, limit=limit)
        return self

    def mark_read(self, via="site"):
        """Marks all notifications in this set as read"""
        for notification in self:
            notification.mark_read(via=via).save()

    @property
    def unread_count(self):
        return len([n for n in self if not n.read])

    def actors_list(self):
        """Returns a unique list of user ids who acted in this notification set excluding likes"""
        return list(set([n.actor_id for n in self if not n.type == "sheet like"]))

    def actors_string(self):
        """
        Returns a nicely formatted string listing the people who acted in this notifcation set
        Likes are not included in this list (so that like only notifcations can generate a different email subject)
        Returns None if all actions are likes.
        """
        actors = [user_profile.user_name(id) for id in self.actors_list()]
        top, more = actors[:3], actors[3:]
        if len(more) == 1:
            top[2] = "2 others"
        elif len(more) > 1:
            top.append("%d others" % len(more))
        if len(top) > 1:
            top[-1] = "and " + top[-1]
        return ", ".join(top).replace(", and ", " and ")

    def like_count(self):
        """Returns the number of likes in this NotificationSet"""
        return len([n for n in self if n.type == "sheet like"])

    def client_contents(self):
        return [n.client_contents() for n in self]


def process_sheet_deletion_in_notifications(sheet_id):
    """
    When a sheet is deleted remove it from any collections.
    Note: this function is not tied through dependencies.py (since Sheet mongo model isn't generlly used),
    but is called directly from sheet deletion view in sourcesheets/views.py.
    """
    ns = NotificationSet({"content.sheet_id": sheet_id})
    ns.delete()
