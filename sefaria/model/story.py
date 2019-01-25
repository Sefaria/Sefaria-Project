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


class Story(abst.AbstractMongoRecord):

    def _normalize(self):
        pass

    def _validate(self):
        pass

    def _init_defaults(self):
        pass

    def toJSON(self):
        pass   # needed?


class GlobalStory(Story):

    collection   = 'global_story'
    history_noun = 'global story'

    required_attrs = [
        "storyForm",
        "data",
        "timestamp",
    ]

    optional_attrs = [
    ]


class GlobalStorySet(abst.AbstractMongoSet):
    recordClass = GlobalStory


class UserStory(Story):

    collection   = 'user_story'
    history_noun = 'user story'

    required_attrs = [
        "is_global",
        "timestamp"
    ]

    optional_attrs = [
        "global_story_id",
        "storyForm",
        "data"
    ]

    def _validate(self):
        if self.is_global:
            assert self.global_story_id is not None

    def contents(self, **kwargs):
        c = super(UserStory, self).contents(**kwargs)
        if self.is_global:
            g = GlobalStory().load_by_id(self.global_story_id)
            c.update(g.contents(**kwargs))
        return c


class UserStorySet(abst.AbstractMongoSet):
    recordClass = UserStory
