"""
note.py
Writes to MongoDB Collection: notes
"""

import regex as re
import bleach

from . import abstract as abst
from sefaria.model.text import Ref, IndexSet


class Note(abst.AbstractMongoRecord):
    """
    A note on a specific place in a text.  May be public or private.
    """
    collection    = 'notes'
    history_noun  = 'note'
    allowed_tags  = ("i", "b", "br", "u", "strong", "em", "big", "small", "span", "div", "img", "a")
    allowed_attrs = {
                        '*': ['class'],
                        'a': ['href', 'rel'],
                        'img': ['src', 'alt'],
                    }

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

    def _normalize(self):
        self.ref = Ref(self.ref).normal()
        self.text = bleach.clean(self.text, tags=self.allowed_tags, attributes=self.allowed_attrs)


class NoteSet(abst.AbstractMongoSet):
    recordClass = Note


def process_index_title_change_in_notes(indx, **kwargs):
    print "Cascading Notes {} to {}".format(kwargs['old'], kwargs['new'])
    pattern = Ref(indx.title).regex()
    pattern = pattern.replace(re.escape(indx.title), re.escape(kwargs["old"]))
    notes = NoteSet({"ref": {"$regex": pattern}})
    for n in notes:
        try:
            n.ref = n.ref.replace(kwargs["old"], kwargs["new"], 1)
            n.save()
        except Exception:
            logger.warning("Deleting note that failed to save: {}".format(n.ref))
            n.delete()