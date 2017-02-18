"""
group.py
Writes to MongoDB Collection: groups
"""
from . import abstract as abst
from sefaria.sheets import group_sheets, sheet_tag_counts

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

    def contents(self, with_content=False, authenticated=False):
        contents = super(Group, self).contents()
        if with_content:
            contents["sheets"]  = group_sheets(self.name, authenticated)["sheets"]
            contents["tags"]    = sheet_tag_counts({"group": self.name})
            contents["members"] = []
        return contents


class GroupSet(abst.AbstractMongoSet):
    recordClass = Group
