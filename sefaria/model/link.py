"""
link.py
Writes to MongoDB Collection: links
"""

import sefaria.model.abstract as abst


class Link(abst.AbstractMongoRecord):
    """
    A link between two texts (or more specifically, two references)
    """
    collection = 'links'
    history_noun = 'link'

    required_attrs = [
        "type",
        "refs"
    ]
    optional_attrs = [
        "anchorText"
    ]


class LinkSet(abst.AbstractMongoSet):
    recordClass = Link