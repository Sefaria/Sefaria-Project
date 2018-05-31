"""
group.py
Writes to MongoDB Collection: groups
"""
from django.utils.translation import ugettext as _

from . import abstract as abst
from sefaria.model.user_profile import public_user_data
from sefaria.system.exceptions import InputError


class Group(abst.AbstractMongoRecord):
    """
    A group of users
    """
    collection = 'groups'
    history_noun = 'group'

    track_pkeys = True
    pkeys = ["name", "headerUrl", "imageUrl", "coverUrl"]

    required_attrs = [
        "name",          # string name of group
        "admins",        # array or uids
        "publishers",    # array of uids
        "members",       # array of uids
    ]
    optional_attrs = [
        "invitations",      # array of dictionaries representing outstanding invitations
        "description",      # string text of short description
        "websiteUrl",       # url for group website
        "headerUrl",        # url of an image to use in header
        "imageUrl",         # url of an image to use as icon
        "coverUrl",         # url of an image to use as cover
        "pinned_sheets",    # list of sheet ids, pinned to top
        "listed",           # Bool, whether to list group publicly
        "moderationStatus", # string status code for moderator-set statuses
        "tag_order",        # list of strings, display order for sheet tags       
    ]

    def _normalize(self):
        website = getattr(self, "websiteUrl", False)
        if website and not website.startswith("https://"):
            if website.startswith("http://"):
                # Only allow HTTPS. If you site doens't support it, deal with it!
                self.websiteUrl = website.replace("http://", "https://")
            else:
                # Allows include protocol
                self.websiteUrl = "https://" + website

    def _validate(self):
        assert super(Group, self)._validate()

        if getattr(self, "listed", False):
            if not getattr(self, "imageUrl", False):
                raise InputError(_("Public Groups are required to include a group image (a square image will work best)."))
            contents = self.contents(with_content=True)
            if len(contents["sheets"]) < 3:
                raise InputError(_("Public Groups are required to have at least 3 public sheets."))

        return True

    def _pre_save(self):
        image_fields = ("imageUrl", "headerUrl", "coverUrl")
        for field in image_fields:
            old, new = self.pkeys_orig_values.get(field, None), getattr(self, field, None)
            if old != new:
                self._handle_image_change(old, new)

    def contents(self, with_content=False, authenticated=False):
        from sefaria.sheets import group_sheets, sheet_tag_counts
        contents = super(Group, self).contents()
        if with_content: 
            contents["sheets"]       = group_sheets(self.name, authenticated)["sheets"]
            contents["tags"]         = sheet_tag_counts({"group": self.name})
            contents["admins"]       = [public_user_data(uid) for uid in contents["admins"]]
            contents["publishers"]   = [public_user_data(uid) for uid in contents["publishers"]]
            contents["members"]      = [public_user_data(uid) for uid in contents["members"]]
            contents["invitations"]  = getattr(self, "invitations", []) if authenticated else []
            contents["pinnedSheets"] = getattr(self, "pinned_sheets", [])
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

    def invite_member(self, email, inviter, role="member"):
        """
        Invites a person by email to sign up for a Sefaria and join a group. 
        Creates on outstanding inviations record for `email` / `role` 
        and sends an invitation to `email`.
        """
        self.remove_invitation(email)
        self.invitations = [{"email": email, "role": role}] + self.invitations 
        self.send_invitation(email, inviter)
        self.save()

    def remove_invitation(self, email):
        """
        Removes any outstanding invitations for `email`.
        """
        if not getattr(self, "invitations", None):
            self.invitations = []
        else:
            self.invitations = [invite for invite in self.invitations if invite["email"] != email]
        self.save()

    def send_invitation(self, email, inviter_id):
        """
        Sends an email inviation to `email` from `invited_id`.
        """
        from django.core.mail import EmailMultiAlternatives
        from django.template.loader import render_to_string
        from sefaria.model import UserProfile

        inviter       = UserProfile(id=inviter_id)
        message_html  = render_to_string("email/group_signup_invitation_email.html", 
                                        {
                                            "inviter": inviter.full_name,
                                            "groupName": self.name,
                                            "registerUrl": "/register?next=%s" % self.url
                                        })
        subject       = "%s invited you to join a group on Sefaria" % (inviter.full_name)
        from_email    = "Sefaria <hello@sefaria.org>"
        to            = email

        msg = EmailMultiAlternatives(subject, message_html, from_email, [to])
        msg.content_subtype = "html"  # Main content is now text/html
        msg.send()

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

    @property
    def url(self):
        """Returns the URL path for this group"""
        return "/groups/%s" % self.name.replace(" ", "-")

    def pin_sheet(self, sheet_id):
        """
        Adds or removes `sheet_id` from the list of pinned sheets
        """
        self.pinned_sheets = getattr(self, "pinned_sheets", [])
        if sheet_id in self.pinned_sheets:
            self.pinned_sheets = [id for id in self.pinned_sheets if id != sheet_id]
        else:
            self.pinned_sheets = [sheet_id] + self.pinned_sheets
        self.save()

    def _handle_image_change(self, old, new):
        """
        When image fields change:
        1) delete images that are no longer referenced
        2) remove new images from the orphaned files list.
        """
        from sefaria.s3 import HostedFile

        if old:
            HostedFile(url=old).delete()
        if new:
            HostedFile(url=new).remove_from_orphaned_list()


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