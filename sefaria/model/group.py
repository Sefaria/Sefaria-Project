"""
group.py
Writes to MongoDB Collection: groups
"""
from . import abstract as abst

import logging
logger = logging.getLogger(__name__)


class Group(abst.AbstractMongoRecord):
    """
    A group of users
    """
    collection = 'groups'
    history_noun = 'group'

    required_attrs = [
        "name",        # string name of group
    ]
    optional_attrs = [
        "description", # string text of short description
        "websiteUrl",  # url for group website
        "headerUrl",   # url of an image to use in header
        "coverUrl",    # url of an image to use as cover
        "iconUrl",     # url of an image to use as icon
        "tag_order",   # list of strings, display order for sheet tags       
    ]

    def _normalize(self):
        pass

    def _validate(self):
        return True


class GroupSet(abst.AbstractMongoSet):
    recordClass = Group
