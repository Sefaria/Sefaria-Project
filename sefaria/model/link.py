"""
link.py
Writes to MongoDB Collection: links
"""

import sefaria.model.abstract as abst


class Link(abst.AbstractMongoRecord):
    """
    A version of a text.
    Relates to a complete single record from the texts collection
    """
    collection = 'links'
    tracked = True
    history_noun = 'link'

    required_attrs = [

    ]
    optional_attrs = [

    ]
