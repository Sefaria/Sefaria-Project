import hashlib
import urllib
import re
import bleach
import sys
import json
import csv
from datetime import datetime
from random import randint

if not hasattr(sys, '_doc_build'):
    from django.contrib.auth.models import User
    from django.core.mail import EmailMultiAlternatives
    from django.template.loader import render_to_string
    from django.core.validators import URLValidator, EmailValidator
    from django.core.exceptions import ValidationError
    from anymail.exceptions import AnymailRecipientsRefused

from . import abstract as abst
from sefaria.model.following import FollowersSet, FolloweesSet
from sefaria.model.text import Ref
from sefaria.system.database import db
from sefaria.utils.util import epoch_time
from django.utils import translation
from sefaria.settings import PARTNER_GROUP_EMAIL_PATTERN_LOOKUP_FILE


class UserHistory(abst.AbstractMongoRecord):
    collection = 'user_history'

    required_attrs = [
        "uid",                # user id
        "ref",                # str
        "he_ref",             # str
        "versions",           # dict: {en: str, he: str}
        "time_stamp",         # int: time this ref was read in epoch time
        "server_time_stamp",  # int: time this was saved on the server in epoch time
        "last_place",         # bool: True if this is the last ref read for this user in this book
        "book",               # str: index title
        "saved",              # bool: True if saved
        "secondary",          # bool: True when view is from sidebar
    ]

    optional_attrs = [
        "language",           # oneOf(english, hebrew, bilingual) didn't exist in legacy model
        "num_times_read",     # int: legacy for migrating old recent views
        "sheet_title",        # str: for sheet history
        "sheet_owner",        # str: ditto
    ]

    def __init__(self, attrs=None, load_existing=False, field_updates=None, update_last_place=False):
        """

        :param attrs:
        :param load_existing: True if you want to load an existing mongo record if it exists to avoid duplicates
        :param field_updates: dict of updates in case load_existing finds a record
        """
        if attrs is None:
            attrs = {}
        # set defaults
        if "saved" not in attrs:
            attrs["saved"] = False
        if "secondary" not in attrs:
            attrs["secondary"] = False
        if "last_place" not in attrs:
            attrs["last_place"] = False
        # remove empty versions
        for k, v in attrs.get("versions", {}).items():
            if v is None:
                del attrs["versions"][k]
        if load_existing:
            temp = UserHistory().load({"uid": attrs["uid"], "ref": attrs["ref"], "versions": attrs["versions"]})
            if temp is not None:
                attrs = temp._saveable_attrs()
            # in the race-condition case where you're creating the saved item before the history item, do the update outside the previous if
            if field_updates:
                attrs.update(field_updates)
        if update_last_place:
            temp = UserHistory().load({"uid": attrs["uid"], "book": attrs["book"], "last_place": True})
            if temp is not None:
                temp.last_place = False
                temp.save()
            attrs["last_place"] = True

        super(UserHistory, self).__init__(attrs=attrs)

    def contents(self, **kwargs):
        d = super(UserHistory, self).contents(**kwargs)
        if kwargs.get("for_api", False):
            try:
                del d["uid"]
            except KeyError:
                pass
            try:
                del d["server_time_stamp"]
            except KeyError:
                pass
        return d

    def _sanitize(self):
        # UserHistory API is only open to post for your uid
        pass

    @classmethod
    def save_history_item(cls, uid, hist, time_stamp=None):
        if time_stamp is None:
            time_stamp = epoch_time()
        hist["uid"] = uid
        if "he_ref" not in hist or "book" not in hist:
            oref = Ref(hist["ref"])
            hist["he_ref"] = oref.he_normal()
            hist["book"] = oref.index.title
        hist["server_time_stamp"] = time_stamp if "server_time_stamp" not in hist else hist["server_time_stamp"]  # DEBUG: helpful to include this field for debugging

        action = hist.pop("action", None)
        saved = True if action == "add_saved" else (False if action == "delete_saved" else hist.get("saved", False))
        uh = UserHistory(hist, load_existing=(action is not None), update_last_place=(action is None), field_updates={
            "saved": saved,
            "server_time_stamp": hist["server_time_stamp"]
        })
        uh.save()
        return uh

    @staticmethod
    def get_user_history(uid=None, oref=None, saved=None, secondary=None, last_place=None, serialized=False):
        query = {}
        if uid is not None:
            query["uid"] = uid
        if oref is not None:
            regex_list = oref.context_ref().regex(as_list=True)
            ref_clauses = [{"ref": {"$regex": r}} for r in regex_list]
            query["$or"] = ref_clauses
        if saved is not None:
            query["saved"] = saved
        if secondary is not None:
            query["secondary"] = secondary
        if last_place is not None:
            query["last_place"] = last_place
        if serialized:
            return [uh.contents() for uh in UserHistorySet(query, proj={"uid": 0, "server_time_stamp": 0}, sort=[("time_stamp", -1)])]
        return UserHistorySet(query, sort=[("time_stamp", -1)])


