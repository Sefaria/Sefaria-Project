# -*- coding: utf-8 -*-
import pytest

from sefaria.model import *

def setup_module(module): 
    pass


class Test_complete_request:

    def test_preexisting_completes_request(self):
        assert len(Ref("Job 4:4").text().text) > 0
        tr = TranslationRequest.make_request("Job 4:4", 1)
        assert tr.check_complete() == True
        tr = TranslationRequest().load({"ref": "Job 4:4"})
        assert tr.completed == True

    def test_new_completes_request(self):
        # Make sure we don't have Genesis 1:99
        oref = Ref("Genesis 1:99")
        TranslationRequestSet({"ref": "Genesis 1:99"}).delete()
        chunk = oref.text(lang="en", vtitle="Test English")
        chunk.text = ""
        chunk.save()
        VersionState(oref.book).refresh()
        assert len(oref.text().text) == 0
        assert oref.is_text_translated() == False
        
        # Make a request 
        tr = TranslationRequest.make_request(oref.normal(), 1)
        assert tr.completed == False
        tr = TranslationRequest().load({"ref": oref.normal()})
        assert tr.completed == False

        # Add English for this Text
        chunk = oref.text(lang="en", vtitle="Test English")
        chunk.text = "Red Balloons"
        chunk.save()
        VersionState(oref.book).refresh()
        chunk = oref.text(lang="en", vtitle="Test English")
        assert chunk.text == "Red Balloons"
        assert oref.is_text_translated() == True
        tr = TranslationRequest().load({"ref": oref.normal()})
        # tr.check_complete()
        assert tr.completed == True

        # Reset Genesis 1:99
        TranslationRequestSet({"ref": "Genesis 1:99"}).delete()
        chunk = oref.text(lang="en", vtitle="Test English")
        chunk.text = ""
        chunk.save()
        assert len(oref.text().text) == 0