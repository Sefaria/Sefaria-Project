"""
group.py
Writes to MongoDB Collection: groups
"""
from . import abstract as abst
from sefaria.sheets import group_sheets, sheet_tag_counts
from sefaria.model.user_profile import public_user_data

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
        "admins",      # array or uids
        "publishers",  # array of uids
        "members",     # array of uids
        "description", # string text of short description
        "websiteUrl",  # url for group website
        "headerUrl",   # url of an image to use in header
        "coverUrl",    # url of an image to use as cover
        "imageUrl",    # url of an image to use as icon
        "iconUrl",     # TODO Remove
        "listed",      # Bool, whether to list group publicly
        "tag_order",   # list of strings, display order for sheet tags       
    ]

    def _normalize(self):
        pass

    def _validate(self):
        return True

    def contents(self, with_content=False, authenticated=False):
        contents = super(Group, self).contents()
        if with_content:
            contents["sheets"]     = group_sheets(self.name, authenticated)["sheets"]
            contents["tags"]       = sheet_tag_counts({"group": self.name})
            contents["admins"]     = [public_user_data(uid) for uid in contents["admins"]]
            contents["publishers"] = [public_user_data(uid) for uid in contents["publishers"]]
            contents["members"]    = [public_user_data(uid) for uid in contents["members"]]
        return contents

    def listing_contents(self):
        contents = {
            "name": self.name,
            "imageUrl": getattr(self, "imageUrl", None),
            "memberCount": self.member_count()
        }
        return contents

    def all_members(self):
        """
        Returns a list of all group members, regardless of sole
        """
        return (self.admins + self.publishers + self.members)

    def is_member(self, uid):
        """
        Returns true if `uid` is a member of this group, in any role
        """
        return uid in self.all_members()

    def member_count(self):
        return len(self.all_members())


class GroupSet(abst.AbstractMongoSet):
    recordClass = Group

    def for_user(self, uid):
        self.__init__({"$or": [{"admins": uid}, {"publishers": uid}, {"members": uid}]}, sort=[("name", 1)])
        return self
