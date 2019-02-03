# -*- coding: utf-8 -*-

"""
notifications.py - handle user event notifications

Writes to MongoDB Collection: notifications
"""

import time
import bleach
from datetime import datetime

from . import abstract as abst
from . import user_profile
from sefaria.system.database import db
from sefaria.utils.util import concise_natural_time

from sefaria.system.exceptions import InputError

import logging
logger = logging.getLogger(__name__)


class Story(abst.AbstractMongoRecord):

    def _normalize(self):
        pass

    def _validate(self):
        pass

    def _init_defaults(self):
        pass

    def toJSON(self):
        pass   # needed?


"""
Global Notification "type" attrs that got converted: 
    "index", "version", "general"

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

Mapping of "type" to "storyForm":
    "general": "newContent"
    "index": "newIndex"
    "version": "newVersion"

storyForms relate to React components.  There is an explicit mapping in HomeFeed.jsx 

Other story forms:
    "publishSheet"
        "publisher_id"
        "publisher_name" (derived)
        "sheet_id"
        "sheet_title" (derived) 
"""


class GlobalStory(Story):

    collection   = 'global_story'
    history_noun = 'global story'

    required_attrs = [
        "storyForm",     # Valid story forms are ...
        "data",
        "timestamp",
    ]

    optional_attrs = [
    ]

    def _init_defaults(self):
        self.timestamp = int(time.time())

    @staticmethod
    def latest_id():
        n = db.global_story.find_one({}, {"_id": 1}, sort=[["_id", -1]])
        if not n:
            return None
        return n["_id"]


class GlobalStorySet(abst.AbstractMongoSet):
    recordClass = GlobalStory

    def __init__(self, query=None, page=0, limit=0, sort=None):
        sort = sort or [["timestamp", -1]]
        super(GlobalStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def register_for_user(self, uid):
        for global_story in self:
            UserStory.from_global_story(uid, global_story).save()


class UserStory(Story):

    collection   = 'user_story'
    history_noun = 'user story'

    required_attrs = [
        "uid",
        "is_global",
        "timestamp"
    ]

    optional_attrs = [
        "global_story_id",   # required if is_global is true
        "storyForm",         # required if is_global is false
        "data"               # required if is_global is false
    ]

    # Pseudo Constructors
    @classmethod
    def from_global_story(cls, user_id, global_story):
        return cls({
            "is_global": True,
            "global_story_id": global_story._id,
            "uid": user_id,
            "timestamp": global_story.timestamp
        })

    @classmethod
    def from_sheet_publish(cls, user_id, publisher_id, sheet_id):
        return cls({
            "storyForm": "publishSheet",
            "uid": user_id,
            "data": {
                "publisher": publisher_id,
                "sheet_id": sheet_id
            }
        })

    def _init_defaults(self):
        self.timestamp = int(time.time())
        self.is_global = False

    def _validate(self):
        if self.is_global:
            assert self.global_story_id is not None
        else:
            assert self.data
            assert self.storyForm

    @staticmethod
    def latest_global_for_user(uid):
        n = db.user_story.find_one({"uid": uid, "is_global": True}, {"_id": 1}, sort=[["_id", -1]])
        return n["_id"] if n else None


    def contents(self, **kwargs):
        c = super(UserStory, self).contents(**kwargs)
        if self.is_global:
            g = GlobalStory().load_by_id(self.global_story_id)
            c.update(g.contents(**kwargs))
            del c["global_story_id"]

        # Add Derived Attributes
        c["natural_time"] = {
            "en": concise_natural_time(datetime.utcfromtimestamp(c["timestamp"]), lang="en"),
            "he": concise_natural_time(datetime.utcfromtimestamp(c["timestamp"]), lang="he")
        }
        d = c["data"]
        if "publisher_id" in d:
            udata = user_profile.public_user_data(d["publisher_id"])
            d["publisher_name"] = udata["name"]
            d["publisher_url"] = udata["profileUrl"]
            d["publisher_image"] = udata["imageUrl"]
        if "sheet_id" in d:
            from sefaria.sheets import get_sheet_metadata
            metadata = get_sheet_metadata(d["sheet_id"])
            d["sheet_title"] = bleach.clean(metadata["title"], strip=True, tags=()).strip()
            d["sheet_summary"] = bleach.clean(metadata["summary"], strip=True, tags=()).strip()
        return c


class UserStorySet(abst.AbstractMongoSet):
    recordClass = UserStory

    def __init__(self, query=None, page=0, limit=0, sort=None):
        sort = sort or [["timestamp", -1]]
        super(UserStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def _add_global_stories(self, uid):
        """
        Add user Notification records for any new GlobalNotifications
        :return:
        """
        #todo: is there a quicker way to short circuit this, and avoid these queries, when it has recently been updated?
        latest_id_for_user = UserStory.latest_global_for_user(uid)
        latest_global_id = GlobalStory.latest_id()
        if latest_global_id and (latest_global_id != latest_id_for_user):
            if latest_id_for_user is None:
                GlobalStorySet({}, limit=10).register_for_user(uid)
            else:
                GlobalStorySet({"_id": {"$gt": latest_id_for_user}}, limit=10).register_for_user(uid)

    def recent_for_user(self, uid, page=0, limit=10):
        """
        Loads recent notifications for uid.
        """
        self._add_global_stories(uid)
        self.__init__(query={"uid": uid}, page=page, limit=limit)
        return self


