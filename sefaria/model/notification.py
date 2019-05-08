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
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

import logging
logger = logging.getLogger(__name__)

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
            raise InputError(u"Unknown type for GlobalNotification: {}".format(self.type))

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
        "global_id"
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

    def make_message(self, sender_id=None, message=None):
        """Make this Notification for a user message event"""
        self.type               = "message"
        self.content["message"] = message
        self.content["sender"]  = sender_id
        return self

    def make_follow(self, follower_id=None):
        """Make this Notification for a new Follow event"""
        self.type                = "follow"
        self.content["follower"] = follower_id
        return self

    def make_group_add(self, adder_id, group_name):
        """Make this Notification for being added to a group"""
        self.type                  = "group add"
        self.content["adder"]      = adder_id
        self.content["group_name"] = group_name
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

    def to_JSON(self):
        notification = self.contents()
        if "_id" in notification:
            notification["_id"] = self.id
        if "global_id" in notification:
            notification["global_id"] = str(notification["global_id"])
        notification["date"] = notification["date"].isoformat()    
    
        return json.dumps(notification)

    def to_HTML(self):
        html = render_to_string("elements/notification.html", {"notification": self}).strip()
        html = re.sub("[\n\r]", "", html)
        return html

    @property
    def id(self):
        return str(self._id)

    @property
    def actor_id(self):
        """The id of the user who acted in this notification"""
        keys = {
            "message":       "sender",
            "sheet like":    "liker",
            "sheet publish": "publisher", 
            "follow":        "follower",
            "group add":     "adder",
            "discuss":       "adder",
        }
        return self.content[keys[self.type]]


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
        self.__init__(query={"uid": uid, "read": False, "is_global": False})
        return self

    def recent_for_user(self, uid, page=0, limit=10):
        """
        Loads recent notifications for uid.
        """
        self._add_global_messages(uid)
        self.__init__(query={"uid": uid}, page=page, limit=limit)
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

    def to_JSON(self):
        return "[%s]" % ", ".join([n.to_JSON() for n in self])

    def to_HTML(self):
        html = [n.to_HTML() for n in self]
        return "".join(html)