class UserHistorySet(abst.AbstractMongoSet):
    recordClass = UserHistory


class UserProfile(object):
    def __init__(self, id=None, slug=None, email=None):

        if slug:  # Load profile by slug, if passed
            profile = db.profiles.find_one({"slug": slug})
            if profile:
                self.__init__(id=profile["id"])
                return

        try:
            if email and not id:  # Load profile by email, if passed.
                user = User.objects.get(email__iexact=email)
                id = user.id
            else:
                user = User.objects.get(id=id)
            self.first_name        = user.first_name
            self.last_name         = user.last_name
            self.email             = user.email
            self.date_joined       = user.date_joined
        except:
            # These default values allow profiles to function even
            # if the Django User records are missing (for testing)
            self.first_name        = "User"
            self.last_name         = str(id)
            self.email             = "test@sefaria.org"
            self.date_joined       = None

        self._id                   = None  # Mongo ID of profile doc
        self.id                    = id    # user ID
        self.slug                  = ""
        self.position              = ""
        self.organization          = ""
        self.jewish_education      = []
        self.bio                   = ""
        self.website               = ""
        self.location              = ""
        self.public_email          = ""
        self.youtube               = ""
        self.facebook              = ""
        self.twitter               = ""
        self.linkedin              = ""
        self.pinned_sheets         = []
        self.interrupting_messages = ["newUserWelcome"]
        self.partner_group        = ""
        self.partner_role         = ""
        self.last_sync_web        = 0  # epoch time for last sync of web app

        self.settings     =  {
            "email_notifications": "daily",
            "interface_language": "english",
            "textual_custom" : "sephardi"
        }
        # dict that stores the last time an attr has been modified
        self.attr_time_stamps = {
            "settings": 0
        }

        self._name_updated      = False


        # Update with saved profile doc in MongoDB
        profile = db.profiles.find_one({"id": id})
        profile = self.migrateFromOldRecents(profile)
        if profile:
            self.update(profile)

        # Followers
        self.followers = FollowersSet(self.id)
        self.followees = FolloweesSet(self.id)

        # Gravatar
        default_image           = "https://www.sefaria.org/static/img/profile-default.png"
        gravatar_base           = "https://www.gravatar.com/avatar/" + hashlib.md5(self.email.lower()).hexdigest() + "?"
        self.gravatar_url       = gravatar_base + urllib.urlencode({'d':default_image, 's':str(250)})
        self.gravatar_url_small = gravatar_base + urllib.urlencode({'d':default_image, 's':str(80)})

    @property
    def full_name(self):
        return self.first_name + " " + self.last_name

    def _set_flags_on_update(self, obj):
        if "first_name" in obj or "last_name" in obj:
            if self.first_name != obj["first_name"] or self.last_name != obj["last_name"]:
                self._name_updated = True

    @staticmethod
    def transformOldRecents(uid, recents):
        from dateutil import parser
        from sefaria.system.exceptions import InputError
        import pytz
        default_epoch_time = epoch_time(
            datetime(2017, 12, 1))  # the Sefaria epoch. approx time since we added time stamps to recent items

        def xformer(recent):
            try:
                return {
                    "uid": uid,
                    "ref": recent[0],
                    "he_ref": recent[1],
                    "book": Ref(recent[0]).index.title,
                    "last_place": True,
                    "time_stamp": epoch_time(parser.parse(recent[2]).replace(tzinfo=None)) if recent[2] is not None else default_epoch_time,
                    "server_time_stamp": epoch_time(parser.parse(recent[2]).replace(tzinfo=None)) if recent[2] is not None else default_epoch_time,
                    "num_times_read": (recent[3] if recent[3] and isinstance(recent[3], int) else 1),  # we dont really know how long they've read this book. it's probably correlated with the number of times they opened the book
                    "versions": {
                        "en": recent[4],
                        "he": recent[5]
                    }
                }
            except InputError:
                return None
            except ValueError:
                return None
            except IndexError:
                return None
            except AttributeError:
                return None
        return filter(None, [xformer(r) for r in recents])

    def migrateFromOldRecents(self, profile):
        """
        migrate from recentlyViewed which is a flat list and only saves one item per book to readingHistory, which is a dict and saves all reading history
        """
        if profile is None:
            profile = {}  # for testing, user doesn't need to exist
        if "recentlyViewed" in profile:
            user_history = self.transformOldRecents(self.id, profile['recentlyViewed'])
            for temp_uh in user_history:
                uh = UserHistory(temp_uh)
                uh.save()
            profile.pop('recentlyViewed', None)
            db.profiles.find_one_and_update({"id": self.id}, {"$unset": {"recentlyViewed": True}})
            self.save()
        return profile

    def update_attr_time_stamps(self, obj):
        if "settings" in obj:
            settings_changed = False
            for k, v in obj["settings"].items():
                if k not in self.settings:
                    settings_changed = True
                elif v != self.settings[k]:
                    settings_changed = True
            if settings_changed:
                obj["attr_time_stamps"] = obj.get("attr_time_stamps", {})
                obj["attr_time_stamps"]["settings"] = epoch_time()

    def update(self, obj):
        """
        Update this object with the fields in dictionry 'obj'
        """
        self._set_flags_on_update(obj)
        self.update_attr_time_stamps(obj)
        self.__dict__.update(obj)

        return self

    def update_empty(self, obj):
        self._set_flags_on_update(obj)
        for k, v in obj.items():
            if v:
                if k not in self.__dict__ or self.__dict__[k] == '' or self.__dict__[k] == []:
                    self.__dict__[k] = v

    def save(self):
        """
        Save profile to DB, updated Django User object if needed
        """
        # Sanitize & Linkify fields that allow HTML
        self.bio = bleach.linkify(self.bio)

        d = self.to_DICT()
        if self._id:
            d["_id"] = self._id
        db.profiles.save(d)

        # store name changes on Django User object
        if self._name_updated:
            user = User.objects.get(id=self.id)
            user.first_name = self.first_name
            user.last_name  = self.last_name
            user.save()
            self._name_updated = False

        return self

    def errors(self):
        """
        Returns a string with any validation errors,
        or None if the profile is valid.
        """
        # Slug
        if re.search("[^a-z0-9\-]", self.slug):
            return "Profile URLs may only contain lowercase letters, numbers and hyphens."

        existing = db.profiles.find_one({"slug": self.slug, "_id": {"$ne": self._id}})
        if existing:
            return "The Profile URL you have requested is already in use."
        # URL Fields: website, facebook, linkedin
        url_val = URLValidator()
        try:
            if self.facebook: url_val(self.facebook)
        except ValidationError, e:
            return "The Facebook URL you entered is not valid."
        try:
            if self.linkedin: url_val(self.linkedin)
        except ValidationError, e:
            return "The LinkedIn URL you entered is not valid."
        try:
            if self.website: url_val(self.website)
        except ValidationError, e:
            return "The Website URL you entered is not valid."
        email_val = EmailValidator()
        try:
            if self.email: email_val(self.email)
        except ValidationError, e:
            return "The email address you entered is not valid."

        return None

    def exists(self):
        """
        Returns True if this is a real existing user, not simply a mock profile.
        """
        return bool(self.date_joined)

    def assign_slug(self):
        """
        Set the slug according to the profile name,
        using the first available number at the end if duplicated exist
        """
        slug = "%s-%s" % (self.first_name, self.last_name)
        slug = slug.lower()
        slug = slug.replace(" ", "-")
        slug = re.sub(r"[^a-z0-9\-]", "", slug)
        self.slug = slug
        dupe_count = 0
        while self.errors():
            dupe_count += 1
            self.slug = "%s%d" % (slug, dupe_count)

        return self

    def add_partner_group_by_email(self):
        """
        Sets the partner group if email pattern matches known school
        """
        email_pattern = self.email.split("@")[1]
        tsv_file = csv.reader(open(PARTNER_GROUP_EMAIL_PATTERN_LOOKUP_FILE, "rb"), delimiter="\t")
        for row in tsv_file:
            # if current rows 2nd value is equal to input, print that row
            if email_pattern == row[1]:
                self.partner_group = row[0]
                return self
        return self

    def join_invited_groups(self):
        """
        Add this user as a member of any group for which there is an outstanding invitation.
        """
        from sefaria.model import GroupSet
        groups = GroupSet({"invitations.email": self.email})
        for group in groups:
            group.add_member(self.id)
            group.remove_invitation(self.email)

    def follows(self, uid):
        """Returns true if this user follows uid"""
        return uid in self.followees.uids

    def followed_by(self, uid):
        """Returns true if this user is followed by uid"""
        return uid in self.followers.uids

    def recent_notifications(self):
        from sefaria.model.notification import NotificationSet
        return NotificationSet().recent_for_user(self.id)

    def unread_notification_count(self):
        return unread_notifications_count_for_user(self.id)

    def interrupting_message(self):
        """
        Returns the next message to interupt the user with, if any are queued up.
        """
        messages = self.interrupting_messages
        return messages[0] if len(messages) > 0 else None

    def mark_interrupting_message_read(self, message):
        """
        Removes `message` from the users list of queued interrupting_messages.
        """
        if message in self.interrupting_messages:
            self.interrupting_messages.remove(message)
            self.save()

    def get_user_history(self, oref=None, saved=None, secondary=None, last_place=None, serialized=False):
        """
        personal user history
        :param oref:
        :param saved: True if you only want saved. False if not. None if you dont care
        :param secondary: ditto
        :param last_place: ditto
        :param serialized: for return from API call
        :return:
        """
        return UserHistory.get_user_history(uid=self.id, oref=oref, saved=saved, secondary=secondary, last_place=last_place, serialized=serialized)


    def to_DICT(self):
        """Return a json serializble dictionary this profile"""
        dictionary = {
            "id":                    self.id,
            "slug":                  self.slug,
            "position":              self.position,
            "organization":          self.organization,
            "jewish_education":      self.jewish_education,
            "bio":                   self.bio,
            "website":               self.website,
            "location":              self.location,
            "public_email":          self.public_email,
            "facebook":              self.facebook,
            "twitter":               self.twitter,
            "linkedin":              self.linkedin,
            "youtube":               self.youtube,
            "pinned_sheets":         self.pinned_sheets,
            "settings":              self.settings,
            "attr_time_stamps":      self.attr_time_stamps,
            "interrupting_messages": getattr(self, "interrupting_messages", []),
            "tag_order":             getattr(self, "tag_order", None),
            "partner_group":         self.partner_group,
            "partner_role":          self.partner_role,
            "last_sync_web":         self.last_sync_web,
        }
        return dictionary

    def to_JSON(self):
        return json.dumps(self.to_DICT)


