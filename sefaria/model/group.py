"""
group.py
Writes to MongoDB Collection: groups
"""
from . import abstract as abst
from sefaria.model.user_profile import public_user_data

import logging
logger = logging.getLogger(__name__)


class Group(abst.AbstractMongoRecord):
    """
    A group of users
    """
    collection = 'groups'
    history_noun = 'group'

    track_pkeys = True
    pkeys = ["name"]

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
        "listed",      # Bool, whether to list group publicly
        "tag_order",   # list of strings, display order for sheet tags       
    ]

    def _normalize(self):
        pass

    def _validate(self):
        return True

    def contents(self, with_content=False, authenticated=False):
        from sefaria.sheets import group_sheets, sheet_tag_counts
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
            "memberCount": self.member_count(),
            "sheetCount": self.sheet_count(),
        }
        return contents

    def add_member(self, uid, role="member"):
        """
        Adds `uid` as member of the group in `role`.
        If `uid` is already a member, changes their role to `role`.
        """
        self.remove_member(uid)
        if role == "admin":
            self.admins.append(uid)
        elif role == "publisher":
            self.publishers.append(uid)
        else:
            self.members.append(uid)
        self.save()
        
    def remove_member(self, uid):
        """
        Remove `uid` from this group.
        """
        self.admins     = [user_id for user_id in self.admins if user_id != uid]
        self.publishers = [user_id for user_id in self.publishers if user_id != uid]
        self.members    = [user_id for user_id in self.members if user_id != uid]
        self.save()

    def all_members(self):
        """
        Returns a list of all group members, regardless of sole
        """
        return (self.admins + self.publishers + self.members)

    def is_member(self, uid):
        """
        Returns True if `uid` is a member of this group, in any role
        """
        return uid in self.all_members()

    def can_publish(self, uid):
        """ Returns True if `uid` has permission to publish sheets in this group"""
        return uid in (self.admins + self.publishers)

    def member_count(self):
        """Returns the number of members in this group"""
        return len(self.all_members())

    def sheet_count(self):
        """Returns the number of sheets in this group"""
        from sefaria.system.database import db
        return db.sheets.find({"group": self.name}).count()


class GroupSet(abst.AbstractMongoSet):
    recordClass = Group

    def for_user(self, uid):
        self.__init__({"$or": [{"admins": uid}, {"publishers": uid}, {"members": uid}]}, sort=[("name", 1)])
        return self


def process_group_name_change_in_sheets(group, **kwargs):
    """
    When a group's name changes, update all the sheets in this group to follow
    """
    from sefaria.system.database import db

    db.sheets.update_many({"group": kwargs["old"]}, {"$set": {"group": kwargs["new"]}})


def process_group_delete_in_sheets(group, **kwargs):
    """
    When a group deleted, move any sheets out of the group.
    """
    from sefaria.system.database import db
    db.sheets.update_many({"group": group.name}, {"$set": {"group": ""}})