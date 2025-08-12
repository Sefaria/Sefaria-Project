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

    def test_toc_integrity(self):
        self.recur_toc_integrity(model.library.get_toc())

    def recur_toc_integrity(self, toc, depth=0):
        for toc_elem in toc:
            if 'category' in toc_elem and 'contents' in toc_elem:
                #verify proper category node (including that it doesnt have a title attr)
                self.verify_category_node_integrity(toc_elem)
                self.recur_toc_integrity(toc_elem['contents'], depth+1)
            elif toc_elem.get('isCollection', False):
                #verify collection leaf integrity
                self.verify_collection_node_integrity(toc_elem)
            elif 'title' in toc_elem:
                #verify text leaf integrity
                self.verify_text_node_integrity(toc_elem)

    def verify_category_node_integrity(self, node):
        # search toc doesn't have 'enComplete' or 'heComplete' empty categories don't have 'contents'
        try:
            assert set(node.keys()) <= {'category', 'heCategory', 'enDesc', 'heDesc', 'enShortDesc', 'heShortDesc', 'contents', 'enComplete', 'heComplete', 'order', "isPrimary","searchRoot"}
            if getattr(node, 'contents', None):
                assert {'category', 'heCategory', 'contents'} <= set(node.keys())
                assert isinstance(node['contents'], list)
            else:
                assert {'category', 'heCategory'} <= set(node.keys())
            assert isinstance(node['category'], str)
            assert isinstance(node['heCategory'], str)

        except AssertionError as e:
            print("Bad category:")
            print(node)
            raise

    def verify_text_node_integrity(self, node):
        global text_titles
        expected_keys = {'title', 'heTitle'}
        assert set(node.keys()) >= expected_keys
        assert (node['title'] in text_titles), node['title']
        assert 'category' not in node
        #do we need to assert that the title is not equal to any category name?

    def verify_collection_node_integrity(self, node):
        expected_keys = set(('name', 'slug', 'title', 'heTitle'))
        assert set(node.keys()) >= expected_keys
        assert 'category' not in node  

    @pytest.mark.deep
    def test_new_index_title_change(self):
        new_index = model.Index({
            "title": "New Toc Title Test",
            "heTitle": "פםעעפם",
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

