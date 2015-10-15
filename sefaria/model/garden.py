
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
        if getattr(self, 'key', False):
            self.stops = GardenStopSet({"garden": self.key}).array()
            self.rels = GardenStopRelationshipSet({"garden": self.key}).array()



class GardenSet(abst.AbstractMongoSet):
    recordClass = Garden



class GardenStop(abst.AbstractMongoRecord):
    collection = 'garden_stop'
    required_attrs = [
        'garden'
        'type'  #
    ]
    optional_attrs = [
        'ref'
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
        'garden'
        'type'
    ]
    optional_attrs = [
        'ref'
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