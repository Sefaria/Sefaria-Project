# -*- coding: utf-8 -*-

"""
story.py
"""

import time
import bleach
import random
from datetime import datetime

from sefaria.utils.hebrew import hebrew_term
from sefaria.utils.talmud import amud_ref_to_daf_ref
from sefaria.utils.util import strip_tags
from sefaria.system.database import db
from . import abstract as abst
from . import user_profile
from . import person
from . import text
from . import following
from . import ref_data
from . import passage

import logging
logger = logging.getLogger(__name__)


class Story(abst.AbstractMongoRecord):

    @staticmethod
    def sheet_metadata(sheet_id, return_id=False):
        from sefaria.sheets import get_sheet_metadata
        metadata = get_sheet_metadata(sheet_id)
        if not metadata:
            return None

        d = {
            "sheet_title": strip_tags(metadata["title"]),
            "sheet_summary": strip_tags(metadata["summary"]) if "summary" in metadata else "",
            "publisher_id": metadata["owner"]
        }
        if return_id:
            d["sheet_id"] = sheet_id
        return d

    @staticmethod
    def publisher_metadata(publisher_id, return_id=False):
        udata = user_profile.public_user_data(publisher_id)
        d = {
            "publisher_name": udata["name"],
            "publisher_url": udata["profileUrl"],
            "publisher_image": udata["imageUrl"],
            "publisher_position": udata["position"],
            "publisher_organization": udata["organization"],
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

        #todo: if this is a sheet Ref, thing go sideways.
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
            d.update(self.publisher_metadata(d["publisher_id"]))

        if "sheet_id" in d:
            d.update(self.sheet_metadata(d["sheet_id"]))

        if "sheet_ids" in d:
            d["sheets"] = [self.sheet_metadata(i, return_id=True) for i in d["sheet_ids"]]
            if "publisher_id" not in d:
                for sheet_dict in d["sheets"]:
                    sheet_dict.update(self.publisher_metadata(sheet_dict["publisher_id"]))

        if "author_key" in d:
            p = person.Person().load({"key": d["author_key"]})
            d["author_names"] = {"en": p.primary_name("en"), "he": p.primary_name("he")}
            d["author_bios"] = {"en": p.enBio, "he": p.heBio}

        return c


"""
Mapping of Global Notification "type" to "storyForm":
    "general": "freeText"
    "index"  : "newIndex"
    "version": "newVersion"

storyForms relate to React components.  There is an explicit mapping in HomeFeed.jsx 

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
        "mustHave",      # traits a user must have to get this story
        "cantHave"       # traits that a user can't have and see this story
    ]

    """
    def must_have(self, traits=None):
        self.mustHave = getattr(self, "mustHave", []) + traits
        return self

    def cant_have(self, traits=None):
        self.cantHave = getattr(self, "cantHave", []) + traits
        return self
    """

    def _init_defaults(self):
        self.timestamp = int(time.time())
        self.mustHave = []
        self.cantHave = []

    @staticmethod
    def latest_id():
        n = db.shared_story.find_one({}, {"_id": 1}, sort=[["_id", -1]])
        if not n:
            return None
        return n["_id"]

    @classmethod
    def from_global_notification(cls, gn):
        mapping = {
            "general": "freeText",
            "index": "newIndex",
            "version": "newVersion"
        }

        return cls({
            "storyForm": mapping[gn.type],
            "data": gn.content,
            "timestamp": int((gn.date - datetime(1970, 1, 1)).total_seconds())
        })


class SharedStorySet(abst.AbstractMongoSet):
    recordClass = SharedStory

    def __init__(self, query=None, page=0, limit=0, sort=None):
        sort = sort or [["timestamp", -1]]
        super(SharedStorySet, self).__init__(query=query, page=page, limit=limit, sort=sort)

    @classmethod
    def for_traits(cls, traits, query=None, page=0, limit=0, sort=None):
        q = {
            "$or": [{"mustHave": {"$exists": False}}, {"$expr": {"$setIsSubset": ["$mustHave", traits]}}],
            "cantHave": {"$nin": traits}
        }
        if query is not None:
            q.update(query)
        return cls(q, limit=limit, page=page, sort=sort)

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
    def from_sheet_publish_notification(cls, pn):
        return cls.from_sheet_publish(
            pn.uid,
            pn.content["publisher"],
            pn.content["sheet_id"],
            timestamp=int((pn.date - datetime(1970, 1, 1)).total_seconds())
        )

    @classmethod
    def from_sheet_publish(cls, user_id, publisher_id, sheet_id, timestamp = None):
        c = cls({
            "storyForm": "publishSheet",
            "uid": user_id,
            "data": {
                "publisher_id": publisher_id,
                "sheet_id": sheet_id
            }
        })
        if timestamp is not None:
            c.timestamp = timestamp
        return c


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
    def _add_shared_stories(uid, traits):
        """
        Add user story records for any new shared stories
        :param uid: integer
        :param traits: list of strings
        :return:
        """
        #todo: is there a quicker way to short circuit this, and avoid these queries, when it has recently been updated?
        # This current check will fail if the latest shared story excludes this user
        latest_id_for_user = UserStory.latest_shared_for_user(uid)
        latest_shared_id = SharedStory.latest_id()
        if latest_shared_id and (latest_shared_id != latest_id_for_user):
            query = {"_id": {"$gt": latest_id_for_user}} if latest_id_for_user is not None else None
            SharedStorySet.for_traits(traits, query=query, limit=10).register_for_user(uid)

    def contents(self, **kwargs):
        if self.uid:
            followees = following.FolloweesSet(self.uid).uids
            return super(UserStorySet, self).contents(followees=followees, **kwargs)
        else:
            return super(UserStorySet, self).contents(**kwargs)

    @classmethod
    def recent_for_user(cls, uid, traits, page=0, limit=10):
        """
        Loads recent stories for uid.
        """
        cls._add_shared_stories(uid, traits)
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
    def generate_story(cls, **kwargs):
        if kwargs.get("uid"):
            return cls._generate_user_story(**kwargs)
        else:
            return cls._generate_shared_story(**kwargs)

    @classmethod
    def _generate_shared_story(cls, **kwargs):
        return SharedStory({
            "storyForm": cls._story_form(**kwargs),
            "data": cls._data_object(**kwargs),
            "mustHave": kwargs.get("mustHave", []),
            "cantHave": kwargs.get("cantHave", [])
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
        return {
            "en": kwargs.get("en"),
            "he": kwargs.get("he"),
            "title": kwargs.get("title"),
            "lead": kwargs.get("lead"),
        }

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
        if kwargs.get("lead") and kwargs.get("lead").get("en") and kwargs.get("lead").get("he"):
            d["lead"] = kwargs.get("lead")

        if kwargs.get("versions"):
            d["versions"] = kwargs.get("versions")

        return d

    @classmethod
    def _story_form(cls, **kwargs):
        return "textPassage"

    """
    @classmethod
    def create_parasha(cls, **kwargs):
        def _create_parasha_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry
            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]
            cls._generate_shared_story(ref=cal["ref"], lead=cal["title"], title=cal["displayValue"],
                                       mustHave=mustHave or [], **kwargs).save()
        create_israel_and_diaspora_stories(_create_parasha_story, **kwargs)
    """

    @classmethod
    def create_haftarah(cls, **kwargs):
        def _create_haftarah_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.utils.calendars import make_haftarah_response_from_calendar_entry
            cal = make_haftarah_response_from_calendar_entry(parasha_obj)[0]
            cls._generate_shared_story(ref=cal["ref"], lead=cal["title"], title=cal["displayValue"],
                                       mustHave=mustHave or [], **kwargs).save()
        create_israel_and_diaspora_stories(_create_haftarah_story, **kwargs)

    @classmethod
    def create_aliyah(cls, **kwargs):
        def _create_aliyah_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry, aliyah_ref
            from django.utils import timezone
            from . import schema

            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]

            isoweekday = timezone.now().isoweekday()
            aliyah = 1 if isoweekday == 7 else isoweekday + 1
            lead = {"en": "Weekly Torah Portion", "he": cal["title"]["he"]}

            if aliyah >= 6:  # Friday
                ref = aliyah_ref(parasha_obj, 6).to(aliyah_ref(parasha_obj, 7)).normal()
                title = {"en": cal["displayValue"]["en"] + ", Sixth and Seventh Aliyah",
                         "he": cal["displayValue"]["he"] + u" - " + u"שישי ושביעי"}
            else:
                ref = aliyah_ref(parasha_obj, aliyah).normal()
                title = {"en": cal["displayValue"]["en"] + ", " + schema.AddressAliyah.en_map[aliyah - 1] + " Aliyah",
                         "he": cal["displayValue"]["he"] + u" - " + schema.AddressAliyah.he_map[aliyah - 1]}
            cls._generate_shared_story(ref=ref, lead=lead, title=title, mustHave=mustHave or [], **kwargs).save()

        create_israel_and_diaspora_stories(_create_aliyah_story, **kwargs)

    """
    @classmethod
    def create_daf_yomi(cls, **kwargs):
        cls.generate_calendar(key="Daf Yomi", **kwargs).save()
    """

    @classmethod
    def create_daf_yomi(cls, **kwargs):
        daf_ref = daf_yomi_ref()
        top_ref = ref_data.RefDataSet.from_ref(daf_ref).top_ref()
        sugya = passage.Passage.containing_segment(top_ref)

        cls._generate_shared_story(
            ref=sugya.ref().normal(),
            lead={'en': 'Daf Yomi', 'he': u"דף יומי"},
            title=daf_yomi_display_value(),
            **kwargs
        ).save()

    @classmethod
    def create_929(cls, **kwargs):
        cls.generate_calendar(key="929", **kwargs).save()

    @classmethod
    def create_daily_mishnah(cls, **kwargs):
        cls.generate_calendar(key="Daily Mishnah", **kwargs).save()

    @classmethod
    def generate_calendar(cls, key="Daf Yomi", **kwargs):
        from sefaria.utils.calendars import get_keyed_calendar_items
        cal = get_keyed_calendar_items()[key]
        ref = cal["ref"]
        title = cal["displayValue"]
        lead = cal["title"]
        return cls._generate_shared_story(ref=ref, lead=lead, title=title, **kwargs)

    @classmethod
    def generate_from_user_history(cls, hist, **kwargs):
        assert isinstance(hist, user_profile.UserHistory)
        return cls._generate_user_story(uid=hist.uid, ref=hist.ref, versions=hist.versions, timestamp=hist.time_stamp, **kwargs)


class MultiTextStoryFactory(AbstractStoryFactory):
    """
    "multiText"
        "title"
            "en"
            "he"
        "lead"
            "en"
            "he"
        "refs"
        "texts" (derived)
            [{"ref", "heRef", "en","he"}, ...]
    """

    @classmethod
    def _data_object(cls, **kwargs):
        trefs = kwargs.get("refs")
        normal_refs = [text.Ref(ref).normal() for ref in trefs]

        return {
            "title": kwargs.get("title"),
            "lead": kwargs.get("lead"),
            "refs": normal_refs
        }

    @classmethod
    def _story_form(cls, **kwargs):
        return "multiText"

    @classmethod
    def create_daf_connection_story(cls, **kwargs):
        # todo: use reccomendation engine
        daf_ref = daf_yomi_ref()
        connection_link, connection_ref = random_connection_to(daf_ref)

        if not connection_ref:
            return

        category = connection_ref.index.categories[0]

        mustHave = []
        if not connection_ref.is_text_translated():
            mustHave += ["readsHebrew"]

        if category == "Talmud":
            title = {"en": "Related Passage", "he": u"סוגיה קשורה"}
        else:
            title = {"en": category + " on the Daf", "he": hebrew_term(category) + u" " + u"על הדף"}

        try:
            cls.generate_story(
                refs = [connection_link.ref_opposite(connection_ref).normal(), connection_ref.normal()],
                title=title,
                lead={'en': 'Daf Yomi', 'he': u"דף יומי"},
                mustHave=mustHave,
                **kwargs
            ).save()
        except AttributeError:
            # connection_link.ref_opposite(connection_ref).normal() err's out ... why?
            return

    @classmethod
    def create_parasha_verse_connection_stories(cls, iteration=1, **kwargs):
        def _create_parasha_verse_connection_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry
            from . import ref_data

            mustHave = mustHave or []

            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]
            parasha_ref = text.Ref(parasha_obj["ref"])

            top_ref = ref_data.RefDataSet.from_ref(parasha_ref).nth_ref(iteration)

            connection_link, connection_ref = random_connection_to(top_ref)
            if not connection_ref:
                return

            category = connection_ref.index.categories[0]

            if not connection_ref.is_text_translated():
                mustHave += ["readsHebrew"]

            cls.generate_story(
                refs = [top_ref.normal(), connection_ref.normal()],
                title={"en": category + " on " + cal["displayValue"]["en"], "he": hebrew_term(category) + u" על " + cal["displayValue"]["he"]},
                lead={"en": "Weekly Torah Portion", "he": u'פרשת השבוע'},
                mustHave=mustHave,
                **kwargs
            ).save()

        create_israel_and_diaspora_stories(_create_parasha_verse_connection_story, **kwargs)

    @classmethod
    def create_parasha_verse_commentator_stories(cls, iteration=1, **kwargs):
        def _create_parasha_verse_commentator_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry
            from . import ref_data

            mustHave = mustHave or []

            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]
            parasha_ref = text.Ref(parasha_obj["ref"])

            top_ref = ref_data.RefDataSet.from_ref(parasha_ref).nth_ref(iteration)

            commentary_ref = random_commentary_on(top_ref)
            if not commentary_ref:
                return

            if not commentary_ref.is_text_translated():
                mustHave += ["readsHebrew"]
            commentator = commentary_ref.index.collective_title

            cls.generate_story(
                refs = [top_ref.normal(), commentary_ref.normal()],
                title={"en": commentator + " on " + cal["displayValue"]["en"], "he": hebrew_term(commentator) + u" על " + cal["displayValue"]["he"]},
                lead={"en": "Weekly Torah Portion", "he": u'פרשת השבוע'},
                mustHave=mustHave,
                **kwargs
            ).save()

        create_israel_and_diaspora_stories(_create_parasha_verse_commentator_story, **kwargs)


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
              "publisher_organization" (derived)
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

        d = {
            "sheet_ids": sheet_ids,
            "group_image": getattr(g, "imageUrl", ""),
            "group_url": g.url,
            "title": kwargs.get("title",{"en": g.name, "he": g.name}),
            "cozy": kwargs.get("cozy", False)
        }
        if kwargs.get("lead") and kwargs.get("lead").get("en") and kwargs.get("lead").get("he"):
            d["lead"] = kwargs.get("lead")
        return d

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

    @classmethod
    def create_nechama_sheet_stories(cls, **kwargs):
        def _create_nechama_sheet_story(parasha_obj, mustHave=None, **kwargs):
            #todo: grab English sheet and show to English only users
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry
            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]

            sheets = db.sheets.find({"status": "public", "group": u"גיליונות נחמה", "tags": parasha_obj["parasha"]}, {"id": 1})
            sheets = [s for s in sheets]
            selected = random.sample(sheets, 3)
            if len(selected) < 3:
                return

            mustHave = mustHave or []
            mustHave = mustHave + ["readsHebrew"]

            cls.generate_story(
                sheet_ids=[s["id"] for s in selected],
                cozy=True,
                group_name=u"גיליונות נחמה",
                title={"en": "Nechama on " + cal["displayValue"]["en"], "he": u"נחמה על " + cal["displayValue"]["he"]},
                lead={"en": "Weekly Torah Portion", "he": u'פרשת השבוע'},
                mustHave=mustHave,
                **kwargs
            ).save()

        create_israel_and_diaspora_stories(_create_nechama_sheet_story, **kwargs)


class SheetListFactory(AbstractStoryFactory):
    """
        "title" : {
            "he"
            "en"
        }
        lead: {
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
              "publisher_organization" (derived)
              "publisher_followed" (derived)
            },
            {...}]

    """
    @classmethod
    def _data_object(cls, **kwargs):
        title = kwargs.get("title", {"en": "Recommended for You", "he": u"מומלץ"})

        d = {
            "sheet_ids": kwargs.get("sheet_ids"),
            "title": title,
        }

        if kwargs.get("lead") and kwargs.get("lead").get("en") and kwargs.get("lead").get("he"):
            d["lead"] = kwargs.get("lead")

        return d

    @classmethod
    def _story_form(cls, **kwargs):
        return "sheetList"

    @classmethod
    def _get_featured_ids(cls, k):
        shts = db.sheets.find({"is_featured": True}, {"id": 1})
        ids = [s["id"] for s in shts]
        return random.sample(ids, k)

    @classmethod
    def _get_topic_sheet_ids(cls, topic, k=3, page=0):
        from sefaria.sheets import get_sheets_by_tag
        sheets = get_sheets_by_tag(topic, limit=k, proj={"id": 1}, page=page)
        return [s["id"] for s in sheets]
        # sheets = SheetSet({"tags": topic, "status": "public"}, proj={"id": 1}, sort=[("views", -1)], limit=k)
        # return [s.id for s in sheets]

    @classmethod
    def _get_daf_sheet_ids(cls):
        from sefaria.sheets import get_sheets_for_ref
        sheets = get_sheets_for_ref(daf_yomi_ref().normal())
        sorted_sheets = sorted(sheets, key=lambda s: s["views"], reverse=True)
        return [s["id"] for s in sorted_sheets[:3]]


    @classmethod
    def create_parasha_sheets_stories(cls, iteration=1, k=3, **kwargs):
        def _create_parasha_sheet_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry
            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]

            sheet_ids = cls._get_topic_sheet_ids(parasha_obj["parasha"], k=k, page=iteration-1)
            if len(sheet_ids) < k:
                return

            mustHave = mustHave or []
            mustHave = mustHave + ["usesSheets"]

            cls.generate_story(
                sheet_ids=sheet_ids,
                title={"en": "Sheets on " + cal["displayValue"]["en"], "he": u"גליונות על " + cal["displayValue"]["he"]},
                lead={"en": "Weekly Torah Portion", "he": u'פרשת השבוע'},
                mustHave=mustHave,
                **kwargs
            ).save()

        create_israel_and_diaspora_stories(_create_parasha_sheet_story, **kwargs)

    @classmethod
    def create_daf_sheet_story(cls, **kwargs):
        ids = cls._get_daf_sheet_ids()
        if ids:
            cls.generate_story(
                sheet_ids=cls._get_daf_sheet_ids(),
                title={"en": "On Today's Daf", "he": u"על דף היומי"},
                mustHave=["usesSheets"], **kwargs
            ).save()

    @classmethod
    def generate_topic_story(cls, topic, **kwargs):
        t = text.Term.normalize(topic)
        return cls.generate_story(sheet_ids=cls._get_topic_sheet_ids(topic), title={"en": t, "he": hebrew_term(t)}, **kwargs)

    @classmethod
    def create_topic_story(cls, topic, **kwargs):
        cls.generate_topic_story(topic, **kwargs).save()

    @classmethod
    def generate_featured_story(cls, **kwargs):
        return cls.generate_story(sheet_ids=cls._get_featured_ids(3), title={"en": "Popular", "he": u"מומלץ"}, **kwargs)

    @classmethod
    def create_featured_story(cls, **kwargs):
        cls.generate_featured_story(**kwargs).save()


class TopicListStoryFactory(AbstractStoryFactory):
    """
    "topicList"
        topics: [{en, he}, ...]
        title: {en, he}
        lead: {en, he}
    """
    @classmethod
    def _data_object(cls, **kwargs):
        normal_topics = [text.Term.normalize(topics) for topics in kwargs.get("topics")]
        # todo: handle possibility of Hebrew terms trending.
        return {
            "topics": [{"en": topic, "he": hebrew_term(topic)} for topic in normal_topics],
            "title": kwargs.get("title", {"en": "Trending Recently", "he": u"פופולרי"}),
            "lead": kwargs.get("lead", {"en": "Topics", "he": u"נושאים"})
        }

    @classmethod
    def _story_form(cls, **kwargs):
        return "topicList"

    @classmethod
    def create_trending_story(cls, **kwargs):
        days = kwargs.get("days", 7)
        from sefaria import sheets
        topics = [t["tag"] for t in sheets.trending_tags(days=days, ntags=6)]
        cls.create_shared_story(topics=topics)

    @classmethod
    def create_parasha_topics_stories(cls, iteration=1, k=6, **kwargs):
        def _create_parasha_topic_story(parasha_obj, mustHave=None, **kwargs):
            from sefaria.model.topic import get_topics
            from sefaria.utils.util import titlecase
            from sefaria.utils.calendars import make_parashah_response_from_calendar_entry

            page = iteration-1
            topics = get_topics()
            parasha = text.Term.normalize(titlecase(parasha_obj["parasha"]))
            topic = topics.get(parasha)
            related_topics = [t for t,x in topic.related_topics[page*k:page*k+k] if x > 1]
            if len(related_topics) < k:
                return

            cal = make_parashah_response_from_calendar_entry(parasha_obj)[0]

            cls.generate_story(
                topics=related_topics,
                title={"en": "Topics in " + cal["displayValue"]["en"], "he": u"נושאים ב" + cal["displayValue"]["he"]},
                lead={"en": "Weekly Torah Portion", "he": u'פרשת השבוע'},
                mustHave=mustHave or [],
                **kwargs
            ).save()

        create_israel_and_diaspora_stories(_create_parasha_topic_story, **kwargs)

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

        topics_filtered = filter(lambda x: x['good_to_promote'], topic.get_topics().list())
        random_topic = random.choice(topics_filtered)['tag']

        return cls._generate_shared_story(topic=random_topic, **kwargs)

    @classmethod
    def create_random_shared_story(cls, **kwargs):
        cls.generate_random_shared_story(**kwargs).save()


##### Utils #####

def daf_yomi_ref():
    from sefaria.utils.calendars import get_keyed_calendar_items
    cal = get_keyed_calendar_items()["Daf Yomi"]
    daf_ref = amud_ref_to_daf_ref(text.Ref(cal["ref"]))
    return daf_ref

def daf_yomi_display_value():
    from sefaria.utils.calendars import get_keyed_calendar_items
    return get_keyed_calendar_items()["Daf Yomi"]["displayValue"]


def random_commentary_on(ref):
    commentary_refs = [l.ref_opposite(ref) for l in filter(lambda x: x.type == "commentary", ref.linkset())]
    candidates = filter(lambda r: not r.is_empty(), commentary_refs)
    return random.choice(candidates)


def random_connection_to(ref):
    connection_refs = [(l, l.ref_opposite(ref)) for l in filter(lambda x: x.type != "commentary", ref.linkset())]

    def is_useful(r):
        if r.is_empty():
            return False
        category = r.index.categories[0]
        if category == "Tanakh" or category == "Reference":
            return False
        return True

    candidates = filter(lambda (link, ref): is_useful(ref), connection_refs)
    return random.choice(candidates)


def create_israel_and_diaspora_stories(create_story_fn, **kwargs):
    """
    Calls create_story_fn once if Parshiot are the same, or twice if Israel and Diaspora differ.
    create_story_fn has two args & **kwargs:
        parsha_obj
        mustHave: array of tags to be passed to created story
        **kwargs
    :param create_story_fn:
    :param kwargs:
    :return:
    """
    from django.utils import timezone
    from sefaria.utils.calendars import this_weeks_parasha
    now = timezone.localtime(timezone.now())
    il = this_weeks_parasha(now, diaspora=False)
    da = this_weeks_parasha(now, diaspora=True)

    if da["ref"] == il["ref"]:
        create_story_fn(il, **kwargs)
    else:
        create_story_fn(il, ["inIsrael"], **kwargs)
        create_story_fn(da, ["inDiaspora"], **kwargs)

'''
Turns out, not needed.
Leaving here for the moment, in case it proves useful.

def migrate_users_notifications_to_stories(uid):
    from . import notification as n
    #if the user has already been migrated
    #return

    for pn in n.NotificationSet({"type": "sheet publish", "uid": uid}, sort=[("_id", -1)]):
        UserStory.from_sheet_publish_notification(pn).save()

    for gn in n.GlobalNotificationSet(sort=[("_id", -1)]):
        gs = SharedStory.from_global_notification(gn).save()

        # get user notifications that refer to this global
        for un in n.NotificationSet({"is_global": True, "global_id": gn._id}):
            UserStory.from_shared_story(un.uid, gs).save()
'''