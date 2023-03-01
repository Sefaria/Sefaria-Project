# -*- coding: utf-8 -*-
import pytest
import json
from deepdiff import DeepDiff
import copy
from sefaria.system.exceptions import InputError
from sefaria.model import *
from sefaria import tracker
import sefaria.model.category as c
from sefaria.helper.category import update_order_of_category_children
import datetime
class Test_Category_Editor(object):
    @pytest.fixture(autouse=True, scope='module')
    def create_new_terms(self):
        terms = []
        for title in ["New Fake Category 1", "New Fake Category 2"]:
            t = Term()
            t.add_primary_titles(title, title[::-1])
            t.name = title
            t.save()
            terms.append(t)
        yield terms
        for t in terms:
            t.delete()

    @pytest.fixture(autouse=True, scope='module')
    def create_new_cats(self, create_new_terms):
        titles = {"New Fake Category 1": ["New Fake Category 1"],
                  "New Fake Category 2": ["New Fake Category 1", "New Fake Category 2"]}
        cats = []
        for title, path in titles.items():
            c = Category()
            c.path = path
            c.add_shared_term(title)
            c.save()
            cats.append(c)
        yield cats
        for c in cats[::-1]:
            c.delete()
        library.rebuild_toc()

    @pytest.fixture(autouse=True, scope='module')
    def create_fake_indices(self, create_new_cats):
        books = []
        paths_for_books = [create_new_cats[0].path, create_new_cats[1].path, create_new_cats[0].path]
        for i, title in enumerate(['Fake Book One', 'Fake Book Two', 'Fake Book Three']):
            data = {
                "categories": paths_for_books[i],
                "title": title,
                "order": [i*5],
                "schema": {
                    "titles": [
                        {
                            "lang": "en",
                            "text": title,
                            "primary": True
                        },
                        {
                            "lang": "he",
                            "text": title[::-1],
                            "primary": True
                        }
                    ],
                    "nodeType": "JaggedArrayNode",
                    "depth": 2,
                    "sectionNames": [
                        "Section",
                        "Line"
                    ],
                    "addressTypes": [
                        "Integer",
                        "Integer"
                    ],
                    "key": title
                },
            }
            book = Index(data)
            book.save()
            books.append(book)

        yield books
        for b in books:
            b.delete()

    @pytest.fixture(scope='module', autouse=True)
    def new_main_cat_shared_title(self):
        t = Term()
        t.name = "New Shared Title for Main Cat"
        t.add_primary_titles(t.name, t.name[::-1])
        t.save()
        yield t
        t.delete()

    @pytest.fixture(scope='module', autouse=True)
    def new_collection(self, create_new_cats):
        c = Collection({"name": "Fake Collection",
                    "sheets": 1,
                    "slug": "https://www.sefaria.org/Collections/fake-collection",
                    "lastModified": datetime.datetime(2021, 2, 5, 14, 57, 32, 336000),
                    "admins": [1],
                    "members": [1]})
        c.toc = {"categories": create_new_cats[0].path}
        yield c
        c.delete()

    @staticmethod
    def change_cat(term, orig_categories, new_categories):
        # simulate category editor: change title, path and desc all at once
        main_cat_new_dict = {"path": new_categories, "sharedTitle": term.get_primary_title('en'),
                             "heSharedTitle": term.get_primary_title('he'), "origPath": orig_categories}
        tracker.update(1, Category, main_cat_new_dict)

    @staticmethod
    def get_thin_toc(path):
        return library.get_toc_tree().lookup(path).serialize(thin=True)

    def test_reorder_editor(self, create_new_cats, create_fake_indices):
        first_book = create_fake_indices[0]
        second_book = create_fake_indices[2]
        reorderedBooks = [first_book, second_book]
        assert second_book.order[0] > first_book.order[0]
        update_order_of_category_children(create_new_cats[0], 1, reorderedBooks)
        assert second_book.order[0] < first_book.order[0]


    def test_category_change_all(self, create_new_terms, create_new_cats, create_fake_indices, new_collection, new_main_cat_shared_title):
        # modify a category and then reverse the changes and confirm that everything is back in place
        main_cat_term = create_new_terms[0]
        main_cat = create_new_cats[0]
        orig_contents = copy.deepcopy(main_cat.contents())
        orig_categories = orig_contents["path"]
        orig_toc = Test_Category_Editor.get_thin_toc(orig_categories)
        new_categories = ["Midrash", new_main_cat_shared_title.name]

        first_run = {"term": new_main_cat_shared_title, "orig": orig_categories, "new": new_categories,
                     "deep_diff": lambda orig, new: DeepDiff(orig, new, ignore_order=True)}
        second_run = {"term": main_cat_term, "orig": new_categories, "new": orig_categories,
                      "deep_diff": lambda orig, new: not DeepDiff(orig, new, ignore_order=True)}
        for run in [first_run, second_run]:
            results = Test_Category_Editor.change_cat(run["term"], run["orig"], run["new"])
            assert "errors" not in results, results["errors"]
            assert new_collection.toc["categories"] == run["new"]
            new_toc = Test_Category_Editor.get_thin_toc(run["new"])
            index_cats = library.get_index(create_fake_indices[0].title).categories
            assert run["new"] == index_cats, f"{index_cats} should be the same as {new_categories}"
            assert run["deep_diff"](orig_toc, new_toc), f"Deep Diff test failed for {run['term'].get_primary_title('en')}"


    def test_category_change_title_change_only(self, create_new_terms, create_new_cats, create_fake_indices,
                                               new_main_cat_shared_title, new_collection):
        # modify a category and then reverse the changes and confirm that everything is back in place
        main_cat_term = create_new_terms[0]
        main_cat = create_new_cats[0]
        orig_contents = copy.deepcopy(main_cat.contents())
        orig_categories = orig_contents["path"]
        orig_toc = Test_Category_Editor.get_thin_toc(orig_categories)
        new_categories = orig_categories[:-1] + [new_main_cat_shared_title.name]

        first_run = {"term": new_main_cat_shared_title, "orig": orig_categories, "new": new_categories,
                     "deep_diff": lambda orig, new: DeepDiff(orig, new, ignore_order=True)}
        second_run = {"term": main_cat_term, "orig": orig_categories, "new": new_categories,
                      "deep_diff": lambda orig, new: not DeepDiff(orig, new, ignore_order=True)}
        for run in [first_run, second_run]:
            results = Test_Category_Editor.change_cat(run["term"], run["orig"], run["new"])
            assert "errors" not in results, results["errors"]
            assert new_collection.toc["categories"] == run["new"]
            new_toc = Test_Category_Editor.get_thin_toc(run["new"])
            index_cats = library.get_index(create_fake_indices[0].title).categories
            assert run["new"] == index_cats, f"{index_cats} should be the same as {new_categories}"
            assert run["deep_diff"](orig_toc, new_toc), f"Deep Diff test failed for {run['term'].get_primary_title('en')}"


