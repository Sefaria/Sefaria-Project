"""
queue.py
Writes to MongoDB Collection: index_queue
"""

import sefaria.model.abstract as abst


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