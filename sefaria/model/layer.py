"""
layer.py
Writes to MongoDB Collection: layers
"""
import os

from bson.objectid import ObjectId

from . import abstract as abst
from sefaria.system.database import db
from sefaria.model.text import Ref
from sefaria.model.note import Note, NoteSet
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
        "name",
        "first_ref",
    ]

    def _init_defaults(self):
        self.note_ids     = []
        self.sources_list = []


    def save(self):
        if not getattr(self, "first_ref", None):
            self.set_first_ref()
        super(Layer, self).save()

    def all(self, tref=None):
        """
        Returns all contents for this layer,
        optionally filtered for content pertaining to ref.
        """
        return self.notes(tref=tref) + self.sources(tref=tref)

    def sources(self, tref=None):
        """
        Returns sources for this layer,
        optionally filtered by sources pertaining to ref.
        """
        return []

    def notes(self, tref=None):
        """
        Returns notes for this layer,
        optionally filtered by notes on ref.
        """
        query   = {"_id": {"$in": self.note_ids}}
        if tref:
            query["ref"] = {"$regex": Ref(tref).regex()}
        notes  = NoteSet(query=query)
        return [note for note in notes]

    def add_note(self, note_id):
        """
        Add 'note_id' to this Layer.
        """
        if isinstance(note_id, basestring):
            note_id = ObjectId(note_id)
        if note_id not in self.note_ids:
            self.note_ids.append(note_id)

    def set_first_ref(self):
        """
        Returns the ref of the first note in this layer
        """
        if len(self.note_ids):
            note = Note().load_by_id(self.note_ids[0])
            self.first_ref = note.ref if note else None




class LayerSet(abst.AbstractMongoSet):
    recordClass = Layer