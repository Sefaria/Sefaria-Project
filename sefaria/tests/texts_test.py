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
    assert u'Genesis' in l
    assert u'Talmud' in l


def test_get_he_text_titles():
    txts = [u'\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea', u'\u05e9\u05de\u05d5\u05ea', u'\u05d5\u05d9\u05e7\u05e8\u05d0']
    titles = t.get_he_text_titles()
    for txt in txts:
        assert txt in titles
    #todo, test with query


def test_get_en_text_titles():
    txts = [u'Avot', u'Avoth', u'Daniel', u'Dan',u'Dan.',u'Rashi',u'Igeret HaTeshuva']
    titles = t.get_en_text_titles()
    for txt in txts:
        assert txt in titles

    subset_titles = t.get_en_text_titles({"title": {"$regex": "Tos.*"}})
    assert u'Tos. Bava Kamma' in subset_titles
    assert u'Tosafot Yom Tov' in subset_titles
    assert u'Tosefta Bava Kamma' in subset_titles
    assert u'Tosafot' in subset_titles
    assert u'T. Chullin' in subset_titles # even alt names of things that match title

    assert u'Dan.' not in subset_titles
    assert u'Rashi' not in subset_titles