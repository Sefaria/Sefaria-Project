# -*- coding: utf-8 -*-

"""
story.py
"""

import time
import bleach
import random
from datetime import datetime

from sefaria.utils.hebrew import hebrew_term
from sefaria.utils.util import strip_tags
from sefaria.system.database import db
from . import abstract as abst
from . import user_profile
from . import person
from . import text
from . import following


import logging
logger = logging.getLogger(__name__)


class Story(abst.AbstractMongoRecord):

    @staticmethod
    def _sheet_metadata(sheet_id, return_id=False):
        from sefaria.sheets import get_sheet_metadata
        metadata = get_sheet_metadata(sheet_id)

        d = {
            "sheet_title": strip_tags(metadata["title"]),
            "sheet_summary": strip_tags(metadata["summary"]) if "summary" in metadata else "",
            "publisher_id": metadata["owner"]
        }
        if return_id:
            d["sheet_id"] = sheet_id
        return d

    @staticmethod
    def _publisher_metadata(publisher_id, return_id=False):
        udata = user_profile.public_user_data(publisher_id)
        d = {
            "publisher_name": udata["name"],
            "publisher_url": udata["profileUrl"],
            "publisher_image": udata["imageUrl"],
            "publisher_position": udata["position"],
        }
        if return_id:
            d["publisher_id"] = publisher_id

        return d

    def contents(self, **kwargs):
        c = super(Story, self).contents(with_string_id=True, **kwargs)

        # Add Derived Attributes
        if "data" not in c:
            return c

        d = c["data"]
        if "version" in d and "language" in d and "versions" not in d:
            # NewVersion records have just one version.
            d["versions"] = {d["language"]: d["version"]}

        if "ref" in d:
            oref = text.Ref(d["ref"])
            if "index" not in d:
                d["index"] = oref.index.title
            d["text"] = {  # todo: should we allow this to be stored, alternatively?
                "en": text.TextChunk(oref, "en", d.get("versions", {}).get("en")).as_sized_string(),
                "he": text.TextChunk(oref, "he", d.get("versions", {}).get("he")).as_sized_string()
            }
        if "refs" in d:
            orefs = [text.Ref(r) for r in d["refs"]]
            d["texts"] = [{
                "en": text.TextChunk(oref, "en").as_sized_string(),
                "he": text.TextChunk(oref, "he").as_sized_string(),
                "ref": oref.normal(),
                "heRef": oref.he_normal()
            } for oref in orefs]
        if "publisher_id" in d:
            d.update(self._publisher_metadata(d["publisher_id"]))

        if "sheet_id" in d:
            d.update(self._sheet_metadata(d["sheet_id"]))

        if "sheet_ids" in d:
            d["sheets"] = [self._sheet_metadata(i, return_id=True) for i in d["sheet_ids"]]
            if "publisher_id" not in d:
                for sheet_dict in d["sheets"]:
                    sheet_dict.update(self._publisher_metadata(sheet_dict["publisher_id"]))

        if "author_key" in d:
            p = person.Person().load({"key": d["author_key"]})
            d["author_names"] = {"en": p.primary_name("en"), "he": p.primary_name("he")}
            d["author_bios"] = {"en": p.enBio, "he": p.heBio}

        return c


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
    "general": "freeText"
    "index": "newIndex"
    "version": "newVersion"

storyForms relate to React components.  There is an explicit mapping in HomeFeed.jsx 

Other story forms:
    "publishSheet"
        "publisher_id"
        "publisher_name" (derived)
        "publisher_url" (derived)
        "publisher_image" (derived)
        "publisher_position" (derived)
        "publisher_followed" (derived)
        "sheet_id"
        "sheet_title" (derived) 
        "sheet_summary" (derived)
    "author"
        "author_key"
        "example_work"
        "author_names" (derived)
            "en"
            "he"
        "author_bios" (derived)
            "en"
            "he"
    "userSheets"
        "publisher_id"
        "publisher_name" (derived)
        "publisher_url" (derived)
        "publisher_image" (derived)
        "publisher_position" (derived)
        "publisher_followed" (derived)
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title" 
              "sheet_summary"}, {...}]  

    "sheetList"
        "lead_title" : {
            "he"
            "en"
        }
        "title" : {
            "he"
            "en"
        }
        "group_image" (optional)
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"},
              "publisher_id"
              "publisher_name" (derived)
              "publisher_url" (derived)
              "publisher_image" (derived)
              "publisher_position" (derived)
              "publisher_followed" (derived)
            },
            {...}]
    "groupSheetList"
        "title" : {
            "he"
            "en"
        }
        "group_image"
        "group_url"
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"},
              "publisher_id"
              "publisher_name" (derived)
              "publisher_url" (derived)
              "publisher_image" (derived)
              "publisher_position" (derived)
              "publisher_followed" (derived)
            },
            {...}]

    "textPassage"            
         "ref"  
         "index"  (derived)
         "lead_title"
            "he"
            "en"
         "title" - optional - derived from ref, if not present
            "he"
            "en"
         "text"   (derived)
            "he"
            "en"       
         "versions",     # dict: {en: str, he: str} - optional
         "language"      # oneOf(english, hebrew, bilingual) - optional - forces display language
    "topicTexts"
        "title"
            "en"
            "he"
        "refs"
        "texts" (derived)
            [{"en","he"}, ...]
    "topicList"
        "topics" 
        
