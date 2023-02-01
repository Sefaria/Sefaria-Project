# -*- coding: utf-8 -*-
import pytest
import json
from deepdiff import DeepDiff

from sefaria.system.exceptions import InputError
from sefaria.model import *
import sefaria.model.category as c


class Test_Categories(object):
    @pytest.fixture(autouse=True, scope='module')
    def create_new_cats(self):
        titles = {"New Fake Category 1": ["New Fake Category 1"], "New Fake Category 2": ["New Fake Category 1", "New Fake Category 2"]}
        terms = []
        cats = []
        for title, path in titles.items():
            t = Term()
            t.add_primary_titles(title, title[::-1])
            t.name = title
            t.save()
            terms.append(t)
            c = Category()
            c.path = path
            c.add_shared_term(t.name)
            c.save()
            cats.append(c)
        yield cats
        for t in terms:
            t.delete()
        for c in cats[::-1]:
            c.delete()

    @pytest.fixture(autouse=True, scope='module')
    def create_fake_indices(self, create_new_cats):
        books = []
        for i, title in enumerate(['Fake Book 1', 'Fake Book 2']):
            d = {
                "categories": [
                    create_new_cats[i].path
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
            book = Index(i)
            book.save()
            books.append(book)

        yield books
        for b in books:
            b.delete()

    def test_create_and_move_category(self, create_new_cats, create_fake_indices):
        main_cat = create_new_cats[0]
        sub_cat = create_new_cats[1]
        main_cat_book = create_fake_indices[0]
        sub_cat_book = create_fake_indices[1]

        # original toc
        # compare original toc to new toc, should be different
        # then reverse
        # compare new toc to original, should be same
        orig_toc = library.get_toc_tree().contents()
        main_cat_orig = main_cat.contents()

        # simulate category editor: change title, path and desc all at once
        new_main_cat_shared_title = Term()
        new_main_cat_shared_title.name = "New Shared Title for Main Cat"
        new_main_cat_shared_title.add_primary_titles(new_main_cat_shared_title.name, new_main_cat_shared_title.name[::-1])
        new_main_cat_shared_title.save()
        main_cat.lastPath = new_main_cat_shared_title.name
        main_cat.path = ["Tanakh", "Torah", new_main_cat_shared_title.name]
        main_cat.enDesc = "New Main Cat Description"
        main_cat.enShortDesc = "New Desc"
        main_cat.heDesc = "New Long Hebrew Description"
        main_cat.heShortDesc = "New Short Hebrew"
        main_cat.save()

        new_toc = library.get_toc_tree().contents()
        assert orig_toc != new_toc, "TOCs should be unequal."

        main_cat_new = main_cat.contents()
        main_cat_new.update(main_cat_orig)
        main_cat.load_from_dict(main_cat_new)
        main_cat.save()

        new_toc = library.get_toc_tree().contents()
        assert orig_toc == new_toc, "TOCs should be equal."


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

