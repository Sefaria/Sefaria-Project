
from itertools import groupby
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from sefaria.utils.users import user_name
from . import abstract as abst
from . import text
from . import place
from . import time
from . import link

import logging
logger = logging.getLogger(__name__)


class Garden(abst.AbstractMongoRecord):
    """
    https://saravanamudaliar.files.wordpress.com/2014/03/102_5996.jpg
    """
    collection = 'garden'
    track_pkeys = True
    pkeys = ["key"]

    required_attrs = [
        'key',
        'title',
        'heTitle'
    ]
    optional_attrs = [

    ]

    def stopSet(self, sort=None):
        if not sort:
            sort = [("start", 1)]
        return GardenStopSet({"garden": self.key}, sort=sort)

    def relSet(self, sort=None):
        if not sort:
            sort = [("start", 1)]
        return GardenStopRelationshipSet({"garden": self.key}, sort=sort)

    def placeSet(self):
        placeKeys = GardenStopSet({"garden": self.key}).distinct("placeKey")
        return place.PlaceSet({"key": {"$in": placeKeys}})

    def stopsByTime(self):
        res = []
        stops = self.stopSet()
        for k, g in groupby(stops, lambda s: (getattr(s, "start", "unknown"), getattr(s, "end", "unknown"))):
            res.append((k, [s.contents() for s in g]))
        return res

    def stopsByPlace(self):
        res = []
        stops = self.stopSet(sort=[("placeKey", 1)])
        for k, g in groupby(stops, lambda s: getattr(s, "placeKey", "unknown")):
            res.append((k, [s.contents() for s in g]))
        return res

    def stopsByAuthor(self):
        from . import person

        res = []
        unknown = []

        stops = self.stopSet(sort=[("start", 1), ("authors", 1)])
        for k, g in groupby(stops, lambda s: getattr(s, "authors", None)):
            if not k:
                unknown.extend([s.contents() for s in g])
            else:
                res.append(([person.Person().load({"key":p}) for p in k], [s.contents() for s in g]))
        res.append(("unknown", unknown))
        return res

    def stopsByTag(self):
        by_tag = {}
        stops = self.stopSet()

        for stop in stops:
            for tag in getattr(stop, "tags", []):
                if by_tag.get(tag):
                    by_tag[tag].append(stop.contents())
                else:
                    by_tag[tag] = [stop.contents()]

        return by_tag

    def add_stop(self, attrs):
        gs = GardenStop(attrs)
        gs.garden = self.key
        try:
            gs.save()
        except Exception as e:
            logger.warning("Failed to add stop to Garden {}. {}".format(self.title, e))

    def add_relationship(self, attrs):
        gs = GardenStopRelationship(attrs)
        gs.garden = self.key
        try:
            gs.save()
        except Exception as e:
            logger.warning("Failed to add relationship to Garden {}. {}".format(self.title, e))

    def import_sheets_by_user(self, user_id):
        sheet_list = db.sheets.find({"owner": int(user_id), "status": {"$ne": 5}})
        for sheet in sheet_list:
            self.import_sheet(sheet["id"])

    def import_sheets_by_tag(self, tag):
        from sefaria.sheets import get_sheets_by_tag

        sheet_list = get_sheets_by_tag(tag)
        for sheet in sheet_list:
            self.import_sheet(sheet["id"])

    def get_linkset(self):
        """
        Given the current Ref set of the Garden, looks for Links in the core repository, and turns them into GardenStopRelationships
        """
        trefs = GardenStopSet({"garden": self.key}).distinct("ref")
        regexes = set()
        refs1Clauses = []
        refs0Clauses = []

        for tref in trefs:
            try:
                ref = text.Ref(tref)
            except:
                continue
            regexes.update(ref.regex(as_list=True))

        for rgx in regexes:
            refs1Clauses += [{"refs.1": {"$regex": rgx}}]
            refs0Clauses += [{"refs.0": {"$regex": rgx}}]

        return link.LinkSet({"$and": [{"$or": refs0Clauses}, {"$or": refs1Clauses}]})

    def import_sheet(self, sheet_id):
        from sefaria.sheets import Sheet, refine_ref_by_text

        sheet = Sheet().load({"id":sheet_id})
        if not sheet:
            logger.warning("Failed to load sheet {}".format(sheet_id))

        def process_sources(sources, tags):
            for source in sources:
                if "ref" in source:
                    text = source.get("text", {}).get("he", None)
                    ref = refine_ref_by_text(source["ref"], text) if text else source["ref"]

                    self.add_stop({
                        "type": "inside_source",
                        "ref": ref,
                        "enText": source['text'].get("en"),
                        "heText": source['text'].get("he"),
                        "tags": tags
                    })
                elif "outsideBiText" in source:
                    self.add_stop({
                        "type": "outside_source",
                        "enText": source['outsideBiText'].get("en"),
                        "heText": source['outsideBiText'].get("he"),
                        "tags": tags
                    })
                elif "outsideText" in source:
                    self.add_stop({
                        "type": "outside_source",
                        "enText": source['outsideText'],
                        "tags": tags
                    })
                elif "comment" in sources:
                    self.add_stop({
                        "type": "blob",
                        "enText": source['comment'],
                        "tags": tags
                    })

                if "subsources" in source:
                    process_sources(source["subsources"], tags)

        process_sources(sheet.sources, getattr(sheet, "tags", []) + [user_name(sheet.owner)])
        return self


