"""
note.py
Writes to MongoDB Collection: notes
"""

import regex as re

from . import abstract as abst
from sefaria.model.text import Ref
from sefaria.system.exceptions import InputError

import structlog
from sefaria.system.progress_context import report_progress
logger = structlog.get_logger(__name__)


class Note(abst.AbstractMongoRecord):
    """
    A note on a specific place in a text.  May be public or private.
    """
    collection    = 'notes'
    history_noun  = 'note'
    ALLOWED_TAGS  = ("i", "b", "br", "u", "strong", "em", "big", "small", "span", "div", "img", "a")
    ALLOWED_ATTRS = {
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


class NoteSet(abst.AbstractMongoSet):
    recordClass = Note


def process_index_title_change_in_notes(indx, **kwargs):
    report_progress("Cascading Notes {} to {}".format(kwargs['old'], kwargs['new']))
    pattern = Ref(indx.title).regex()
    pattern = pattern.replace(re.escape(indx.title), re.escape(kwargs["old"]))
    notes = NoteSet({"ref": {"$regex": pattern}})
    for n in notes:
        try:
            n.ref = n.ref.replace(kwargs["old"], kwargs["new"], 1)
            n.save()
        except InputError:
            # The renamed ref no longer validates. Keep the note: its text is the user's work, and it is left pointing at the old title.
            logger.warning("Leaving note with stale ref after failed save: {}".format(n.ref))
        except Exception:
            # Unexpected (e.g. connection) failure: never delete on error, and keep cascading to the remaining notes.
            logger.exception("Leaving note with stale ref after unexpected save failure: {}".format(n.ref))

def process_index_delete_in_notes(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    NoteSet({"ref": {"$regex": pattern}}).delete()
