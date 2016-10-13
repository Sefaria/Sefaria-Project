# -*- coding: utf-8 -*-

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

text_titles = model.VersionSet({}).distinct('title')
model.library.rebuild_toc()
scache.delete_cache_elem('toc_cache')


""" THE TESTS """


class Test_Toc(object):
    def test_toc_integrity(self):
        model.library.rebuild_toc()
        toc = model.library.get_toc()
        self.recur_toc_integrity(toc)

    def recur_toc_integrity(self, toc, depth=0):
        for toc_elem in toc:
            if 'category' in toc_elem:
                #verify proper category node (including that it doesnt have a title attr)
                self.verify_category_node_integrity(toc_elem, depth)
                self.recur_toc_integrity(toc_elem['contents'], depth+1)
            elif 'title' in toc_elem:
                #verify text leaf integrity
                self.verify_text_node_integrity(toc_elem)

    def verify_category_node_integrity(self, node, depth):
        assert set(node.keys()) == {'category', 'heCategory', 'contents'}
        assert isinstance(node['category'], basestring)
        assert isinstance(node['heCategory'], basestring)
        assert isinstance(node['contents'], list)

    def verify_text_node_integrity(self, node):
        global text_titles
        lang_keys = get_lang_keys()
        assert set(node.keys()) >= {'title', 'heTitle', 'sparseness', 'categories'}
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
        verify_title_existence_in_toc(new_index.title, None)
        new_index.save()
        verify_title_existence_in_toc(new_index.title, new_index.categories)
        # title change
        old_title = new_index.title
        new_title = "Bob is your Uncle"
        new_index.title = new_title
        new_index.save()
        verify_title_existence_in_toc(old_title, None)
        verify_title_existence_in_toc(new_title, new_index.categories)
        new_index.delete()
        verify_title_existence_in_toc(new_title, None)
        verify_title_existence_in_toc(old_title, None)


    def test_index_add_delete(self):
        #test that the index
        new_index = model.Index({
            "title": "New Toc Test",
            "heTitle": u"פםפם",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Philosophy"]
        })
        verify_title_existence_in_toc(new_index.title, None)
        new_index.save()
        verify_title_existence_in_toc(new_index.title, new_index.categories)
        new_index.delete()
        verify_title_existence_in_toc(new_index.title, None)

        #commentator alone should not be in the toc
        new_commentator = model.Index({
            "title": "New Toc Commentator Test",
            "heTitle": u"םפםפכ",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Commentary"]
        })
        new_commentator.save()
        verify_title_existence_in_toc(new_commentator.title, None)
        new_commentator.delete()
        verify_title_existence_in_toc(new_commentator.title, None)

        new_other_index = model.Index({
            "title": "New Toc Test",
            "heTitle": u"פםפם",
            "titleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Testing"]
        })
        verify_title_existence_in_toc(new_other_index.title, None)
        new_other_index.save()
        verify_title_existence_in_toc(new_other_index.title, ['Other'] + new_other_index.categories)
        new_other_index.delete()
        verify_title_existence_in_toc(new_other_index.title, None)

    def test_index_attr_change(self):
        indx = model.Index().load({"title": "Or HaChaim"})
        verify_title_existence_in_toc(indx.title, None)
        verify_title_existence_in_toc(indx.title+' on Genesis', ['Tanakh', 'Commentary', 'Or HaChaim'])
        indx.titleVariants.append("Or HaChaim HaKadosh")
        #indx.nodes.add_title("Or HaChaim HaKadosh", "en")
        indx.save()
        verify_title_existence_in_toc(indx.title, None)
        verify_title_existence_in_toc(indx.title+' on Genesis', ['Tanakh', 'Commentary', 'Or HaChaim'])

        indx2 = model.Index().load({"title": "Sefer Kuzari"}) #Was Tanya, but Tanya has a hebrew title clash problem, momentarily.
        verify_title_existence_in_toc(indx2.title, indx2.categories)
        #indx2.titleVariants.append("Tanya Test")
        indx2.nodes.add_title("Kuzari Test", "en")
        indx2.save()
        verify_title_existence_in_toc(indx2.title, indx2.categories)

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
        old_toc_path = get_all_toc_locations(old_title)[0]
        assert toc_path_to_string(old_toc_path) == toc_path_to_string(toc_location)
        i = model.Index().load({"title": old_title})
        i.title = new_title
        i.save()
        #old title not there anymore
        verify_title_existence_in_toc(old_title, None)
        #new one in it's place
        verify_title_existence_in_toc(new_title, old_toc_path)
        #do testing: make sure new title is in the old place in the toc and that the old title is removed
        i.title = old_title
        i.save()
        #old title not there anymore
        verify_title_existence_in_toc(new_title, None)
        #new one in it's place
        verify_title_existence_in_toc(old_title, old_toc_path)

    @pytest.mark.deep
    def test_commentary_index_title_change(self):
        old_title = 'Sforno'
        new_title = 'Sforno New'
        i = model.Index().load({"title": old_title})
        verify_title_existence_in_toc(old_title, None)
        verify_title_existence_in_toc(old_title+' on Genesis', ['Tanakh', 'Commentary', 'Sforno'])
        i.title = new_title
        i.save()
        #old title not there
        verify_title_existence_in_toc(old_title, None)
        #new one not either since it's just a commentator name
        verify_title_existence_in_toc(new_title, None)
        verify_title_existence_in_toc(new_title+' on Genesis', ['Tanakh', 'Commentary', 'Sforno New'])
        #do testing: make sure new title is in the old place in the toc and that the old title is removed
        i.title = old_title
        i.save()
        #old title not there anymore
        verify_title_existence_in_toc(new_title, None)
        #new one in it's place
        verify_title_existence_in_toc(old_title, None)
        verify_title_existence_in_toc(old_title+' on Genesis', ['Tanakh', 'Commentary', 'Sforno'])
