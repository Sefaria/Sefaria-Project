import hashlib
import urllib.request, urllib.parse, urllib.error
import re
import bleach
import sys
import json
import csv
from datetime import datetime
from django.utils.translation import ugettext as _, ungettext_lazy
from random import randint

from sefaria.system.exceptions import InputError, SheetNotFoundError
from functools import reduce

if not hasattr(sys, '_doc_build'):
    from django.contrib.auth.models import User, Group, AnonymousUser
    from emailusernames.utils import get_user, user_exists
    from django.core.mail import EmailMultiAlternatives
    from django.template.loader import render_to_string
    from django.core.validators import URLValidator, EmailValidator
    from django.core.exceptions import ValidationError
    from anymail.exceptions import AnymailRecipientsRefused

from . import abstract as abst
from sefaria.model.following import FollowersSet, FolloweesSet, general_follow_recommendations
from sefaria.model.blocking import BlockersSet, BlockeesSet
from sefaria.model.text import Ref, TextChunk
from sefaria.system.database import db
from sefaria.utils.util import epoch_time
from django.utils import translation

import structlog
logger = structlog.get_logger(__name__)


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
        "secondary"          # bool: True when view is from sidebar
    ]

    optional_attrs = [
        "datetime",  # datetime: converted from time_stamp.  Can move to required once legacy records are converted.
        "context_refs",  # list of ref strings: derived from ref.  Can move to required once legacy records are converted.
        "categories",  # list of str: derived from ref.  Can move to required once legacy records are converted.
        "authors",  # list of str: derived from ref.  Can move to required once legacy records are converted.
        "is_sheet",  # bool: is this a sheet ref?  Can move to required once legacy records are converted.
        "language",           # oneOf(english, hebrew, bilingual) didn't exist in legacy model
        "num_times_read",     # int: legacy for migrating old recent views
        "sheet_title",        # str: for sheet history
        "sheet_owner",        # str: ditto
        "sheet_id",           # int: ditto
        "delete_saved",       # bool: True if this item was saved and but then was deleted
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
        if not hasattr(attrs.get("versions", None), "items"):
            attrs["versions"] = {}  # if versions doesn't have 'items', make it an empty dict
        for k, v in list(attrs.get("versions", {}).items()):
            if v is None:
                del attrs["versions"][k]
        if load_existing:
            temp = UserHistory().load({"uid": attrs["uid"], "ref": attrs["ref"], "versions": attrs["versions"], "secondary": attrs['secondary']})
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

    def _validate(self):
        if self.secondary and self.saved:
            raise InputError("UserHistory item cannot currently have both saved and secondary flags set at the same time")

    def _normalize(self):
        # Derived values - used to make downstream queries quicker
        self.datetime = datetime.utcfromtimestamp(self.time_stamp)
        try:
            r = Ref(self.ref)
            self.context_refs   = [r.normal() for r in r.all_context_refs()]
            self.categories     = r.index.categories
            self.authors        = getattr(r.index, "authors", [])
            self.is_sheet       = r.index.title == "Sheet"
            if self.is_sheet:
                self.sheet_id = r.sections[0]
            if not self.secondary and not self.is_sheet and getattr(self, "language", None) != "hebrew" and r.is_empty("en"):
                # logically, this would be on frontend, but easier here.
                self.language = "hebrew"
        except SheetNotFoundError:
            self.context_refs   = [self.ref]
            self.categories     = ["_unlisted"]
            self.authors        = []
            self.is_sheet       = True
        except InputError:   # Ref failed to resolve
            self.context_refs   = [self.ref]
            self.categories     = []
            self.authors        = []
            self.is_sheet       = False
        except KeyError:     # is_text_translated() stumbled on a bad version state
            pass

    def contents(self, **kwargs):
        from sefaria.sheets import get_sheet_listing_data
        d = super(UserHistory, self).contents(**kwargs)
        if kwargs.get("for_api", False):
            keys = {
                'ref': '',
                'he_ref': '',
                'book': '',
                'versions': {},
                'time_stamp': 0,
                'saved': False,
                'delete_saved': False,
                'is_sheet': False,
                'sheet_id': -1,
                'sheet_owner': '',
                'sheet_title': '',
            }
            d = {
                key: d.get(key, default) for key, default in list(keys.items())
            }
        if kwargs.get("annotate", False):
            try:
                ref = Ref(d["ref"])
                if ref.is_sheet():
                    d.update(get_sheet_listing_data(d["sheet_id"]))
                else:
                    d["text"] = {
                        "en": TextChunk(ref, "en").as_sized_string(),
                        "he": TextChunk(ref, "he").as_sized_string()
                    }
            except Exception as e:
                logger.warning("Failed to retrieve text for history Ref: {}".format(d['ref']))
                return d
        return d

    def _sanitize(self):
        # UserHistory API is only open to post for your uid
        pass

    @staticmethod
    def save_history_item(uid, hist, action=None, time_stamp=None):
        if time_stamp is None:
            time_stamp = epoch_time()
        hist["uid"] = uid
        if "he_ref" not in hist or "book" not in hist:
            oref = Ref(hist["ref"])
            hist["he_ref"] = oref.he_normal()
            hist["book"] = oref.index.title
        hist["server_time_stamp"] = time_stamp if "server_time_stamp" not in hist else hist["server_time_stamp"]  # DEBUG: helpful to include this field for debugging

        saved = True if action == "add_saved" else (False if action == "delete_saved" else hist.get("saved", False))
        uh = UserHistory(hist, load_existing=(action is not None), update_last_place=(action is None), field_updates={
            "saved": saved,
            "server_time_stamp": hist["server_time_stamp"],
            "delete_saved": action == "delete_saved"
        })
        uh.save()
        return uh

    @staticmethod
    def remove_history_item(uid, hist):
        hist["uid"] = uid
        uh = UserHistory(hist, load_existing=True)
        uh.delete()

    @staticmethod
    def get_user_history(uid=None, oref=None, saved=None, secondary=None, last_place=None, sheets=None, serialized=False, annotate=False, limit=0, skip=0):
        query = {}
        if uid is not None:
            query["uid"] = uid
        if oref is not None:
            regex_list = oref.context_ref().regex(as_list=True)
            ref_clauses = [{"ref": {"$regex": r}} for r in regex_list]
            query["$or"] = ref_clauses
        if saved is not None:
            query["saved"] = saved
        if sheets is not None:
            query["is_sheet"] = sheets
        if secondary is not None:
            query["secondary"] = secondary
        if last_place is not None:
            query["last_place"] = last_place
        if serialized:
            return [uh.contents(for_api=True, annotate=annotate) for uh in UserHistorySet(query, proj={"uid": 0, "server_time_stamp": 0}, sort=[("time_stamp", -1)], limit=limit, skip=skip)]
        return UserHistorySet(query, sort=[("time_stamp", -1)], limit=limit, skip=skip)

    @staticmethod
    def delete_user_history(uid, exclude_saved=True, exclude_last_place=False):
        if not uid:
            raise InputError("Cannot delete user history without an id")
        query = {"uid": uid}
        if exclude_saved:
            query["saved"] = False
        if exclude_last_place:
            query["last_place"] = False
        UserHistorySet(query).delete(bulk_delete=True)

    @staticmethod
    def timeclause(start=None, end=None):
        """
        Returns a time range clause, fit for use in a pymongo query
        :param start: datetime
        :param end: datetime
        :return:
        """
        if start is None and end is None:
            return {}

        timerange = {}
        if start:
            timerange["$gte"] = start
        if end:
            timerange["$lte"] = end
        return {"datetime": timerange}


class UserHistorySet(abst.AbstractMongoSet):
    recordClass = UserHistory

    def hits(self):
        return reduce(lambda agg,o: agg + getattr(o, "num_times_read", 1), self, 0)


"""
Wrapper class for operations on the user object. Currently only for changing primary email.
"""
class UserWrapper(object):
    def __init__(self, email=None, user_obj=None):
        if email:
            self.user = get_user(email)
        elif user_obj:
            self.user = user_obj
        else:
            raise InputError("No user provided")
        self._errors = []

    def set_email(self, new_email):
        self.email = new_email
        self._errors = []

    def validate(self):
        return not self.errors()

    def errors(self):
        if len(self._errors):
            return self._errors[0]
        if user_exists(self.email):
            u = get_user(self.email)
            if u.id != self.user.id:
                self._errors.append(_("A user with that email already exists"))
        email_val = EmailValidator()
        try:
            email_val(self.email)
        except ValidationError as e:
            self._errors.append(_("The email address is not valid."))
        return self._errors[0] if len(self._errors) else None

    def save(self):
        if self.validate():
            self.user.email = self.email
            self.user.username = self.email #this is to conform with our username-as-email library, which doesnt really take care of itself properly as advertised
            self.user.save()
        else:
            raise ValueError(self.errors())

    def has_permission_group(self, group_name):
        try:
            group = Group.objects.get(name=group_name)
            return group in self.user.groups.all()
        except:
            return False


class UserProfile(object):
    def __init__(self, user_obj=None, id=None, slug=None, email=None, user_registration=False):
        """
        :param user_registration: pass during user registration so as to not create an extra profile record as init side effect
        """
        #TODO: Can we optimize the init to be able to load a profile without a call to user db?
        # say in a case where we already have an id and just want some fields from the profile object
        if slug:  # Load profile by slug, if passed
            profile = db.profiles.find_one({"slug": slug})
            if profile:
                self.__init__(id=profile["id"])
                return

        try:
            if user_obj and not isinstance(user_obj, AnonymousUser):
                user = user_obj
                id = user.id
            elif email and not id:  # Load profile by email, if passed.
                user = User.objects.get(email__iexact=email)
                id = user.id
            else:
                user = User.objects.get(id=id)
            self.first_name        = user.first_name
            self.last_name         = user.last_name
            self.email             = user.email
            self.date_joined       = user.date_joined
            self.user              = user
        except:
            # These default values allow profiles to function even
            # if the Django User records are missing (for testing)
            self.first_name        = "User"
            self.last_name         = str(id)
            self.email             = "test@sefaria.org"
            self.date_joined       = None
            self.user              = None

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
        self.last_sync_web        = 0  # epoch time for last sync of web app
        self.profile_pic_url      = ""
        self.profile_pic_url_small = ""

        self.settings     =  {
            "email_notifications": "daily",
            "interface_language": "english",
            "textual_custom" : "sephardi",
            "reading_history" : True,
            "translation_language_preference": None,
        }
        self.version_preferences_by_corpus = {}

        # dict that stores the last time an attr has been modified
        self.attr_time_stamps = {
            "settings": 0
        }

        # flags that indicate a change needing a cascade after save
        self._name_updated      = False
        self._process_remove_history = False

        # Followers
        self.followers = FollowersSet(self.id)
        self.followees = FolloweesSet(self.id)

        # Blocks
        self.blockees = BlockeesSet(self.id)
        self.blockers = BlockersSet(self.id)

        # Google API token
        self.gauth_token = None
        self.gauth_email = None

        # CRM
        self.nationbuilder_id = None
        self.sf_app_user_id = None

        # new editor
        self.show_editor_toggle = False
        self.uses_new_editor = True

        # Fundraising
        self.is_sustainer = False

        # Update with saved profile doc in MongoDB
        profile = db.profiles.find_one({"id": id})
        if profile: # overwrite if fake profile in db
            # TODO: think about how we want to handle the postgres database not being synced
            # with the mongo database. This is an existing issue; a 'new user' will be populated with 'old user'
            # data from a nonexistent user (in postgres)
            self.update(profile, ignore_flags_on_init=True)
        elif self.exists() and not user_registration:
            # If we encounter a user that has a Django user record but not a profile document
            # create a profile for them. This allows two enviornments to share a user database,
            # while maintaining separate profiles (e.g. Sefaria and S4D).
            self.assign_slug()
            self.save()

    @property
    def full_name(self):
        return self.first_name + " " + self.last_name

    def _set_flags_on_update(self, obj):
        if "first_name" in obj or "last_name" in obj:
            if self.first_name != obj["first_name"] or self.last_name != obj["last_name"]:
                self._name_updated = True

        if "reading_history" in self.settings and self.settings["reading_history"] == True:
            if "settings" in obj and "reading_history" in obj["settings"] and obj["settings"]["reading_history"] == False:
                self._process_remove_history = True

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
        return [_f for _f in [xformer(r) for r in recents] if _f]

    def update(self, obj, ignore_flags_on_init=False):
        """
        Update this object with the fields in dictionary 'obj'
        """
        if not ignore_flags_on_init:
            self._set_flags_on_update(obj)
        for dict_key in ("settings", "version_preferences_by_corpus"):
            # merge these keys separately since they are themselves dicts.
            # want to allow partial updates to be passed to update.
            from sefaria.utils.util import deep_update
            if dict_key in obj and dict_key in self.__dict__:
                obj[dict_key] = deep_update(self.__dict__[dict_key], obj[dict_key])
        self.__dict__.update(obj)

        return self

    def update_empty(self, obj):
        self._set_flags_on_update(obj)
        for k, v in list(obj.items()):
            if v:
                if k not in self.__dict__ or self.__dict__[k] == '' or self.__dict__[k] == []:
                    self.__dict__[k] = v

    def update_version_preference(self, corpus, vtitle, lang):
        """
        Convenience method to keep update logic in one place
        """

        self.update({"version_preferences_by_corpus": {corpus: {lang: vtitle}}})

    def save(self):
        """
        Save profile to DB, updated Django User object if needed
        """
        # Sanitize & Linkify fields that allow HTML
        self.bio = bleach.linkify(self.bio)

        d = self.to_mongo_dict()
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

        if self._process_remove_history:
            self.delete_user_history()
            self._process_remove_history = False

        return self

    def errors(self):
        """
        Returns a string with any validation errors,
        or None if the profile is valid.
        """
        # Slug
        if re.search(r"[^a-z0-9\-]", self.slug):
            return "Profile URLs may only contain lowercase letters, numbers and hyphens."

        existing = db.profiles.find_one({"slug": self.slug, "_id": {"$ne": self._id}})
        if existing:
            return "The Profile URL you have requested is already in use."
        # URL Fields: website, facebook, linkedin
        url_val = URLValidator()
        try:
            if self.facebook: url_val(self.facebook)
        except ValidationError as e:
            return "The Facebook URL you entered is not valid."
        try:
            if self.linkedin: url_val(self.linkedin)
        except ValidationError as e:
            return "The LinkedIn URL you entered is not valid."
        try:
            if self.website: url_val(self.website)
        except ValidationError as e:
            return "The Website URL you entered is not valid."
        email_val = EmailValidator()
        try:
            if self.email: email_val(self.email)
        except ValidationError as e:
            return "The email address you entered is not valid."

        return None

    def exists(self):
        """
        Returns True if this is a real existing user, not simply a mock profile.
        """
        return bool(self.user)

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

    def join_invited_collections(self):
        """
        Add this user as a editor of any collections for which there is an outstanding invitation.
        """
        from sefaria.model import CollectionSet
        collections = CollectionSet({"invitations.email": self.email})
        for collection in collections:
            collection.add_member(self.id)
            collection.remove_invitation(self.email)

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
        from sefaria.model.notification import NotificationSet
        return NotificationSet().unread_for_user(self.id).count()

    def process_history_item(self, hist, time_stamp):
        action = hist.pop("action", None)
        if self.settings.get("reading_history", True) or action == "add_saved":  # regular case where history enabled, save/unsave saved item etc. or save history in either case
            return UserHistory.save_history_item(self.id, hist, action, time_stamp)
        elif action == "delete_saved":  # user has disabled history and is "unsaving", therefore deleting this item.
            UserHistory.remove_history_item(self.id, hist)
            return None
        else:  # history disabled do nothing.
            return None

    def get_history(self, oref=None, saved=None, secondary=None, sheets=None, last_place=None, serialized=False, annotate=False, limit=0, skip=0):
        """
        personal user history
        :param oref:
        :param saved: True if you only want saved. False if not. None if you dont care
        :param secondary: ditto
        :param last_place: ditto
        :param sheets: ditto
        :param serialized: for return from API call
        :param limit: Passed on to Mongo to limit # of results
        :return:
        """
        if not self.settings.get('reading_history', True) and not saved:
            return [] if serialized else None
        return UserHistory.get_user_history(uid=self.id, oref=oref, saved=saved, secondary=secondary, sheets=sheets, last_place=last_place, serialized=serialized, annotate=annotate, limit=limit, skip=skip)

    def delete_user_history(self, exclude_saved=True, exclude_last_place=False):
        UserHistory.delete_user_history(uid=self.id, exclude_saved=exclude_saved, exclude_last_place=exclude_last_place)

    def follow_recommendations(self, lang="english", n=4):
        """
        Returns a list of users recommended for `self` to follow.
        """
        from random import choices
        options = general_follow_recommendations(lang=lang, n=100)
        if not len(options):
            return []
        filtered_options = [u for u in options if not self.follows(u["uid"])]

        return choices(filtered_options, k=n)

    def to_mongo_dict(self):
        """
        Return a json serializable dictionary which includes all data to be saved in mongo (as opposed to postgres)
        """
        return {
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
            "version_preferences_by_corpus": self.version_preferences_by_corpus,
            "attr_time_stamps":      self.attr_time_stamps,
            "is_sustainer":          self.is_sustainer,
            "tag_order":             getattr(self, "tag_order", None),
            "last_sync_web":         self.last_sync_web,
            "profile_pic_url":       self.profile_pic_url,
            "profile_pic_url_small": self.profile_pic_url_small,
            "gauth_token":           self.gauth_token,
            "nationbuilder_id":      self.nationbuilder_id,
            "sf_app_user_id":        self.sf_app_user_id,
            "gauth_email":           self.gauth_email,
            "show_editor_toggle":    self.show_editor_toggle,
            "uses_new_editor":       self.uses_new_editor,
        }

    def to_api_dict(self, basic=False):
        """
        Return a json serializble dictionary this profile which includes fields used in profile API methods
        If basic is True, only return enough data to display a profile listing
        """
        dictionary = {
                "id": self.id,
                "slug": self.slug,
                "profile_pic_url": self.profile_pic_url,
                "full_name": self.full_name,
                "followers": self.followers.uids,
                "followees": self.followees.uids,
                "profile_pic_url": self.profile_pic_url,
                "jewish_education": self.jewish_education,
                "bio": self.bio,
                "website": self.website,
                "location": self.location,
                "public_email": self.public_email,
                "facebook": self.facebook,
                "twitter": self.twitter,
                "linkedin": self.linkedin,
                "youtube": self.youtube,
                "position": self.position,
                "organization": self.organization
            }
        if basic:
            return dictionary
        other_info = {
            "pinned_sheets":         self.pinned_sheets,
            "show_editor_toggle":    self.show_editor_toggle,
            "uses_new_editor":       self.uses_new_editor,
            "is_sustainer":          self.is_sustainer,
        }
        dictionary.update(other_info)
        return dictionary


    def to_mongo_json(self):
        """
        Return a json serializable dictionary which includes all data to be saved in mongo (as opposed to postgres)
        """
        return json.dumps(self.to_mongo_dict())


def detect_potential_spam_message_notifications():
    # Get "message" type notifications where one user has sent many messages to multiple users.
    spammers = db.notifications.aggregate(
        [
            {
                "$match": {
                    "read": False,
                    "is_global": False,
                    "type": "message"
                }
            },
            {
                "$group": {
                    "_id": "$content.sender",
                    "countmessages": {
                        "$sum": 1
                    },
                    "uids": {
                        "$addToSet": "$uid"
                    }
                }
            },
            {"$match": {"countmessages": {"$gt": 20}}},
        ])
    suspect_results = []
    for spammer in spammers:
        spammer_id = spammer["_id"]
        if len(spammer["uids"]) >= 5:
            suspect_results.append(spammer_id)
            try:
                spammer_account = User.objects.get(id=spammer_id)
                spammer_account.is_active = False
                spammer_account.save()
            except:
                continue

        print(spammer["_id"])
    # Mark all of these Notifications with these sender ids as suspicious so they dont get sent to the users
    db.notifications.update_many({"content.sender": {"$in": suspect_results}}, {"$set": {"suspected_spam": True}})
    return suspect_results


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

    detect_potential_spam_message_notifications()

    users = db.notifications.find({"read": False, "is_global": False}).distinct("uid")

    for uid in users:
        profile = UserProfile(id=uid)
        if profile.settings["email_notifications"] != timeframe and timeframe != 'all':
            continue
        notifications = NotificationSet().unread_personal_for_user(uid)
        if len(notifications) == 0:
            continue
        try:
            user = User.objects.get(id=uid)
        except User.DoesNotExist:
            continue

        if "interface_language" in profile.settings:
            translation.activate(profile.settings["interface_language"][0:2])

        message_html  = render_to_string("email/notifications_email.html", {"notifications": notifications, "recipient": user.first_name})
        actors_string = notifications.actors_string()
        # TODO Hebrew subjects
        if actors_string:
            verb      = "have" if " and " in actors_string else "has"
            subject   = "%s %s new activity on Sefaria" % (actors_string, verb)
        elif notifications.like_count() > 0:
            noun      = "likes" if notifications.like_count() > 1 else "like"
            subject   = "%d new %s on your Source Sheet" % (notifications.like_count(), noun)
        from_email    = "Sefaria Notifications <notifications@sefaria.org>"
        to            = user.email

        msg = EmailMultiAlternatives(subject, message_html, from_email, [to])
        msg.content_subtype = "html"
        try:
            msg.send()
            notifications.mark_read(via="email")
        except AnymailRecipientsRefused:
            print('bad email address: {}'.format(to))

        if "interface_language" in profile.settings:
            translation.deactivate()


public_user_data_cache = {}
def public_user_data(uid, ignore_cache=False):
    """Returns a dictionary with common public data for `uid`"""
    if uid in public_user_data_cache and not ignore_cache:
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
        "imageUrl": profile.profile_pic_url_small,
        "position": profile.position,
        "organization": profile.organization,
        "isStaff": is_staff,
        "uid": uid
    }
    public_user_data_cache[uid] = data
    return data


