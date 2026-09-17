# -*- coding: utf-8 -*-

import pytest
from sefaria.system.exceptions import BookNameError
from sefaria.utils.testing_utils import *

#create, update, delete, change categories
# test that old title goes away on index title change (regular + commentary)
# test that no commentator is added
# no wandering commentaries


""" SOME SETUP """

text_titles = model.IndexSet({}).distinct('title')
model.library.rebuild_toc()


""" THE TESTS """

class Test_Toc(object):

    @classmethod
    def setup_class(cls):
        model.library.rebuild_toc()

    @classmethod
    def teardown_class(cls):
        titles = ["New Toc Title Test", "New Toc Test", "Another New Toc Test", "Harchev Davar on Joshua", "Bob is your Uncle"]
        for title in titles:
            model.IndexSet({"title": title}).delete()
            model.VersionSet({"title": title}).delete()

    @pytest.mark.skip(reason="flaky after CI job retry corruption")
    def test_index_add_delete(self):
        #test that the index
        new_index = model.Index({
            "title": "New Toc Test",
            "heTitle": "פםפם",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Jewish Thought"]
        })
        verify_existence_across_tocs(new_index.title, None)
        new_index.save()
        verify_existence_across_tocs(new_index.title, expected_toc_location=new_index.categories)
        new_index.delete()
        verify_existence_across_tocs(new_index.title, None)

        new_commentary_index = model.Index({
            "title": "Harchev Davar on Joshua",
            "heTitle": "הרחב דבר על יהושוע",
            "dependence": "Commentary",
            "base_text_titles": ["Joshua"],
            "collective_title": "Harchev Davar",
            "sectionNames": ["Chapter", "Paragraph", "Comment"],
            "categories": ["Tanakh", "Acharonim on Tanakh", "Harchev Davar"]
        })
        verify_existence_across_tocs(new_commentary_index.title, None)
        new_commentary_index.save()
        verify_title_existence_in_toc(new_commentary_index.title, expected_toc_location=new_commentary_index.categories, toc=model.library.get_toc())
        new_commentary_index.delete()
        verify_existence_across_tocs(new_commentary_index.title, None)

    @pytest.mark.skip(reason="flaky after CI job retry corruption")
    def test_index_attr_change(self):
        indx = model.Index().load({"title": "Or HaChaim on Genesis"})
        verify_title_existence_in_toc(indx.title, expected_toc_location=["Tanakh", "Acharonim on Tanakh", "Or HaChaim", "Torah"], toc=model.library.get_toc())
        indx.nodes.add_title("Or HaChaim HaKadosh", "en")
        indx.save()
        verify_title_existence_in_toc(indx.title, expected_toc_location=["Tanakh", "Acharonim on Tanakh", "Or HaChaim", "Torah"])


        indx2 = model.Index().load({"title": "Kuzari"})
        verify_existence_across_tocs(indx2.title, expected_toc_location=indx2.categories)
        indx2.nodes.add_title("Kuzari Test", "en")
        indx2.save()
        verify_existence_across_tocs(indx2.title, expected_toc_location=indx2.categories)

    def test_text_change(self):
        pass
