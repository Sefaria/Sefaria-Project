
# -*- coding: utf-8 -*-
import pytest
import json
from deepdiff import DeepDiff

from sefaria.system.exceptions import InputError
from sefaria.model import *
import sefaria.model.category as c
import sefaria.summaries as s


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

    @pytest.mark.failing
    def test_compare_db_toc_and_derived_toc(self):
        derived_toc = s.update_table_of_contents()
        base_json = json.dumps(derived_toc, sort_keys=True)
        oo_toc = library.get_toc_tree()
        serialized_oo_toc = oo_toc.get_root().serialize()["contents"]

        # Deep test of toc lists
        result = DeepDiff(derived_toc, serialized_oo_toc)
        assert not result or all(["JPS" in j["new_value"] for i in result.values() for j in i.values()])

        if result:
            # Irrelevant difference, but it makes the test below impossible.
            return

        # Check that the json is identical -
        # that the round-trip didn't change anything by reference that would poison the deep test
        new_json = json.dumps(serialized_oo_toc, sort_keys=True)
        assert len(base_json) == len(new_json)