def user_name(uid):
    """Returns a string of a user's full name"""
    data = public_user_data(uid)
    return data["name"]


def profile_url(uid):
    """Returns url to user's profile"""
    data = public_user_data(uid)
    return data["profileUrl"]


def user_link(uid):
    """Returns a string with an <a> tag linking to a users profile"""
    data = public_user_data(uid)
    link = "<a href='" + data["profileUrl"] + "' class='userLink'>" + data["name"] + "</a>"
    return link


def is_user_staff(uid):
    """
    Returns True if the user with uid is staff.
    """
    data = public_user_data(uid)  #needed?
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
    if len(log):
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


def process_index_title_change_in_user_history(indx, **kwargs):
    print("Cascading User History from {} to {}".format(kwargs['old'], kwargs['new']))

    # ensure that the regex library we're using here is the same regex library being used in `Ref.regex`
    from .text import re as reg_reg
    patterns = [pattern.replace(reg_reg.escape(indx.title), reg_reg.escape(kwargs["old"]))
                for pattern in Ref(indx.title).regex(as_list=True)]
    queries = [{'ref': {'$regex': pattern}} for pattern in patterns]
    objs = UserHistorySet({"$or": queries})
    for o in objs:
        o.ref = o.ref.replace(kwargs["old"], kwargs["new"], 1)
        try:
            o.save()
        except InputError:
            logger.warning("Failed to convert user history from: {} to {}".format(kwargs['old'], kwargs['new']))
