"""
note.py
Writes to MongoDB Collection: notes
"""

import regex as re

import sefaria.model.abstract as abst


class Note(abst.AbstractMongoRecord):
    """
    A note on a specific place in a text.  May be public or private.
    """
    collection = 'notes'
    history_noun = 'note'

    required_attrs = [
        "owner",
        "public",
        "text",
        "type",
        "ref"
    ]
    optional_attrs = [
        "title",
        "anchorText"
    ]


class NoteSet(abst.AbstractMongoSet):
    recordClass = Note


def process_index_title_change_in_notes(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'{} on '.format(re.escape(kwargs["old"]))
    else:
        pattern = r'(^{} \d)|(on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    notes = NoteSet({"ref": {"$regex": pattern}})
    for n in notes:
        n.ref = n.ref.replace(kwargs["old"], kwargs["new"], 1)
        n.save()
