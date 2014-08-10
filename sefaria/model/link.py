"""
link.py
Writes to MongoDB Collection: links
"""

import regex as re

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
        "anchorText",
        "auto",
        "generated_by",
        "source_text_oid"
    ]


class LinkSet(abst.AbstractMongoSet):
    recordClass = Link


def process_index_title_change_in_links(indx, **kwargs):
    pattern = r'^%s(?= \d)' % re.escape(kwargs["old"])
    links = LinkSet({"refs": {"$regex": pattern}})
    for l in links:
        l.refs = [re.sub(pattern, kwargs["new"], r) for r in l.refs]
        l.save()
