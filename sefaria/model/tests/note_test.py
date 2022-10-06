# -*- coding: utf-8 -*-

from sefaria import model


class Test_Note(object):

    def test_save(self):
        n = model.Note({
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
