"""
garden.py
Writes to MongoDB Collection: links
"""

import regex as re
from bson.objectid import ObjectId

from sefaria.system.database import db
from . import abstract as abst
from . import text

import logging
logger = logging.getLogger(__name__)


class Garden(abst.AbstractMongoRecord):
    """
    https://saravanamudaliar.files.wordpress.com/2014/03/102_5996.jpg
    """
    collection = 'garden'

    required_attrs = [

    ]
    optional_attrs = [

    ]



class GardenSet(abst.AbstractMongoSet):
    recordClass = Garden



class GardenStop(abst.AbstractMongoRecord):
    collection = 'garden_stop'
    required_attrs = [

    ]
    optional_attrs = [

    ]

class GardenStopSet(abst.AbstractMongoSet):
    recordClass = GardenStop


class GardenSourceStop(GardenStop):
    pass


class GardenBlobStop(GardenStop):
    pass


class GardenStopRelationship(abst.AbstractMongoRecord):
    collection = 'garden_rel'
    required_attrs = [

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