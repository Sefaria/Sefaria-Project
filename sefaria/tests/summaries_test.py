# -*- coding: utf-8 -*-

import json
import pytest
import sefaria.summaries as s
import sefaria.model as model
import sefaria.system.cache as scache
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

    def test_toc_integrity(self):
        self.recur_toc_integrity(model.library.get_toc())
        self.recur_toc_integrity(model.library.get_search_filter_toc())

    def recur_toc_integrity(self, toc, depth=0):
        for toc_elem in toc:
            if 'category' in toc_elem:
                #verify proper category node (including that it doesnt have a title attr)
                self.verify_category_node_integrity(toc_elem)
                self.recur_toc_integrity(toc_elem['contents'], depth+1)
            elif 'title' in toc_elem:
                #verify text leaf integrity
                self.verify_text_node_integrity(toc_elem)

    def verify_category_node_integrity(self, node):
        # search toc doesn't have 'enComplete' or 'heComplete'
        try:
            assert set(node.keys()) <= {'category', 'heCategory', 'contents', 'enComplete', 'heComplete'}
            assert {'category', 'heCategory', 'contents'} <= set(node.keys())
            assert isinstance(node['category'], basestring)
            assert isinstance(node['heCategory'], basestring)
            assert isinstance(node['contents'], list)
        except AssertionError as e:
            print u"Bad category:"
            print node
            raise

    def verify_text_node_integrity(self, node):
        global text_titles
        expected_keys = set(('title', 'heTitle'))
        assert set(node.keys()) >= expected_keys
        assert (node['title'] in text_titles), node['title']
        assert 'category' not in node
        #do we need to assert that the title is not equal to any category name?

    @pytest.mark.deep
    def test_new_index_title_change(self):
        new_index = model.Index({
            "title": "New Toc Title Test",
            "heTitle": u"פםעעפם",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Philosophy"]
        })
        verify_existence_across_tocs(new_index.title, None)
        new_index.save()
        verify_existence_across_tocs(new_index.title, expected_toc_location=new_index.categories)
        # title change
        old_title = new_index.title
        new_title = "Bob is your Uncle"
        new_index.title = new_title
        new_index.save()
        verify_existence_across_tocs(old_title, None)
        verify_existence_across_tocs(new_title, expected_toc_location=new_index.categories)
        new_index.delete()
        verify_existence_across_tocs(new_title, None)
        verify_existence_across_tocs(old_title, None)


    def test_index_add_delete(self):
        #test that the index
        new_index = model.Index({
            "title": "New Toc Test",
            "heTitle": u"פםפם",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Philosophy"]
        })
        verify_existence_across_tocs(new_index.title, None)
        new_index.save()
        verify_existence_across_tocs(new_index.title, expected_toc_location=new_index.categories)
        new_index.delete()
        verify_existence_across_tocs(new_index.title, None)

        """
        # Adding Indexes to non-existent categories doesn't work anymore.
        new_other_index = model.Index({
            "title": "Another New Toc Test",
            "heTitle": u"פםפם",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Law"]
        })
        verify_existence_across_tocs(new_other_index.title, None)
        new_other_index.save()
        verify_existence_across_tocs(new_other_index.title, expected_toc_location=['Other'] + new_other_index.categories)
        new_other_index.delete()
        verify_existence_across_tocs(new_other_index.title, None)
        """

        new_commentary_index = model.Index({
            "title": "Harchev Davar on Joshua",
            "heTitle": u"הרחב דבר על יהושוע",
            "dependence": "Commentary",
            "base_text_titles": ["Joshua"],
            "collective_title": "Harchev Davar",
            "sectionNames": ["Chapter", "Paragraph", "Comment"],
            "categories": ["Tanakh", "Commentary", "Harchev Davar"]
        })
        verify_existence_across_tocs(new_commentary_index.title, None)
        new_commentary_index.save()
        verify_title_existence_in_toc(new_commentary_index.title, expected_toc_location=new_commentary_index.categories, toc=model.library.get_toc())
        verify_title_existence_in_toc(new_commentary_index.title, expected_toc_location=["Tanakh Commentaries", "Harchev Davar"], toc=model.library.get_search_filter_toc())
        new_commentary_index.delete()
        verify_existence_across_tocs(new_commentary_index.title, None)

    def test_index_attr_change(self):
        indx = model.Index().load({"title": "Or HaChaim on Genesis"})
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh', 'Commentary', 'Or HaChaim', 'Torah'], toc=model.library.get_toc())
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh Commentaries', 'Or HaChaim', 'Torah'], toc=model.library.get_search_filter_toc())
        indx.nodes.add_title("Or HaChaim HaKadosh", "en")
        indx.save()
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh', 'Commentary', 'Or HaChaim', 'Torah'])
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh Commentaries', 'Or HaChaim', 'Torah'], toc=model.library.get_search_filter_toc())


        indx2 = model.Index().load({"title": "Sefer Kuzari"}) #Was Tanya, but Tanya has a hebrew title clash problem, momentarily.
        verify_existence_across_tocs(indx2.title, expected_toc_location=indx2.categories)
        indx2.nodes.add_title("Kuzari Test", "en")
        indx2.save()
        verify_existence_across_tocs(indx2.title, expected_toc_location=indx2.categories)

    #todo: undo these changes

    def test_text_change(self):
        pass

    @pytest.mark.deep
    def test_index_title_change(self):
        try:
            i = model.library.get_index("The Likutei Moharan")
            if i:
                i.delete()
        except BookNameError:
            pass

        old_title = 'Likutei Moharan'
        new_title = 'The Likutei Moharan'
        toc_location = ['Chasidut', 'Breslov']
        old_toc_path = get_all_toc_locations(old_title, model.library.get_toc())[0]
        assert toc_path_to_string(old_toc_path) == toc_path_to_string(toc_location)
        i = model.Index().load({"title": old_title})
        i.title = new_title
        i.save()
        #old title not there anymore
        verify_existence_across_tocs(old_title, None)
        #new one in it's place
        verify_existence_across_tocs(new_title, expected_toc_location=old_toc_path)
        #do testing: make sure new title is in the old place in the toc and that the old title is removed
        i.title = old_title
        i.save()
        #old title not there anymore
        verify_existence_across_tocs(new_title, None)
        #new one in it's place
        verify_existence_across_tocs(old_title, expected_toc_location=old_toc_path)