def email_unread_notifications(timeframe):
    """
    Looks for all unread notifications and sends each user one email with a summary.
    Marks any sent notifications as "read".

    timeframe may be:
    * 'daily'  - only send to users who have the daily email setting
    * 'weekly' - only send to users who have the weekly email setting
    * 'all'    - send all notifications
    """
    from sefaria.model.notification import NotificationSet

    users = db.notifications.find({"read": False, "is_global": False}).distinct("uid")

    for uid in users:
        profile = UserProfile(id=uid)
        if profile.settings["email_notifications"] != timeframe and timeframe != 'all':
            continue
        notifications = NotificationSet().unread_personal_for_user(uid)
        if notifications.count() == 0:
            continue
        try:
            user = User.objects.get(id=uid)
        except User.DoesNotExist:
            continue

        if "interface_language" in profile.settings:
            translation.activate(profile.settings["interface_language"][0:2])

        message_html  = render_to_string("email/notifications_email.html", {"notifications": notifications, "recipient": user.first_name})
        #message_text = util.strip_tags(message_html)
        actors_string = notifications.actors_string()
        # TODO Hebrew subjects
        if actors_string:
            verb      = "have" if " and " in actors_string else "has"
            subject   = "%s %s new activity on Sefaria" % (actors_string, verb)
        elif notifications.like_count() > 0:
            noun      = "likes" if notifications.like_count() > 1 else "like"
            subject   = "%d new %s on your Source Sheet" % (notifications.like_count(), noun)
        from_email    = "Sefaria <hello@sefaria.org>"
        to            = user.email

        msg = EmailMultiAlternatives(subject, message_html, from_email, [to])
        msg.content_subtype = "html"  # Main content is now text/html
        #msg.attach_alternative(message_text, "text/plain")
        try:
            msg.send()
            notifications.mark_read(via="email")
        except AnymailRecipientsRefused:
            print u'bad email address: {}'.format(to)

        if "interface_language" in profile.settings:
            translation.deactivate()


