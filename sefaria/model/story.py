# -*- coding: utf-8 -*-

"""
story.py
"""

import time
import bleach
import random
from datetime import datetime

from . import abstract as abst
from . import user_profile
from . import person
from . import text
from sefaria.system.database import db

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

storyForms relate to React components.  There is an explicit mapping in HomeFeed.jsx 

Other story forms:
    "publishSheet"
        "publisher_id"
        "publisher_name" (derived)
        "sheet_id"
        "sheet_title" (derived) 
    "author"
        "author_key"
        "example_work"
        "author_names" (derived)
            "en"
            "he"
        "author_bios" (derived)
            "en"
            "he"
    "textPassage"            
         "ref"  
         "index"  (derived)
         "lead_titles"
            "he"
            "en"
         "titles" - optional - derived from ref, if not present
            "he"
            "en"
         "text"   (derived)
            "he"
            "en"       
         "versions",     # dict: {en: str, he: str} - optional
         "language"      # oneOf(english, hebrew, bilingual) - optional - forces display language
    "topic" 
    "topicList" 
    "sheetList"
        
"""


class GlobalStory(Story):

    collection   = 'global_story'
    history_noun = 'global story'

    required_attrs = [
        "storyForm",     # Valid story forms ^^
        "data",
        "timestamp",
    ]

    optional_attrs = [
    ]

    def _init_defaults(self):
        self.timestamp = int(time.time())

    @staticmethod
    def latest_id():
        n = db.global_story.find_one({}, {"_id": 1}, sort=[["_id", -1]])
        if not n:
            return None
        return n["_id"]


class GlobalStorySet(abst.AbstractMongoSet):
    recordClass = GlobalStory

    def __init__(self, query=None, page=0, limit=0, sort=None):
        sort = sort or [["timestamp", -1]]
        super(GlobalStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def register_for_user(self, uid):
        for global_story in self:
            UserStory.from_global_story(uid, global_story).save()


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

    # Pseudo Constructors
    @classmethod
    def from_global_story(cls, user_id, global_story):
        return cls({
            "is_global": True,
            "global_story_id": global_story._id,
            "uid": user_id,
            "timestamp": global_story.timestamp
        })

    @classmethod
    def from_sheet_publish(cls, user_id, publisher_id, sheet_id):
        return cls({
            "storyForm": "publishSheet",
            "uid": user_id,
            "data": {
                "publisher": publisher_id,
                "sheet_id": sheet_id
            }
        })

    def _init_defaults(self):
        self.timestamp = int(time.time())
        self.is_global = False

    def _validate(self):
        if self.is_global:
            assert self.global_story_id is not None
        else:
            assert self.data
            assert self.storyForm

    @staticmethod
    def latest_global_for_user(uid):
        n = db.user_story.find_one({"uid": uid, "is_global": True}, {"_id": 1}, sort=[["_id", -1]])
        return n["_id"] if n else None

    def contents(self, **kwargs):
        c = super(UserStory, self).contents(**kwargs)
        if self.is_global:
            g = GlobalStory().load_by_id(self.global_story_id)
            c.update(g.contents(**kwargs))
            del c["global_story_id"]

        # Add Derived Attributes
        d = c["data"]
        if "ref" in d:
            oref = text.Ref(d["ref"])
            d["index"] = oref.index.title
            if not oref.is_segment_level():
                oref = oref.padded_ref().subref(1)
            d["text"] = {  # todo: should we allow this to be stored, alternatively?
                "en": text.TextChunk(oref, "en", d.get("versions", {}).get("en")).text,
                "he": text.TextChunk(oref, "he", d.get("versions", {}).get("he")).text
            }
        if "publisher_id" in d:
            udata = user_profile.public_user_data(d["publisher_id"])
            d["publisher_name"] = udata["name"]
            d["publisher_url"] = udata["profileUrl"]
            d["publisher_image"] = udata["imageUrl"]
        if "sheet_id" in d:
            from sefaria.sheets import get_sheet_metadata
            metadata = get_sheet_metadata(d["sheet_id"])
            d["sheet_title"] = bleach.clean(metadata["title"], strip=True, tags=()).strip()
            d["sheet_summary"] = bleach.clean(metadata["summary"], strip=True, tags=()).strip()
        if "author_key" in d:
            p = person.Person().load({"key": d["author_key"]})
            d["author_names"] = {"en": p.primary_name("en"), "he": p.primary_name("he")}
            d["author_bios"] = {"en": p.enBio, "he": p.heBio}
        return c


class UserStorySet(abst.AbstractMongoSet):
    recordClass = UserStory

    def __init__(self, query=None, page=0, limit=0, sort=None):
        sort = sort or [["timestamp", -1]]
        super(UserStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def _add_global_stories(self, uid):
        """
        Add user Notification records for any new GlobalNotifications
        :return:
        """
        #todo: is there a quicker way to short circuit this, and avoid these queries, when it has recently been updated?
        latest_id_for_user = UserStory.latest_global_for_user(uid)
        latest_global_id = GlobalStory.latest_id()
        if latest_global_id and (latest_global_id != latest_id_for_user):
            if latest_id_for_user is None:
                GlobalStorySet({}, limit=10).register_for_user(uid)
            else:
                GlobalStorySet({"_id": {"$gt": latest_id_for_user}}, limit=10).register_for_user(uid)

    def recent_for_user(self, uid, page=0, limit=10):
        """
        Loads recent notifications for uid.
        """
        self._add_global_stories(uid)
        self.__init__(query={"uid": uid}, page=page, limit=limit)
        return self


class AbstractStoryFactory(object):
    # Implemented at concrete level
    # Returns a dictionary with the story attributes
    def _data_object(self, **kwargs):
        pass

    # Implemented at concrete level
    # Generally simply returns a string, e.g. "textPassage"
    def _story_form(self, **kwargs):
        pass

    def _generate_global_story(self, **kwargs):
        return GlobalStory({
            "storyForm": self._story_form(**kwargs),
            "data": self._data_object(**kwargs)
        })

    def _generate_user_story(self, **kwargs):
        uid = kwargs.get("uid")
        assert uid
        return UserStory({
            "uid": uid,
            "data": self._data_object(**kwargs),
            "storyForm": self._story_form(**kwargs)
        })


class TextPassageStoryFactory(AbstractStoryFactory):
    # This seems like it needs thought
    leads = {
        "Keep Reading": {"en": "Keep Reading", "he": u"קרא עוד"},
        "Take Another Look": {"en": "Take Another Look", "he": u"קרא עוד"},
        "Pick Up Where You Left Off": {"en": "Pick Up Where You Left Off", "he": u"קרא עוד"},
        "Review": {"en": "Review", "he": u"קרא עוד"},
    }

    def _data_object(self, **kwargs):
        ref = kwargs.get("ref")
        assert ref
        oref = text.Ref(ref)

        d = {
            "ref": oref.normal(),
            "lead_titles": self.leads.get(kwargs.get("lead"), {"en": "Read", "he": u"קרא"}),
            "titles": kwargs.get("titles", {"en": oref.normal(), "he": oref.he_normal()})
        }
        if kwargs.get("versions"):
            d["versions"] = kwargs.get("versions")
        return d

    def _story_form(self, **kwargs):
        return "textPassage"

    def generate_from_user_history(self, hist, **kwargs):
        assert isinstance(hist, user_profile.UserHistory)
        return self._generate_user_story(uid=hist.uid, ref=hist.ref, versions=hist.versions, **kwargs)


class AuthorStoryFactory(AbstractStoryFactory):

    def _data_object(self, **kwargs):
        prs = kwargs.get("person")
        assert isinstance(prs, person.Person)
        return {"author_key": prs.key, "example_work": random.choice(prs.get_indexes()).title}

    def _story_form(self, **kwargs):
        return "author"

    def create_random_global_story(self):
        p = self._select_random_person()
        story = self._generate_global_story(person=p)
        story.save()

    def _select_random_person(self):
        eras = ["GN", "RI", "AH", "CO"]
        ps = person.PersonSet({"era": {"$in": eras}})

        p = random.choice(ps)
        while not self._can_use_person(p):
            p = random.choice(ps)

        #todo: Any way to avoid loading this whole set?
        #todo: check against most recent X to avoid dupes.
        return p

    def _can_use_person(self, p):
        if not isinstance(p, person.Person):
            return False
        if not p.has_indexes():
            return False
        if not getattr(p, "enBio", False):
            return False
        if not getattr(p, "heBio", False):
            return False

        return True


class RandomTopicFactory(AbstractStoryFactory):
    """
    cb = request.GET.get("callback", None)
    topics_filtered = filter(lambda x: x['count'] > 15, get_topics().list())
    if len(topics_filtered) == 0:
        resp = jsonResponse({"ref": None, "topic": None, "url": None}, callback=cb)
        resp['Content-Type'] = "application/json; charset=utf-8"
        return resp
    random_topic = choice(topics_filtered)['tag']
    random_source = choice(get_topics().get(random_topic).contents()['sources'])[0]
    try:
        oref = Ref(random_source)
        tref = oref.normal()
        url = oref.url()
    except Exception:
        return random_by_topic_api(request)
    resp = jsonResponse({"ref": tref, "topic": random_topic, "url": url}, callback=cb)
    resp['Content-Type'] = "application/json; charset=utf-8"
    return resp
    pass
    """


