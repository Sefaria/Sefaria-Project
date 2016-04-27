"""
Tests of texts.py (and things recently factored out. :)
"""
import pytest
from helper.text import rename_category

import sefaria.model.text as tm
from sefaria.model.link import get_book_link_collection

@pytest.mark.deep
def test_rename_category():

    old = "Rishonim"
    new = "Rishon'im"

    assert not tm.IndexSet({"categories": new}).count()
    c = tm.IndexSet({"categories": old}).count()
    assert c
    rename_category(old, new)
    assert not tm.IndexSet({"categories": old}).count()
    assert tm.IndexSet({"categories": new}).count()
    rename_category(new, old)
    assert c == tm.IndexSet({"categories": old}).count()
    assert not tm.IndexSet({"categories": new}).count()


def test_get_commentary_texts_list():
    l = tm.library.get_dependant_indices()
    assert u'Baal HaTurim on Genesis' in l
    assert u'Bartenura on Mishnah Eduyot' in l
    assert u'Tosafot on Pesachim' in l


def test_get_text_categories():
    l = tm.library.get_text_categories()
    assert u'Torah' in l
    assert u'Talmud' in l


def test_get_book_link_collection():
    res = get_book_link_collection("Shabbat", "Tanach")
    assert len(res) > 650
