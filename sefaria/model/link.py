"""
link.py
Writes to MongoDB Collection: links
"""

import regex as re

from . import abstract as abst


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
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(kwargs["old"]))
    else:
        pattern = r'(^{} \d)|( on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    links = LinkSet({"refs": {"$regex": pattern}})
    for l in links:
        l.refs = [r.replace(kwargs["old"], kwargs["new"], 1) for r in l.refs]
        l.save()


def process_index_delete_in_links(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(indx.title))
    else:
        pattern = r'(^{} \d)|( on {} \d)'.format(indx.title, indx.title)
    LinkSet({"refs": {"$regex": pattern}}).delete()