"""


class SharedStory(Story):

    collection   = 'shared_story'
    history_noun = 'shared story'

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
        n = db.shared_story.find_one({}, {"_id": 1}, sort=[["_id", -1]])
        if not n:
            return None
        return n["_id"]


class SharedStorySet(abst.AbstractMongoSet):
    recordClass = SharedStory

    def __init__(self, query=None, page=0, limit=0, sort=None):
        sort = sort or [["timestamp", -1]]
        super(SharedStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    def register_for_user(self, uid):
        for shared_story in self:
            UserStory.from_shared_story(uid, shared_story).save()


class UserStory(Story):

    collection   = 'user_story'
    history_noun = 'user story'

    required_attrs = [
        "uid",
        "is_shared",
        "timestamp"
    ]

    optional_attrs = [
        "shared_story_id",   # required if is_shared is true
        "storyForm",         # required if is_shared is false
        "data"               # required if is_shared is false
    ]

    # Pseudo Constructors
    @classmethod
    def from_shared_story(cls, user_id, shared_story):
        return cls({
            "is_shared": True,
            "shared_story_id": shared_story._id,
            "uid": user_id,
            "timestamp": shared_story.timestamp
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
        self.is_shared = False

    def _validate(self):
        if self.is_shared:
            assert self.shared_story_id is not None
        else:
            assert self.data
            assert self.storyForm

    def contents(self, **kwargs):
        c = super(UserStory, self).contents(**kwargs)

        if self.is_shared:
            g = SharedStory().load_by_id(self.shared_story_id)
            c.update(g.contents(**kwargs))
            del c["shared_story_id"]

        d = c.get("data")
        followees = kwargs.get("followees")
        if followees and d:
            if "publisher_id" in d:
                d["publisher_followed"] = d["publisher_id"] in followees
            elif "sheets" in d:
                for sheet in d["sheets"]:
                    sheet["publisher_followed"] = sheet["publisher_id"] in followees

        return c

    @staticmethod
    def latest_shared_for_user(uid):
        n = db.user_story.find_one({"uid": uid, "is_shared": True}, {"_id": 1}, sort=[["_id", -1]])
        return n["_id"] if n else None


class UserStorySet(abst.AbstractMongoSet):
    recordClass = UserStory

    def __init__(self, query=None, page=0, limit=0, sort=None, uid=None):
        sort = sort or [["timestamp", -1]]
        query = query or {}
        self.uid = uid
        if uid:
            query["uid"] = uid

        super(UserStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    @staticmethod
    def _add_shared_stories(uid):
        """
        Add user story records for any new shared stories
        :return:
        """
        #todo: is there a quicker way to short circuit this, and avoid these queries, when it has recently been updated?
        latest_id_for_user = UserStory.latest_shared_for_user(uid)
        latest_shared_id = SharedStory.latest_id()
        if latest_shared_id and (latest_shared_id != latest_id_for_user):
            if latest_id_for_user is None:
                SharedStorySet({}, limit=10).register_for_user(uid)
            else:
                SharedStorySet({"_id": {"$gt": latest_id_for_user}}, limit=10).register_for_user(uid)

    def contents(self, **kwargs):
        if self.uid:
            followees = following.FolloweesSet(self.uid).uids
            return super(UserStorySet, self).contents(followees=followees, **kwargs)
        else:
            return super(UserStorySet, self).contents(**kwargs)

    @classmethod
    def recent_for_user(cls, uid, page=0, limit=10):
        """
        Loads recent stories for uid.
        """
        cls._add_shared_stories(uid)
        return cls(uid=uid, page=page, limit=limit)


'''
###   Story Factories ###
'''


class AbstractStoryFactory(object):
    # Implemented at concrete level
    # Returns a dictionary with the story attributes
    @classmethod
    def _data_object(cls, **kwargs):
        pass

    # Implemented at concrete level
    # Generally simply returns a string, e.g. "textPassage"
    @classmethod
    def _story_form(cls, **kwargs):
        pass

    @classmethod
    def _generate_story(cls, **kwargs):
        if kwargs.get("uid"):
            return cls._generate_user_story(**kwargs)
        else:
            return cls._generate_shared_story(**kwargs)

    @classmethod
    def _generate_shared_story(cls, **kwargs):
        return SharedStory({
            "storyForm": cls._story_form(**kwargs),
            "data": cls._data_object(**kwargs)
        })

    @classmethod
    def _generate_user_story(cls, **kwargs):
        uid = kwargs.get("uid")
        assert uid
        d = {
            "uid": uid,
            "storyForm": cls._story_form(**kwargs),
            "data": cls._data_object(**kwargs)
        }
        if kwargs.get("timestamp"):
            d["timestamp"] = kwargs.get("timestamp")
        return UserStory(d)


#todo: convert this into a Free Form story
class FreeTextStoryFactory(object):
    """
    freeText
        "he"    : hebrew long description
        "en"    : english long description
    """
    @classmethod
    def _data_object(cls, **kwargs):
        return {"en": kwargs.get("en"),
                "he": kwargs.get("he")}

    @classmethod
    def _story_form(cls, **kwargs):
        return "freeText"


class NewIndexStoryFactory(object):
    """
    newIndex
        "index" : title of index
        "ref"     ref of example passage (optional)
        "he"    : hebrew long description (optional)
        "en"    : english long description (optional)

    """

    @classmethod
    def _data_object(cls, **kwargs):
        from sefaria.model import library, Version

        i = library.get_index(kwargs.get("index"))
        assert i

        d = { "index": i.title }

        ref = kwargs.get("ref")
        if ref:
            oref = text.Ref(ref)
            d["ref"] = oref.normal()

        if kwargs.get("he"):
            d["he"] = kwargs.get("he")

        if kwargs.get("en"):
            d["en"] = kwargs.get("en")

        return d

    @classmethod
    def _story_form(cls, **kwargs):
        return "newIndex"


class NewVersionStoryFactory(object):
    """
       newVersion
            "index"     : title of index
            "version"   : version title
            "language"  : "en" or "he"
            "ref"       : ref of example passage (optional)
            "he"        : hebrew long description (optional)
            "en"        : english long description (optional)
    """

    @classmethod
    def _data_object(cls, **kwargs):
        from sefaria.model import library, Version

        i = library.get_index(kwargs.get("index"))
        assert i

        v = Version().load({
            "language": kwargs.get("language"),
            "title": i.title,
            "versionTitle": kwargs.get("version")
        })
        assert v
        d = {
                "index": i.title,
                "version": v.versionTitle,
                "language": v.language
            }

        ref = kwargs.get("ref")
        if ref:
            oref = text.Ref(ref)
            d["ref"] = oref.normal()

        if kwargs.get("he"):
            d["he"] = kwargs.get("he")

        if kwargs.get("en"):
            d["en"] = kwargs.get("en")

        return d

    @classmethod
    def _story_form(cls, **kwargs):
        return "newVersion"


class TextPassageStoryFactory(AbstractStoryFactory):
    @classmethod
    def _data_object(cls, **kwargs):
        ref = kwargs.get("ref")
        assert ref
        oref = text.Ref(ref)

        d = {
            "ref": oref.normal(),
            "title": kwargs.get("title", {"en": oref.normal(), "he": oref.he_normal()})
        }
        if kwargs.get("lead"):
            d["lead_title"] = kwargs.get("lead")

        if kwargs.get("versions"):
            d["versions"] = kwargs.get("versions")

        return d

    @classmethod
    def _story_form(cls, **kwargs):
        return "textPassage"

    ###

    @classmethod
    def create_daf_yomi(cls, **kwargs):
        cls.generate_calendar(key="Daf Yomi", **kwargs).save()

    @classmethod
    def create_parasha(cls, **kwargs):
        cls.generate_calendar(key="Parashat Hashavua", **kwargs).save()

    @classmethod
    def create_haftarah(cls, **kwargs):
        cls.generate_calendar(key="Haftarah", **kwargs).save()

    @classmethod
    def create_929(cls, **kwargs):
        cls.generate_calendar(key="929", **kwargs).save()

    @classmethod
    def create_daily_mishnah(cls, **kwargs):
        cls.generate_calendar(key="Daily Mishnah", **kwargs).save()

    ###
    @classmethod
    def generate_calendar(cls, key="Parashat Hashavua", **kwargs):
        from sefaria.utils.calendars import get_keyed_calendar_items
        cal = get_keyed_calendar_items()[key]
        ref = cal["ref"]
        title = cal["displayValue"]
        lead = cal["title"]
        return cls._generate_shared_story(ref=ref, lead=lead, title=title, **kwargs)

    @classmethod
    def generate_from_user_history(cls, hist, **kwargs):
        assert isinstance(hist, user_profile.UserHistory)
        if getattr(hist, "is_sheet", None):
            stripped_title = strip_tags(hist.sheet_title)
            return cls._generate_user_story(uid=hist.uid, title={"en": stripped_title, "he": stripped_title}, ref=hist.ref, versions=hist.versions, timestamp=hist.time_stamp, **kwargs)
        else:
            return cls._generate_user_story(uid=hist.uid, ref=hist.ref, versions=hist.versions, timestamp=hist.time_stamp, **kwargs)


class AuthorStoryFactory(AbstractStoryFactory):
    @classmethod
    def _data_object(cls, **kwargs):
        prs = kwargs.get("person")
        if isinstance(prs, basestring):
            prs = person.Person().load({"key": prs})
        assert isinstance(prs, person.Person)
        return {"author_key": prs.key, "example_work": random.choice(prs.get_indexes()).title}

    @classmethod
    def _story_form(cls, **kwargs):
        return "author"

    @classmethod
    def create_random_shared_story(cls):
        p = cls._select_random_person()
        story = cls._generate_shared_story(person=p)
        story.save()

    @classmethod
    def _select_random_person(cls):
        eras = ["GN", "RI", "AH", "CO"]
        ps = person.PersonSet({"era": {"$in": eras}})

        p = random.choice(ps)
        while not cls._can_use_person(p):
            p = random.choice(ps)

        #todo: Any way to avoid loading this whole set?
        #todo: check against most recent X to avoid dupes.
        return p

    @classmethod
    def _can_use_person(cls, p):
        if not isinstance(p, person.Person):
            return False
        if not p.has_indexes():
            return False
        if not getattr(p, "enBio", False):
            return False
        if not getattr(p, "heBio", False):
            return False

        return True


class UserSheetsFactory(AbstractStoryFactory):
    """
    "userSheets"
        "user_id"
        "sheet_ids"
        "sheets" (derived)
    """
    @classmethod
    def _data_object(cls, **kwargs):
        author_uid = kwargs.get("author_uid")
        sheets = db.sheets.find({"owner": int(author_uid)}, {"id": 1}).sort([["views", -1]]).limit(4)
        sheet_ids = [s["id"] for s in sheets]
        return {"publisher_id": author_uid, "sheet_ids": sheet_ids}

    @classmethod
    def _story_form(cls, **kwargs):
        return "userSheets"

    @classmethod
    def create_shared_story(cls, author_uid, **kwargs):
        story = cls._generate_shared_story(author_uid=author_uid, **kwargs)
        story.save()

    @classmethod
    def create_user_story(cls, uid, author_uid, **kwargs):
        story = cls._generate_user_story(uid=uid, author_uid=author_uid, **kwargs)
        story.save()


class GroupSheetListFactory(AbstractStoryFactory):
    """
        "title" : {
            "he"
            "en"
        }
        "group_image"
        "group_url"
        "group_name"
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"},
              "publisher_id"
              "publisher_name" (derived)
              "publisher_url" (derived)
              "publisher_image" (derived)
              "publisher_position" (derived)
              "publisher_followed" (derived)
            },
            {...}]

    """
    @classmethod
    def _data_object(cls, **kwargs):
        from sefaria.model.group import Group
        sheet_ids = kwargs.get("sheet_ids")
        g = Group().load({"name": kwargs.get("group_name")})
        assert g
        return {
            "sheet_ids": sheet_ids,
            "group_image": getattr(g, "imageUrl", ""),
            "group_url": g.url,
            "title": {"en": g.name, "he": g.name}
        }

    @classmethod
    def _story_form(cls, **kwargs):
        return "groupSheetList"

    @classmethod
    def create_shared_story(cls, group_name, sheet_ids, **kwargs):
        story = cls._generate_shared_story(group_name=group_name, sheet_ids=sheet_ids, **kwargs)
        story.save()

    @classmethod
    def create_user_story(cls, uid, group_name, sheet_ids, **kwargs):
        story = cls._generate_user_story(uid=uid, group_name=group_name, sheet_ids=sheet_ids, **kwargs)
        story.save()


class SheetListFactory(AbstractStoryFactory):
    """
        "title" : {
            "he"
            "en"
        }
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"},
              "publisher_id"
              "publisher_name" (derived)
              "publisher_url" (derived)
              "publisher_image" (derived)
              "publisher_position" (derived)
              "publisher_followed" (derived)
            },
            {...}]

    """
    @classmethod
    def _data_object(cls, **kwargs):
        title = kwargs.get("title", {"en": "Recommended for You", "he": u"מומלץ"})

        return {
            "sheet_ids": kwargs.get("sheet_ids"),
            "title": title,
        }

    @classmethod
    def _story_form(cls, **kwargs):
        return "sheetList"

    @classmethod
    def _get_featured_ids(cls, k):
        shts = db.sheets.find({"is_featured": True}, {"id":1})
        ids = [s["id"] for s in shts]
        return random.sample(ids, k)

    @classmethod
    def _get_topic_sheet_ids(cls, topic, k=3):
        from sefaria.sheets import SheetSet
        sheets = SheetSet({"tags": topic, "status": "public"}, proj={"id": 1}, sort=[("views", -1)], limit=k)
        return [s.id for s in sheets]

    @classmethod
    def generate_topic_story(cls, topic, **kwargs):
        t = text.Term.normalize(topic)
        return cls._generate_story(sheet_ids=cls._get_topic_sheet_ids(topic), title={"en": t, "he": hebrew_term(t)}, **kwargs)

    @classmethod
    def create_topic_story(cls, topic, **kwargs):
        cls.generate_topic_story(topic, **kwargs).save()

    @classmethod
    def generate_featured_story(cls, **kwargs):
        return cls._generate_story(sheet_ids=cls._get_featured_ids(3), title={"en": "Popular", "he": u"מומלץ"}, **kwargs)

    @classmethod
    def create_featured_story(cls, **kwargs):
        cls.generate_featured_story(**kwargs).save()


class TopicListStoryFactory(AbstractStoryFactory):
    """
    "topicList"
        topics: [{en, he}, ...]

    """
    @classmethod
    def _data_object(cls, **kwargs):
        days = kwargs.get("days", 14)
        from sefaria import sheets
        tags = sheets.recent_public_tags(days=days, ntags=6)
        normal_tags = [text.Term.normalize(tag["tag"]) for tag in tags]
        # todo: handle possibility of Hebrew terms trending.
        return {"topics": [{"en": tag, "he": hebrew_term(tag)} for tag in normal_tags]}

    @classmethod
    def _story_form(cls, **kwargs):
        return "topicList"

    @classmethod
    def create_shared_story(cls, **kwargs):
        cls._generate_shared_story(**kwargs).save()


class TopicTextsStoryFactory(AbstractStoryFactory):
    """
    "topicTexts"
        "title"
            "en"
            "he"
        "refs"
        "texts" (derived)
            [{"ref", "heRef", "en","he"}, ...]
    """

    @classmethod
    def _data_object(cls, **kwargs):
        t = kwargs.get("topic")
        trefs = kwargs.get("refs")
        num = kwargs.get("num", 2)

        t = text.Term.normalize(t)

        if not trefs:
            from . import topic
            topic_manager = topic.get_topics()
            topic_obj = topic_manager.get(t)
            trefs = [pair[0] for pair in topic_obj.sources[:num]]

        normal_refs = [text.Ref(ref).normal() for ref in trefs]

        d = {
            "title": {
                "en": t,
                "he": hebrew_term(t)
            },
            "refs": normal_refs
        }

        return d

    @classmethod
    def _story_form(cls, **kwargs):
        return "topicTexts"

    @classmethod
    def create_shared_story(cls, topic, **kwargs):
        cls._generate_shared_story(topic=topic, **kwargs).save()

    @classmethod
    def generate_random_shared_story(cls, **kwargs):
        from . import topic

        topics_filtered = filter(lambda x: x['count'] > 15, topic.get_topics().list())
        random_topic = random.choice(topics_filtered)['tag']

        return cls._generate_shared_story(topic=random_topic, **kwargs)

    @classmethod
    def create_random_shared_story(cls, **kwargs):
        cls.generate_random_shared_story(**kwargs).save()
