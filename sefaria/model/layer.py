"""
layer.py
Writes to MongoDB Collection: layers
"""
import os

from . import abstract as abst

from sefaria.system.database import db
from sefaria.model.note import NoteSet
from sefaria.utils.users import user_link


class Layer(abst.AbstractMongoRecord):
    """
    A collection of notes and sources.
    """
    collection   = 'layers'
    history_noun = 'layer'

    required_attrs = [
        "owner",
        "urlkey",
        "note_ids",
        "sources_list",
    ]
    optional_attrs = [
        "name"
    ]

    def _init_defaults(self):
        self.note_ids     = []
        self.sources_list = []

    def all(self, ref=None):
        """
        Returns all contents for this layer,
        optionally filtered for content pertaining to ref.
        """
        return self.notes(ref=ref) + self.sources(ref=ref)

    def sources(self, ref=None):
        """
        Returns sources for this layer,
        optionally filtered by sources pertaining to ref.
        """
        return []

    def notes(self, ref=None):
        """
        Returns notes for this layer,
        optionally filtered by notes on ref.
        """
        query   = {"_id": {"$in": self.note_ids}}
        notes   = NoteSet(query=query)
        results = [note.contents() for note in notes]
        
        return results


def test_layer():
    l = Layer()
    l.owner = 1
    l.note_ids = db.notes.find({"owner": 1}).distinct("_id")
    l.urlkey = "test"
    l.save()
    # "/Genesis.1?layer=test"