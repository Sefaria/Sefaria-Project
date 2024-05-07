"""
collections.py
Writes to MongoDB Collection: groups
"""
import bleach
import re
import secrets
from datetime import datetime

from django.utils import translation
from django.utils.translation import ugettext as _

from . import abstract as abst
from sefaria.model.user_profile import public_user_data
from sefaria.system.exceptions import InputError
from sefaria.utils.tibetan import has_tibetan

class Collection(abst.AbstractMongoRecord):
    """
    A collection of source sheets
    """
    collection = 'groups'
    history_noun = 'group'

    track_pkeys = True
    pkeys = ["name", "slug", "listed", "headerUrl", "imageUrl", "coverUrl"]

    required_attrs = [
        "name",          # string name of collection
        "sheets",        # list of sheet ids included in this collection
        "slug",          # string of url slug
        "lastModified",  # Datetime of the last time this collection changed
        "admins",        # list of uids
        "members",       # list of uids
    ]
    optional_attrs = [
        "privateSlug",   # string of url slug that was previously used when collection was private
        "publishers",       # list of uids TODO remove post collections launch
        "invitations",      # list of dictionaries representing outstanding invitations
        "description",      # string text of short description
        "websiteUrl",       # url of a website displayed on this collection
        "headerUrl",        # url of an image to use in header
        "imageUrl",         # url of an image to use as icon
        "coverUrl",         # url of an image to use as cover
        "pinned_sheets",    # list of sheet ids, pinned to top
        "listed",           # Bool, whether to list collection publicly
        "moderationStatus", # string status code for moderator-set statuses
        "pinnedTags",       # list of strings, display order for sheet tags
        "showTagsByDefault",# Bool, whether to default to opening tags list
        "toc",              # object signaling inclusion in TOC with fields
                                # `categories` - list
                                # `title` - string
                                # `heTitle` - string
                                # `collectiveTitle` - optional dictionary with `en`, `he`, overiding title display in TOC/Sidebar.
                                # `desscription` - string
                                # `heDescription` - string
                                # `enShortDesc` - string
                                # `heShortDesc` - string
                                # `dependence` - string - "Commentary" or "Targum"
                                # These fields will override `name` and `description` for display
    ]

    def _normalize(self):
        if not getattr(self, "slug", None):
            self.assign_slug()

        defaults = (("members", []), ("sheets", []))
        for default in defaults:
            if not hasattr(self, default[0]):
                setattr(self, default[0], default[1])

        self.lastModified = datetime.now()

        website = getattr(self, "websiteUrl", False)
        if website and not website.startswith("https://"):
            if website.startswith("http://"):
                # Only allow HTTPS. If you site doesn't support it, deal with it!
                self.websiteUrl = website.replace("http://", "https://")
            else:
                self.websiteUrl = "https://" + website

        toc = getattr(self, "toc", None)
        if toc:
            tags = ["b", "i", "br", "span"]
            attrs = {"span": ["class"]}
            toc["description"] = bleach.clean(toc["description"], tags=tags, attributes=attrs)
            toc["heDescription"] = bleach.clean(toc["heDescription"], tags=tags, attributes=attrs)

    def _validate(self):
        assert super(Collection, self)._validate()

        if len(self.name) == 0:
            raise InputError(_("Please set a name for your collection."))

        return True

    def _pre_save(self):
        old_status, new_status = self.pkeys_orig_values.get("listed", None), getattr(self, "listed", None)
        if new_status and not old_status:
            # Collection is being published, assign a new slug, but save the old one for link stability
            self.privateSlug = self.slug
            self.assign_slug()

        if old_status and not new_status:
            # Public collection is going back to private, restore old slug
            if getattr(self, "privateSlug", None):
                self.slug = self.privateSlug
            else:
                self.assign_slug()

        if new_status and not old_status:
            # At moment of publishing, make checks for special requirements on public collections
            # Don't make these checks on every save so a collection can't get stuck in a state where 
            # it can't be change even to add a new public sheet. 
            if self.name_taken():
                # Require public collections to have a unique name
                raise InputError(_("A public collection with this name already exists. Please choose a different name before publishing."))
            if not getattr(self, "imageUrl", False):
                raise InputError(_("Public Collections are required to include a collection image (a square image will work best)."))
            if self.public_sheet_count() < 3:
                raise InputError(_("Public Collections are required to have at least 3 public sheets."))


        image_fields = ("imageUrl", "headerUrl", "coverUrl")
        for field in image_fields:
            old, new = self.pkeys_orig_values.get(field, None), getattr(self, field, None)
            if old != new:
                self._handle_image_change(old)

    def assign_slug(self):
        """
        Assign a slug for the collection. For public collections based on the collection 
        name, for private collections a random string.
        """
        if getattr(self, "listed", False):
            slug = self.name
            slug = slug.lower()
            slug = slug.strip()
            slug = slug.replace(" ", "-")
            slug = re.sub(r"[^a-z\u05D0-\u05ea0-9\-]", "", slug)
            self.slug = slug
            dupe_count = 0
            while self.slug_taken():
                dupe_count += 1
                self.slug = "%s%d" % (slug, dupe_count)
        else:
            while True:
                self.slug = secrets.token_urlsafe(6)
                if not self.slug_taken():
                    break

    def slug_taken(self):
        existing = Collection().load({"slug": self.slug})
        return bool(existing) and existing._id != getattr(self, "_id", None)

    def name_taken(self):
        existing = Collection().load({"name": self.name, "listed": True})
        return bool(existing) and existing._id != getattr(self, "_id", None)

    def all_names(self, lang):
        primary_name = self.primary_name(lang)
        names = [primary_name] if primary_name else []

        if hasattr(self, "toc"):
            names += [self.toc["title"]] if lang == "en" else [self.toc["heTitle"]]
            names += [self.toc["collectiveTitle"][lang]] if "collectiveTitle" in self.toc else []

        return list(set(names))

    def primary_name(self, lang):
        return self.name if (has_tibetan(self.name) == (lang == "he")) else None

    def contents(self, with_content=False, authenticated=False):
        from sefaria.sheets import sheet_topics_counts
        contents = super(Collection, self).contents()
        if with_content:
            contents["sheets"]       = self.sheet_contents(authenticated=authenticated)
            contents["admins"]       = [public_user_data(uid) for uid in contents["admins"]]
            contents["members"]      = [public_user_data(uid) for uid in contents["members"]]
            contents["lastModified"] = str(self.lastModified)
            contents["invitations"]  = getattr(self, "invitations", []) if authenticated else []
            contents["pinnedSheets"] = getattr(self, "pinned_sheets", [])
            contents["pinnedTags"]   = getattr(self, "pinnedTags", [])
        return contents

    def listing_contents(self, uid=None):
        contents = {
            "name": self.name,
            "slug": self.slug,
            "description": getattr(self, "description", None),
            "imageUrl": getattr(self, "imageUrl", None),
            "headerUrl": getattr(self, "headerUrl", None),
            "memberCount": self.member_count(),
            "sheetCount": self.sheet_count(),
            "lastModified": str(self.lastModified),
            "listed": getattr(self, "listed", False),
        }
        if uid is not None:
            contents["membership"] = self.membership_role(uid)
        return contents

    def sheet_contents(self, authenticated=False):
        from sefaria.sheets import sheet_list
        if authenticated is False and getattr(self, "listed", False):
            query = {"status": "public", "id": {"$in": self.sheets}}
        else:
            query = {"status": {"$in": ["unlisted", "public"]}, "id": {"$in": self.sheets}}

        return sheet_list(query=query)

    def membership_role(self, uid):
        """
        Get membership level in collection
        :param uid:
        :return: either "member", "admin"
        """
        if uid in self.members:
            return "member"
        if uid in self.admins:
            return "admin"
        return None

    def add_member(self, uid, role="member"):
        """
        Adds `uid` as member of the collection in `role`.
        If `uid` is already a member, changes their role to `role`.
        """
        self.remove_member(uid)
        if role == "admin":
            self.admins.append(uid)
        else:
            self.members.append(uid)
        self.save()

    def remove_member(self, uid):
        """
        Remove `uid` from this collection.
        """
        self.admins  = [user_id for user_id in self.admins if user_id != uid]
        self.members = [user_id for user_id in self.members if user_id != uid]
        self.save()

    def invite_member(self, email, inviter, role="member"):
        """
        Invites a person by email to sign up for a Sefaria and join a collection.
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
        curr_lang     = translation.get_language()
        try:
            translation.activate(inviter.settings["interface_language"][0:2])
            message_html  = render_to_string("email/collection_signup_invitation_email.html",
                                            {
                                                "inviter": inviter.full_name,
                                                "collection_slug": self.slug,
                                                "registerUrl": "/register?next=%s" % self.url
                                            })
        finally:
            translation.activate(curr_lang)
        subject       = _("%(name)s invited you to a collection on Sefaria") % {'name': inviter.full_name}
        from_email    = "Sefaria <hello@sefaria.org>"
        to            = email

        msg = EmailMultiAlternatives(subject, message_html, from_email, [to])
        msg.content_subtype = "html"  # Main content is now text/html
        msg.send()

    def all_members(self):
        """
        Returns a list of all collection members, regardless of sole
        """
        return (self.admins + self.members)

    def is_member(self, uid):
        """
        Returns True if `uid` is a member of this collection, in any role
        """
        return uid in self.all_members()

    def member_count(self):
        """Returns the number of members in this collection"""
        return len(self.all_members())

    def sheet_count(self):
        """Returns the number of sheets in this collection"""
        return len(self.sheets)

    def public_sheet_count(self):
        """Returns the number of public sheets in this collection"""
        from sefaria.sheets import SheetSet
        return SheetSet({"id": {"$in": self.sheets}, "status": "public"}).count()      

    @property
    def url(self):
        """Returns the URL path for this collection"""
        return "/collections/{}".format(self.slug)

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

    def _handle_image_change(self, old_url):
        """
        When image fields change:
        delete images that are no longer referenced
        """
        from sefaria.google_storage_manager import GoogleStorageManager
        bucket_name = GoogleStorageManager.COLLECTIONS_BUCKET
        if isinstance(old_url, str) and re.search("^https?://storage\.googleapis\.com/", old_url):  # only try to delete images in google cloud storage
            GoogleStorageManager.delete_filename(old_url, bucket_name)



class CollectionSet(abst.AbstractMongoSet):
    recordClass = Collection

    def for_user(self, uid, private=True):
        query = {"$or": [{"admins": uid}, {"members": uid}]}
        if not private:
            query["listed"] = True
        self.__init__(query, sort=[("lastModified", -1)])
        return self

    @classmethod
    def get_collection_listing(cls, userid):
        return {
            "private": [g.listing_contents() for g in cls().for_user(userid)],
            "public": [g.listing_contents() for g in
                       CollectionSet({"listed": True, "moderationStatus": {"$ne": "nolist"}}, sort=[("name", 1)])]
        }


def process_collection_slug_change_in_sheets(collection, **kwargs):
    """
    When a collections's slug changes, update all the sheets that have this collection as `displayedCollection`
    """
    from sefaria.system.database import db

    if not kwargs["old"]:
        return
    db.sheets.update_many({"displayedCollection": kwargs["old"]}, {"$set": {"displayedCollection": kwargs["new"]}})


def process_collection_delete_in_sheets(collection, **kwargs):
    """
    When a collection deleted, move any sheets out of the collection.
    """
    from sefaria.system.database import db
    db.sheets.update_many({"displayedCollection": collection.slug}, {"$set": {"displayedCollection": ""}})


def process_sheet_deletion_in_collections(sheet_id):
    """
    When a sheet is deleted remove it from any collections.
    Note: this function is not tied through dependencies.py (since Sheet mongo model isn't generlly used),
    but is called directly from sheet deletion view in sourcesheets/views.py. 
    """
    cs = CollectionSet({"sheets": sheet_id})
    for c in cs:
        c.sheets = [s for s in c.sheets if s != sheet_id]
        c.save()
