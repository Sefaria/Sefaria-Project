# -*- coding: utf-8 -*-

"""
notifications.py - handle user event notifications

Writes to MongoDB Collection: notifications
"""

import re
import json
import time

from django.template.loader import render_to_string

from . import abstract as abst
from . import user_profile
from sefaria.system.database import db
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



class GlobalStorySet(abst.AbstractMongoSet):
    recordClass = GlobalStory


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

    def __init__(self, attrs=None, global_story=None, uid=None):
        super(UserStory, self).__init__(attrs)
        if uid is not None:
            self.uid = uid
        if global_story is not None:
            self.is_global = True
            self.global_story_id = global_story._id

    def _init_defaults(self):
        self.timestamp = int(time.time())
        self.is_global = False

    def _validate(self):
        if self.is_global:
            assert self.global_story_id is not None
        else:
            assert self.data
            assert self.storyForm

    def contents(self, **kwargs):
        c = super(UserStory, self).contents(**kwargs)
        if self.is_global:
            g = GlobalStory().load_by_id(self.global_story_id)
            c.update(g.contents(**kwargs))
        return c


class UserStorySet(abst.AbstractMongoSet):
    recordClass = UserStory
