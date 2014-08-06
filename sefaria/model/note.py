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
    pattern = r'^%s(?= \d)' % kwargs["old"]
    notes = NoteSet({"ref": {"$regex": pattern}})
    for n in notes:
        n.ref = re.sub(pattern, kwargs["new"], n.ref)
        n.save()
