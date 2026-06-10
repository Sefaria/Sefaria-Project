# coding=utf-8

import copy
from itertools import groupby
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from . import abstract as abst
from . import text
from . import place
from . import timeperiod
from . import topic
from . import link
from . import user_profile

import structlog
logger = structlog.get_logger(__name__)


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
        'heTitle',
        'config'
    ]
    optional_attrs = [
        "subtitle",
        "heSubtitle"
    ]

    default_config = {
        "timeline_scale": "log",  # log / linear
        "timeline_bin_size": None,  # Number of years in a bin.  Defaults to ~20 bins in the extent
        "filter_order": [],
        "filter_rows": 9,  # Number of rows in row filters
        "filters": {
            "default": {
                "en": "Tags",
                "he": "תגיות",
                "logic": "AND",  # AND / OR
                "position": "SIDE"  # SIDE / TOP
            }
        },
        "sorts": {
            "start": {
                "en": "Date",
                "he": "תאריך",
                "datatype": "Int",  #Int, Str
                "default": "ASC"
            }
        }
    }

    def _set_derived_attributes(self):
        if getattr(self, "config", None) is None:
            self.config = copy.deepcopy(self.default_config)

    def updateConfig(self, config_dict):
        self.config.update(config_dict)

    def updateFilter(self, filterkey, filterdict):
        if self.config["filters"].get(filterkey):
            self.config["filters"][filterkey].update(filterdict)
        else:
            self.config["filters"][filterkey] = filterdict

    def removeFilter(self, filterkey):
        try:
            del self.config["filters"][filterkey]
        except KeyError:
            pass

    def updateSort(self, field, sortdict):
        self.config["sorts"][field] = sortdict

    def removeSort(self, field):
        try:
            del self.config["sorts"][field]
        except KeyError:
            pass

    def stopSet(self, sort=None):
        if not sort:
            sort = [("start", 1)]
        return GardenStopSet({"garden": self.key}, sort=sort)

    def relSet(self, sort=None):
        if not sort:
            sort = [("start", 1)]
        return GardenStopRelationSet({"garden": self.key}, sort=sort)

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

    def placeSet(self):
        pkeys = self.stopSet().distinct("placeKey")
        return place.PlaceSet({"key": {"$in": pkeys}})

    def stopsByAuthor(self):
        res = []
        unknown = []

        stops = self.stopSet(sort=[("start", 1), ("authors", 1)])
        for k, g in groupby(stops, lambda s: getattr(s, "authors", None)):
            if not k:
                unknown.extend([s.contents() for s in g])
            else:
                res.append(([topic.Topic.init(p) for p in k], [s.contents() for s in g]))
        res.append(("unknown", unknown))
        return res

    def stopsByTag(self):
        by_tag = {}
        stops = self.stopSet()

        for stop in stops:
            for typ, tags in getattr(stop, "tags", {}).items():
                if not by_tag.get(typ):
                    by_tag[typ] = {}

                for tag in tags:
                    if by_tag[typ].get(tag):
                        by_tag[typ][tag].append(stop.contents())
                    else:
                        by_tag[typ][tag] = [stop.contents()]

        return by_tag

    def stopData(self):
        return [i.contents() for i in self.stopSet()]

    def add_stop(self, attrs):
        if not attrs.get("tags"):
            attrs["tags"] = {"default": []}

        # Check for existing stop, based on Ref.
        if attrs.get("ref"):
            if attrs.get("enText") is None:
                try:
                    attrs["enText"] = text.TextChunk(text.Ref(attrs["ref"]), "en", attrs.get("enVersionTitle")).as_string()
                except Exception:
                    pass
            if attrs.get("heText") is None:
                try:
                    attrs["heText"] = text.TextChunk(text.Ref(attrs["ref"]), "he", attrs.get("heVersionTitle")).as_string()
                except Exception:
                    pass

            existing = GardenStop().load({"ref": attrs["ref"], "garden": self.key})
            if existing:
                existing.weight += 1

                # Merge tags
                if not getattr(existing, "tags", None):
                    existing.tags = attrs.get("tags")
                else:
                    for typ, tags in attrs.get("tags", {}).items():
                        if not existing.tags.get(typ):
                            existing.tags[typ] = attrs["tags"][typ]
                        else:
                            for tag in tags:
                                if tag not in existing.tags[typ]:
                                    existing.tags[typ].append(tag)

                if attrs.get("enText") and not getattr(existing, "enText", None):
                    existing.enText = attrs.get("enText")
                if attrs.get("heText") and not getattr(existing, "heText", None):
                    existing.enText = attrs.get("heText")

                existing.save()
                return

        # New Stop
        gs = GardenStop(attrs)
        gs.garden = self.key
        gs.weight = 1
        try:
            gs.save()
        except Exception as e:
            logger.warning("Failed to add stop to Garden {}. {}".format(self.title, e))

    def add_relationship(self, attrs):
        gs = GardenStopRelation(attrs)
        gs.garden = self.key
        try:
            gs.save()
        except Exception as e:
            logger.warning("Failed to add relationship to Garden {}. {}".format(self.title, e))

    def import_sheets_by_user(self, user_id):
        self.updateSort("weight", {"type": "Int", "en": "Weight", "he": "משקל"})
        sheet_list = db.sheets.find({"owner": int(user_id), "status": {"$ne": 5}})
        for sheet in sheet_list:
            self.import_sheet(sheet["id"])

    def import_sheets_by_tag(self, tag):
        from sefaria.sheets import get_sheets_by_topic

        self.updateFilter("Sheet Author", {"en": "Sheet Author", "he": "מחבר דף"})
        self.updateSort("weight", {"type": "Int", "en": "Weight", "he": "משקל"})
        sheet_list = get_sheets_by_topic(tag)
        for sheet in sheet_list:
            self.import_sheet(sheet["id"], remove_tags=[tag])

    # todo: this is way too slow.
    def get_links(self):
        """
        Given the current Ref set of the Garden, looks for Links in the core repository, and turns them into GardenStopRelations
        """
        trefs = GardenStopSet({"garden": self.key}).distinct("ref")
        regexes = set()
        refClauses = []
        links = []

        for tref in trefs:
            try:
                ref = text.Ref(tref)
            except:
                continue
            regexes.update(ref.regex(as_list=True))

        for rgx in regexes:
            refClauses += [{"refs.1": {"$regex": rgx}}]

        for rgx in regexes:
            print("Garden.get_links() - {}".format(rgx))
            links += [l for l in link.LinkSet({"$and": [{"refs.0": {"$regex": rgx}}, {"$or": refClauses}]})]

        return links

    def import_search(self, q):
        from sefaria.search import query
        res = query(q)

        self.updateFilter("default", {"en": "Categories", "he": "קטגוריות"})

        for hit in res["hits"]["hits"]:
            tags = {"default": hit["_source"]["path"].split("/")}
            stop = {
                "type": "inside_source",
                "ref": hit["_source"]["ref"],
                "enVersionTitle": hit["_source"]["version"],
                "tags": tags
            }
            if hit["_source"]["lang"] == "en":
                stop["enText"] = " ".join(hit["highlight"]["content"])
            elif hit["_source"]["lang"] == "he":
                stop["heText"] = " ".join(hit["highlight"]["content"])
            self.add_stop(stop)

    def import_ref_list(self, reflist, defaults=None):
        if defaults is None:
            defaults = {}
        self.updateFilter("default", {"en": "Categories", "he": "קטגוריות"})
        for ref in reflist:
            if isinstance(ref, str):
                try:
                    ref = text.Ref(ref)
                except:
                    pass
            if not isinstance(ref, text.Ref):
                continue

            stop_dict = {
                "type": "inside_source",
                "ref": ref.normal(),
                "tags": {"default": ref.index.categories}
            }

            if defaults.get("tags") is not None:
                stop_dict["tags"].update(defaults["tags"])
            stop_dict.update({k:v for k,v in list(defaults.items()) if k != "tags"})

            self.add_stop(stop_dict)
        return self

    def import_sheet(self, sheet_id, remove_tags=None):
        from sefaria.sheets import Sheet, refine_ref_by_text

        sheet = Sheet().load({"id": sheet_id})
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

        tags = getattr(sheet, "tags", [])
        if remove_tags:
            tags = [t for t in tags if t not in remove_tags]
        process_sources(sheet.sources, {"default": tags, "Sheet Author": [user_profile.user_name(sheet.owner)]})
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
        'heRef',
        'weight',
        'title',
        'heTitle',
        'enVersionTitle',
        'heVersionTitle',  # will we use this?
        'enSubtitle',
        'heSubtitle',
        'enText',
        'heText',
        'tags',  # dictionary of lists
        "start",
        "startIsApprox",
        "end",
        "endIsApprox",
        'placeKey',
        'placeNameEn',
        'placeNameHe',
        'placeGeo',  # keep this here?  Break into point and area?  "area or point"?
        'authors',
        'authorsEn',
        'authorsHe',
        'indexTitle',
        'timePeriodEn',
        'timePeriodHe'
    ]

    def hasCustomText(self, lang):
        assert lang, "hasCustomText() requires a language code"
        if lang == "en":
            return bool(getattr(self, 'enText', False))
        elif lang == "he":
            return bool(getattr(self, 'heText', False))
        else:
            return bool(getattr(self, 'enText', False)) or bool(getattr(self, 'heText', False))

    # on initial value of ref, and change of ref, derive metadata.
    # todo: do we have to support override of this info?

    def _derive_metadata(self):
        # Get index from ref
        if getattr(self, "ref", None):
            oref = text.Ref(self.ref)
            i = oref.index
            assert isinstance(i, text.AbstractIndex)
            self.indexTitle = i.title
            self.heRef = oref.he_normal()

            # Text
            if not getattr(self, "enText", None):
                self.enText = oref.text("en").text
            if not getattr(self, "heText", None):
                self.heText = oref.text("he").text

            # Authors
            if getattr(i, "authors", None):
                self.authors = i.authors
        else:
            i = {}

        # Author
        if getattr(self, "authors", None) and len(self.authors) > 0:
            author = topic.Topic.init(self.authors[0]) or {}
            if author:
                self.authorsEn = author.get_primary_title("en")
                self.authorsHe = author.get_primary_title("he")
        else:
            author = {}

        # Place
        # The "" result is import to have here, for CrossFilter correctness on the frontend
        self.placeKey = getattr(self, "placeKey", "") or getattr(i, "compPlace", "") or getattr(author, "deathPlace", "") or getattr(author, "birthPlace", "")
        if self.placeKey:
            pobj = place.Place().load({"key": self.placeKey})
            if not pobj:
                raise InputError("Failed to find place with key {} while resolving metadata for {}".format(self.placeKey, self.ref))
            self.placeNameEn = pobj.primary_name("en")
            self.placeNameHe = pobj.primary_name("he")
            #self.placeGeo = pobj.get_location()

        # Time
        # This is similar to logic on Index.composition_time_period() refactor
        if getattr(self, "start", None) is None or getattr(self, "end", None) is None:
            years = getattr(i, 'compDate', [])
            if years and len(years) > 0:
                self.startIsApprox = self.endIsApprox = getattr(i, "hasErrorMargin", False)
                if len(years) > 1:
                    self.start = years[0]
                    self.end = years[1]
                else:
                    self.start = self.end = years[0]
            elif author and author.most_accurate_time_period():
                tp = author.most_accurate_time_period()
                self.start = tp.start
                self.end = tp.end
                self.startIsApprox = tp.startIsApprox
                self.endIsApprox = tp.endIsApprox

        tp = self.time_period()
        if tp:
            self.timePeriodEn = tp.period_string("en")
            self.timePeriodHe = tp.period_string("he")
        else:
            self.start = None
            self.end = None

    def _normalize(self):
        if self.is_key_changed("ref"):
            self._derive_metadata()
        if getattr(self, "start", None):
            self.start = int(self.start)
        if getattr(self, "end", None):
            self.end = int(self.end)

    def time_period(self):
        if not getattr(self, "start", False):
            return None
        return timeperiod.TimePeriod({
            "start": self.start,
            "startIsApprox": getattr(self, "startIsApprox", False),
            "end": self.end,
            "endIsApprox": getattr(self, "endIsApprox", False)
        })

    def place(self):
        return place.Place().load({"key": self.placeKey})

    def set_tags(self, tags, type="default"):
        if isinstance(tags, str):
            tags = [tags]
        if self.tags.get(type):
            for tag in tags:
                if tag not in self.tags["type"]:
                    self.tags["type"].append(tag)
        else:
            self.tags["type"] = tags

    def get_tags(self, type="default"):
        return self.tags.get(type)

    def get_all_tags(self):
        return self.tags

class GardenStopSet(abst.AbstractMongoSet):
    recordClass = GardenStop


class GardenStopRelation(abst.AbstractMongoRecord):
    collection = 'garden_rel'
    required_attrs = [
        'garden'
    ]
    optional_attrs = [

    ]

class GardenStopRelationSet(abst.AbstractMongoSet):
    recordClass = GardenStopRelation



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
            logger.warning(u"Deleting link that failed to save: {} {}".format(l.refs[0], l.refs[1]))
            l.delete()


def process_index_delete_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = ur'^{} on '.format(re.escape(indx.title))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|^({}) on {} \d".format(re.escape(indx.title), "|".join(commentators), re.escape(indx.title))
    LinkSet({"refs": {"$regex": pattern}}).delete()
"""