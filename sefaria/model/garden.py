
from sefaria.system.exceptions import InputError
from . import abstract as abst
from . import text
from . import place

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
        'yearIsApproximate',
        'place'
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

class GardenStopSet(abst.AbstractMongoSet):
    recordClass = GardenStop


class GardenSourceStop(GardenStop):
    required_attrs = [
        'garden',
        'type'
    ]
    optional_attrs = [
        'ref',
        'title',
        'enVersionTitle',
        'heVersionTitle',
        'enText',
        'heText',
        'tags',
        'year',
        'yearIsApproximate',
        'place'
    ]

    def __init__(self):
        #
        pass

    def _derive_data_from_index(self):
        if not getattr(self, "ref", None):
            return
        i = self.ref.index
        assert isinstance(i, text.AbstractIndex)
        if len(i.author_objects()) > 0:
            pass


class GardenBlobStop(GardenStop):
    pass


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