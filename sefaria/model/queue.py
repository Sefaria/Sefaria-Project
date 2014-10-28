"""
queue.py
Writes to MongoDB Collection: index_queue
"""

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

    ]


class IndexQueueSet(abst.AbstractMongoSet):
    recordClass = IndexQueue