class GardenSet(abst.AbstractMongoSet):
    recordClass = Garden


class GardenStop(abst.AbstractMongoRecord):
    collection = 'garden_stop'
    track_pkeys = True
    pkeys = ["ref"]

    required_attrs = [
        'garden',
        'type'  # inside_source, outside_source, blob
                # todo: Subclass these?
    ]
    optional_attrs = [
        'ref',
        'title',
        'enVersionTitle',
        'heVersionTitle',
        'enText',
        'heText',
        'tags',
        "start",
        "startIsApprox",
        "end",
        "endIsApprox",
        'placeKey',
        'placeNameEn',
        'placeNameHe',
        'placeGeo',
        'authors'
    ]

    def hasCustomText(self, lang):
        assert lang, u"hasCustomText() requires a language code"
        if lang == "en":
            return bool(getattr(self, 'enText', False))
        elif lang == "he":
            return bool(getattr(self, 'heText', False))
        else:
            return bool(getattr(self, 'enText', False)) or bool(getattr(self, 'heText', False))

    # on initial value of ref, and change of ref, derive metadata.
    # todo: do we have to support override of this info?

    def _derive_metadata(self):
        if not getattr(self, "ref", None):
            return
        i = text.Ref(self.ref).index
        assert isinstance(i, text.AbstractIndex)
        if getattr(i, "authors", None):
            self.authors = i.authors
        author = i.author_objects()[0] if len(i.author_objects()) > 0 else {}  # Assume first is best

        placeKey = getattr(i, "compPlace", None) or getattr(author, "deathPlace", None) or getattr(author, "birthPlace", None)
        if placeKey:
            pobj = place.Place().load({"key": placeKey})
            if not pobj:
                raise InputError("Failed to find place with key {} while resolving metadata for {}".format(placeKey, self.ref))
            self.placeKey = placeKey
            self.placeNameEn = pobj.primary_name("en")
            self.placeNameHe = pobj.primary_name("he")
            self.placeGeo = pobj.get_location()

        if getattr(i, "compDate", None):
            errorMargin = int(getattr(i, "errorMargin", 0))
            self.startIsApprox = self.endIsApprox = errorMargin > 0

            try:
                year = int(getattr(i, "compDate"))
                self.start = year - errorMargin
                self.end = year + errorMargin
            except ValueError as e:
                years = getattr(i, "compDate").split("-")
                if years[0] == "" and len(years) == 3:  #Fix for first value being negative
                    years[0] = -int(years[1])
                    years[1] = int(years[2])
                self.start = int(years[0]) - errorMargin
                self.end = int(years[1]) + errorMargin

        elif author and author.mostAccurateTimePeriod():
            tp = author.mostAccurateTimePeriod()
            self.start = tp.start
            self.end = tp.end
            self.startIsApprox = tp.startIsApprox
            self.endIsApprox = tp.endIsApprox

    def _normalize(self):
        if self.is_key_changed("ref"):
            self._derive_metadata()

    def time_period(self):
        if not getattr(self, "start", False):
            return None
        return time.TimePeriod({
            "start": self.start,
            "startIsApprox": getattr(self, "startIsApprox", False),
            "end": self.end,
            "endIsApprox": getattr(self, "endIsApprox", False)
        })

    def place(self):
        return place.Place().load({"key": self.placeKey})

class GardenStopSet(abst.AbstractMongoSet):
    recordClass = GardenStop


class GardenStopRelationship(abst.AbstractMongoRecord):
    collection = 'garden_rel'
    required_attrs = [
        'garden'
    ]
    optional_attrs = [

    ]

class GardenStopRelationshipSet(abst.AbstractMongoSet):
    recordClass = GardenStopRelationship



"""
def process_index_title_change_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(kwargs["old"]))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|(^({}) on {} \d)".format(re.escape(kwargs["old"]), "|".join(commentators), re.escape(kwargs["old"]))
        #pattern = r'(^{} \d)|( on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    links = LinkSet({"refs": {"$regex": pattern}})
    for l in links:
        l.refs = [r.replace(kwargs["old"], kwargs["new"], 1) if re.search(pattern, r) else r for r in l.refs]
        try:
            l.save()
        except InputError: #todo: this belongs in a better place - perhaps in abstract
            logger.warning("Deleting link that failed to save: {} {}".format(l.refs[0], l.refs[1]))
            l.delete()


def process_index_delete_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = ur'^{} on '.format(re.escape(indx.title))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|^({}) on {} \d".format(re.escape(indx.title), "|".join(commentators), re.escape(indx.title))
    LinkSet({"refs": {"$regex": pattern}}).delete()
"""