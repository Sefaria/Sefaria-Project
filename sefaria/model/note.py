"""
note.py
Writes to MongoDB Collection: notes
"""
import sefaria.model.abstract as abst


class Note(abst.AbstractMongoRecord):
    """
    A note on a specific place in a text.  May be public or private.
    """
    collection = 'notes'
    history_noun = 'note'

    required_attrs = [
        "owner",
        "public"
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