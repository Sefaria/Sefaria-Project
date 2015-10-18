
from sefaria.system.exceptions import InputError
from . import abstract as abst
from . import text
from . import place
from . import time

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

    def _init_defaults(self):
        self.stops = []
        self.rels = []

    def _set_derived_attributes(self):
        self._reset_derived_attributes()

    def _reset_derived_attributes(self):
        if getattr(self, 'key', False):
            self.stops = GardenStopSet({"garden": self.key}).array()
            self.rels = GardenStopRelationshipSet({"garden": self.key}).array()

    def add_stop(self, attrs):
        gs = GardenStop(attrs)
        gs.garden = self.key
        try:
            gs.save()
            self._reset_derived_attributes()
        except Exception as e:
            logger.warning("Failed to add stop to Garden {}. {}".format(self.title, e))

    def add_relationship(self, attrs):
        gs = GardenStopRelationship(attrs)
        gs.garden = self.key
        try:
            gs.save()
            self._reset_derived_attributes()
        except Exception as e:
            logger.warning("Failed to add relationship to Garden {}. {}".format(self.title, e))

    def import_sheet(self, sheet_id):
        from sefaria.sheets import Sheet, refine_ref_by_text

        sheet = Sheet().load({"id":sheet_id})
        if not sheet:
            logger.warning("Failed to load sheet {}".format(sheet_id))

        def process_sources(sources):
            for source in sources:
                if "ref" in source:
                    text = source.get("text", {}).get("he", None)
                    ref = refine_ref_by_text(source["ref"], text) if text else source["ref"]

                    self.add_stop({
                        "type": "inside_source",
                        "ref": ref,
                        "enText": source['text'].get("en"),
                        "heText": source['text'].get("he"),
                    })
                elif "outsideBiText" in source:
                    self.add_stop({
                        "type": "outside_source",
                        "enText": source['outsideBiText'].get("en"),
                        "heText": source['outsideBiText'].get("he"),
                    })
                elif "outsideText" in source:
                    self.add_stop({
                        "type": "outside_source",
                        "enText": source['outsideText']
                    })
                elif "comment" in sources:
                    self.add_stop({
                        "type": "outside_source",
                        "enText": source['comment']
                    })

                if "subsources" in source:
                    process_sources(source["subsources"])

        process_sources(sheet.sources)
        return self


class GardenSet(abst.AbstractMongoSet):
    recordClass = Garden


#todo: Subclass these?
class GardenStop(abst.AbstractMongoRecord):
    collection = 'garden_stop'
    required_attrs = [
        'garden',
        'type'  # inside_source, outside_source, blob
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
        'placeKey'
        'placeNameEn',
        'placeNameHe',
        'placeGeo'
    ]

    def hasCustomText(self, lang):
        assert lang, u"hasCustomText() requires a language code"
        if lang == "en":
            attr = 'enText'
        elif lang == "he":
            attr = 'heText'
        else:
            raise InputError(u"Unknown language: {}".format(lang))

        return bool(getattr(self, attr, False))

    def _derive_metadata(self):
        if not getattr(self, "ref", None):
            return
        i = self.ref.index
        assert isinstance(i, text.AbstractIndex)
        author = i.author_objects()[0] if len(i.author_objects()) > 0 else {}  # Assume first is best

        placeKey = getattr(i, "compPlace", None) or getattr(author, "deathPlace", None) or getattr(author, "birthPlace", None)
        if placeKey:
            pobj = place.Place().load({"key": placeKey})
            self.placeKey = placeKey
            self.placeNameEn = pobj.primary_name("en")
            self.placeNameHe = pobj.primary_name("he")
            self.placeGeo = pobj.get_location()

        if getattr(i, "compDate", None):
            year = int(getattr(i, "compDate"))
            errorMargin = int(getattr(i, "errorMargin", 0))
            self.start = year - errorMargin
            self.end = year + errorMargin
            self.startIsApprox = self.endIsApprox = errorMargin > 0
        elif author and author.mostAccurateTimePeriod():
            tp = author.mostAccurateTimePeriod()
            self.start = tp.start
            self.end = tp.end
            self.startIsApprox = tp.startIsApprox
            self.endIsApprox = tp.endIsApprox

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