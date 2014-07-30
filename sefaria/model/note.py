"""
note.py
Writes to MongoDB Collection: notes
"""
import sefaria.model.abstract as abst


class Note(abst.AbstractMongoRecord):
    """
    A version of a text.
    Relates to a complete single record from the texts collection
    """
    collection = 'notes'
    tracked = True
    history_noun = 'note'

    required_attrs = [

    ]
    optional_attrs = [

    ]
