"""
Tests of texts.py (and things recently factored out. :)
"""
import sefaria.texts as t
import sefaria.model.text as tm


def test_rename_category():

    old = "Rishonim"
    new = "Rishon'im"

    assert not tm.IndexSet({"categories": new}).count()
    c = tm.IndexSet({"categories": old}).count()
    assert c
    t.rename_category(old, new)
    assert not tm.IndexSet({"categories": old}).count()
    assert tm.IndexSet({"categories": new}).count()
    t.rename_category(new, old)
    assert c == tm.IndexSet({"categories": old}).count()


def test_get_commentary_texts_list():
    l = tm.get_commentary_version_titles()
    assert u'Baal HaTurim on Genesis' in l
    assert u'Bartenura on Mishnah Eduyot' in l
    assert u'Tosafot on Pesachim' in l


def test_get_text_categories():
    l = tm.get_text_categories()
    assert u'Torah' in l
    assert u'Talmud' in l
