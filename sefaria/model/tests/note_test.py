# -*- coding: utf-8 -*-
import pytest
from types import SimpleNamespace
from pymongo.errors import AutoReconnect
import sefaria.model as m
from sefaria.model import note as note_model
from sefaria.system.database import db
from sefaria.system.exceptions import InputError


class Test_Note(object):

    def test_save(self):
        n = m.Note({
            "text": "what a beautiful moment <333",
            "public": False,
            "owner": 1,
            "ref": "Genesis 48:11",
            "type": "note"
        })
        n.text = 'Seemingly ok note... <a href="javascript:alert(8007)">Click me</a>'
        n.save()
        assert n.text == 'Seemingly ok note... <a>Click me</a>'
        n.delete()


class Test_NoteCascadeOnTitleChange(object):

    @pytest.mark.parametrize("save_error", [
        AutoReconnect("connection dropped during cascade"),
        InputError("renamed ref no longer validates"),
    ])
    def test_failed_save_keeps_note(self, monkeypatch, save_error):
        text = "a note that must survive a failed title cascade"
        n = m.Note({
            "text": text,
            "public": False,
            "owner": 1,
            "ref": "Genesis 48:11",
            "type": "note"
        })
        n.save()
        try:
            def failing_save(self, *args, **kwargs):
                raise save_error

            monkeypatch.setattr(note_model.Note, "save", failing_save)
            monkeypatch.setattr(note_model, "NoteSet", lambda query: [n])
            monkeypatch.setattr(note_model, "report_progress", lambda *a, **k: None)

            note_model.process_index_title_change_in_notes(
                SimpleNamespace(title="Genesis"), old="Bereshit", new="Genesis")

            stored = db.notes.find_one({"text": text})
            assert stored is not None
            assert stored["ref"] == "Genesis 48:11"
        finally:
            db.notes.delete_many({"text": text})