class Test_Categories(object):
    def test_index_save_with_bad_categories(self):
        title = 'Test Bad Cat'
        d = {
            "categories": [
                "Liturgy", "Bobby McGee"
            ],
            "title": title,
            "schema": {
                "titles": [
                    {
                        "lang": "en",
                        "text": title,
                        "primary": True
                    },
                    {
                        "lang": "he",
                        "text": "דוגמא ב",
                        "primary": True
                    }
                ],
                "nodeType": "JaggedArrayNode",
                "depth": 2,
                "sectionNames": [
                    "Section",
                    "Line"
                ],
                "addressTypes": [
                    "Integer",
                    "Integer"
                ],
                "key": title
            },
        }
        i = Index(d)
        with pytest.raises(InputError):
            i.save()

    @pytest.mark.deep
    def test_cat_name_change(self):
        base_toc = library.get_toc()
        base_json = json.dumps(base_toc, sort_keys=True)

        toc_tree = library.get_toc_tree()
        cat = toc_tree.lookup(["Tanakh", "Torah"]).get_category_object()
        cat.change_key_name("Seder Moed")
        cat.save()

        toc_tree = library.get_toc_tree()
        cat = toc_tree.lookup(["Tanakh", "Torah"])
        assert cat is None

        toc_cat = toc_tree.lookup(["Tanakh", "Seder Moed"])
        assert toc_cat
        for child in toc_cat.all_children():
            if isinstance(child, c.TocCategory):
                cobj = child.get_category_object()
                assert cobj.path[1] == "Seder Moed"
            elif isinstance(child, c.TocTextIndex):
                i = child.get_index_object()
                assert i.categories[1] == "Seder Moed"
            else:
                raise Exception()

        # Now unwind it
        cat = toc_cat.get_category_object()
        cat.change_key_name("Torah")
        cat.save()

        new_toc = library.get_toc()
        new_json = json.dumps(new_toc, sort_keys=True)

        # Deep test of toc lists
        assert not DeepDiff(base_toc, new_toc)

        # Check that the json is identical -
        # that the round-trip didn't change anything by reference that would poison the deep test
        assert len(base_json) == len(new_json)


"""
Are these tests necessary anymore?
They were useful in validating 1st class categories against older forms. 
"""
class Test_OO_Toc(object):
    def test_round_trip(self):
        base_toc = library.get_toc()
        base_json = json.dumps(base_toc, sort_keys=True)
        oo_toc = c.toc_serial_to_objects(base_toc)
        rt_toc = oo_toc.serialize()["contents"]

        # Deep test of toc lists
        assert not DeepDiff(base_toc, rt_toc)

        # Check that the json is identical -
        # that the round-trip didn't change anything by reference that would poison the deep test
        new_json = json.dumps(rt_toc, sort_keys=True)
        assert len(base_json) == len(new_json)

