"""
note.py
Writes to MongoDB Collection: notes
"""

import regex as re

from . import abstract as abst
from sefaria.model.text import Ref
from sefaria.utils.users import user_link


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

    def client_format(self):
        """
        Returns a dictionary that represents note in the format expected by the reader client,
        matching the format of links, which are currently handled together.
        """
        out = {}
        anchorRef = Ref(self.ref)

        out["category"]    = "Notes"
        out["type"]        = "note"
        out["owner"]       = self.owner
        out["_id"]         = str(self._id)
        out["anchorRef"]   = self.ref
        out["anchorVerse"] = anchorRef.sections[-1]
        out["anchorText"]  = getattr(self, "anchorText", "")
        out["public"]      = getattr(self, "public", False)
        out["text"]        = self.title + " - " + self.text if self.title else self.text
        out["commentator"] = user_link(self.owner)

        return out

class NoteSet(abst.AbstractMongoSet):
    recordClass = Note


def process_index_title_change_in_notes(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'{} on '.format(re.escape(kwargs["old"]))
    else:
        pattern = r'(^{} \d)|(on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    notes = NoteSet({"ref": {"$regex": pattern}})
    for n in notes:
        try:
            n.ref = n.ref.replace(kwargs["old"], kwargs["new"], 1)
            n.save()
        except Exception:
            pass #todo: log me, and wrap other handlers in try/catch