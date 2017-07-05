# -*- coding: utf-8 -*-

import json
import pytest
from deepdiff import DeepDiff
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
        model.IndexSet({"title": {"$in": ["New Toc Title Test", "New Toc Test", "Another New Toc Test", "Harchev Davar on Joshua"]}}).delete()
        model.library.rebuild_toc()
        cls.toc = model.library.get_toc()
        cls.search_toc = model.library.get_search_filter_toc()

    @classmethod
    def teardown_class(cls):
        model.IndexSet({"title": {"$in": ["New Toc Title Test", "New Toc Test", "Another New Toc Test", "Harchev Davar on Joshua"]}}).delete()

    def test_toc_integrity(self):
        self.recur_toc_integrity(self.toc)
        self.recur_toc_integrity(self.search_toc)

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
        assert set(node.keys()) == {'category', 'heCategory', 'contents'}
        assert isinstance(node['category'], basestring)
        assert isinstance(node['heCategory'], basestring)
        assert isinstance(node['contents'], list)

    def verify_text_node_integrity(self, node):
        global text_titles
        expected_keys = set(('title', 'heTitle', 'sparseness'))
        assert set(node.keys()) >= expected_keys
        assert (node['title'] in text_titles), node['title']
        assert 'category' not in node
        assert isinstance(node['sparseness'], int)
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

        new_commentary_index = model.Index({
            "title": "Harchev Davar on Joshua",
            "heTitle": u"הרחב דבר על יהושוע",
            "dependence": "Commentary",
            "base_text_titles": ["Joshua"],
            "collective_title": "Harchev Davar",
            "sectionNames": ["Chapter", "Paragraph", "Comment"],
            "categories": ["Tanakh", "Commentary", "Harchev Davar", "Prophets"]
        })
        verify_existence_across_tocs(new_commentary_index.title, None)
        new_commentary_index.save()
        verify_title_existence_in_toc(new_commentary_index.title, expected_toc_location=new_commentary_index.categories, toc=self.toc)
        verify_title_existence_in_toc(new_commentary_index.title, expected_toc_location=["Tanakh Commentaries", "Harchev Davar", "Prophets"], toc=self.search_toc)
        new_commentary_index.delete()
        verify_existence_across_tocs(new_commentary_index.title, None)

    def test_index_attr_change(self):
        indx = model.Index().load({"title": "Or HaChaim on Genesis"})
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh', 'Commentary', 'Or HaChaim', 'Torah'], toc=self.toc)
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh Commentaries', 'Or HaChaim', 'Torah'], toc=self.search_toc)
        indx.nodes.add_title("Or HaChaim HaKadosh", "en")
        indx.save()
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh', 'Commentary', 'Or HaChaim', 'Torah'])
        verify_title_existence_in_toc(indx.title, expected_toc_location=['Tanakh Commentaries', 'Or HaChaim', 'Torah'], toc=self.search_toc)


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
        toc_location = ['Chasidut']
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


class Test_OO_Toc(object):
    def test_round_trip(self):
        base_toc = model.library.get_toc()
        base_json = json.dumps(base_toc, sort_keys=True)
        oo_toc = s.toc_serial_to_objects(base_toc)
        rt_toc = oo_toc.serialize()["contents"]

        # Deep test of toc lists
        assert not DeepDiff(base_toc, rt_toc)

        # Check that the json is identical -
        # that the round-trip didn't change anything by reference that would poison the deep test
        new_json = json.dumps(rt_toc, sort_keys=True)
        assert len(base_json) == len(new_json)

    @pytest.mark.failing
    def test_compare_db_toc_and_derived_toc(self):
        base_toc = model.library.get_toc()
        base_json = json.dumps(base_toc, sort_keys=True)
        oo_toc = s.TocTree()
        serialized_toc = oo_toc.get_root().serialize()["contents"]

        # Deep test of toc lists
        assert not DeepDiff(base_toc, serialized_toc)

        # Check that the json is identical -
        # that the round-trip didn't change anything by reference that would poison the deep test
        new_json = json.dumps(serialized_toc, sort_keys=True)
        assert len(base_json) == len(new_json)