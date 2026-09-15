"""
queue.py
Writes to MongoDB Collection: index_queue
"""

import structlog
logger = structlog.get_logger(__name__)

from . import abstract as abst


class IndexQueue(abst.AbstractMongoRecord):
    """
    """
    collection = 'index_queue'

    required_attrs = [
        "lang",
        "type",
        "version",
        "ref"
    ]
    optional_attrs = [
        "sheet_id",  # set on type="sheet" records; see sefaria.search.add_sheet_to_index_queue
    ]

    #todo: This is written generically.  Do we want elsewhere?
    def save(self):
        duplicate_query = {}
        for attr in self.required_attrs:
            duplicate_query[attr] = getattr(self, attr, None)
        if self.__class__().load(duplicate_query):
            logger.warning("Aborting save of {}.  Duplicate found: {}".format(self.__class__.__name__, vars(self)))
        else:
            super(self.__class__, self).save()


class IndexQueueSet(abst.AbstractMongoSet):
    recordClass = IndexQueue