def unread_notifications_count_for_user(uid):
    """Returns the number of unread notifications belonging to user uid"""
    # Check for globals to add...
    from sefaria.model.notification import NotificationSet
    return NotificationSet().unread_for_user(uid).count()


public_user_data_cache = {}
def public_user_data(uid):
    """Returns a dictionary with common public data for `uid`"""
    if uid in public_user_data_cache:
        return public_user_data_cache[uid]

    profile = UserProfile(id=uid)
    try:
        user = User.objects.get(id=uid)
        is_staff = user.is_staff()
    except:
        is_staff = False

    data = {
        "name": profile.full_name,
        "profileUrl": "/profile/" + profile.slug,
        "imageUrl": profile.gravatar_url_small,
        "isStaff": is_staff,
        "uid": uid
    }
    public_user_data_cache[uid] = data
    return data


def user_name(uid):
    """Returns a string of a user's full name"""
    data = public_user_data(uid)
    return data["name"]


def user_link(uid):
    """Returns a string with an <a> tag linking to a users profile"""
    data = public_user_data(uid)
    link = "<a href='" + data["profileUrl"] + "' class='userLink'>" + data["name"] + "</a>"
    return link


def is_user_staff(uid):
    """
    Returns True if the user with uid is staff.
    """
    data = public_user_data(uid)
    try:
        uid  = int(uid)
        user = User.objects.get(id=uid)
        return user.is_staff
    except:
        return False


def user_started_text(uid, title):
    """
    Returns true if uid was responsible for first adding 'title'
    to the library.

    This checks for the oldest matching index change record for 'title'.
    If someone other than the initiator changed the text's title, this function
    will incorrectly report False, but this matches our intended behavior to
    lock name changes after an admin has stepped in.
    """
    log = db.history.find({"title": title}).sort([["date", -1]]).limit(1)
    if log.count():
        return log[0]["user"] == uid
    return False



def annotate_user_list(uids):
    """
    Returns a list of dictionaries giving details (names, profile links)
    for the user ids list in uids.
    """
    annotated_list = []
    for uid in uids:
        data = public_user_data(uid)
        annotated = {
            "userLink": user_link(uid),
            "imageUrl": data["imageUrl"]
        }
        annotated_list.append(annotated)

    return annotated_list
