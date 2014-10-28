# -*- coding: utf-8 -*-
import regex as re
from copy import deepcopy
import pytest

import sefaria.model as model


def test_index_methods():
    assert model.Index().load({"title": "Rashi"}).is_commentary()
    assert not model.Index().load({"title": "Exodus"}).is_commentary()


def test_get_index():
    r = model.get_index("Rashi on Exodus")
    assert isinstance(r, model.CommentaryIndex)
    assert r.titleVariants == [u'Rashi on Exodus']

    r = model.get_index("Exodus")
    assert isinstance(r, model.Index)
    assert r.title == u'Exodus'


def test_text_helpers():
    res = model.get_commentary_version_titles()
    assert u'Rashbam on Genesis' in res
    assert u'Rashi on Bava Batra' in res
    assert u'Bartenura on Mishnah Oholot' in res

    res = model.get_commentary_version_titles("Rashi")
    assert u'Rashi on Bava Batra' in res
    assert u'Rashi on Genesis' in res
    assert u'Rashbam on Genesis' not in res

    res = model.get_commentary_version_titles(["Rashi", "Bartenura"])
    assert u'Rashi on Bava Batra' in res
    assert u'Rashi on Genesis' in res
    assert u'Bartenura on Mishnah Oholot' in res
    assert u'Rashbam on Genesis' not in res

    res = model.get_commentary_version_titles_on_book("Exodus")
    assert u'Ibn Ezra on Exodus' in res
    assert u'Ramban on Exodus' in res
    assert u'Rashi on Genesis' not in res

    cats = model.get_text_categories()
    assert u'Tanach' in cats
    assert u'Torah' in cats
    assert u'Prophets' in cats
    assert u'Commentary' in cats


def test_index_delete():
    #Simple Text

    #Commentator
    pass



class Test_get_titles_in_text(object):

    def test_no_bare_number(self):
        barenum = u"In this text, there is no reference but there is 1 bare number."
        res = model.get_titles_in_string(barenum)
        assert set(res) == set()

    def test_positions(self):
        bible_mid = u"Here we have Genesis 3:5 may it be blessed"
        bible_begin = u"Genesis 3:5 in the house"
        bible_end = u"Let there be Genesis 3:5"
        for a in [bible_mid, bible_begin, bible_end]:
            assert {'Genesis'} <= set(model.get_titles_in_string(a))

    def test_multi_titles(self):
        two_ref = u"This is a test of a Brachot 7b and also of an Isaiah 12:13."
        res = model.get_titles_in_string(two_ref)
        assert set(res) >= {'Brachot', 'Isaiah'}

    def test_he_bible_ref(self):
        bible_ref = u"אם נביא הוא נבואתו מסתלקת ממנו מדבורה דכתיב (שופטים ה, ז) חדלו פרזון בישראל"
        false_pos = u"תלמוד לומר (דברים טז, יח) שופטים תתן שוטרים"

        res = model.get_titles_in_string(bible_ref, "he")
        assert set(res) >= {u"שופטים"}

        res = model.get_titles_in_string(false_pos, "he")
        assert set(res) >= {u"שופטים", u"דברים"}

    def test_he_positions(self):
        bible_begin = u"(שמות כא, ד) אם אדוניו יתן לו אשה"  # These work, even though the presentation of the parens may be confusing.
        bible_mid = u"בד (שמות כא, ד) אם אדוניו יתן לו"
        bible_end = u"אמר קרא (שמות כא, ד)"
        for a in [bible_mid, bible_begin, bible_end]:
            assert {u"שמות"} <= set(model.get_titles_in_string(a, "he"))


def test_get_en_text_titles():
    txts = [u'Avot', u'Avoth', u'Daniel', u'Dan', u'Dan.', u'Rashi', u'Igeret HaTeshuva', u"Me'or Einayim, Vayera"]
    titles = model.get_text_titles()
    for txt in txts:
        assert txt in titles

    subset_titles = model.get_text_titles({"title": {"$regex": "Tos.*"}})
    assert u'Tos. Bava Kamma' in subset_titles
    assert u'Tosafot Yom Tov' in subset_titles
    assert u'Tosefta Bava Kamma' in subset_titles
    assert u'Tosafot' in subset_titles
    assert u'T. Chullin' in subset_titles  # even alt names of things that match title

    assert u'Dan.' not in subset_titles
    assert u'Rashi' not in subset_titles


def test_get_he_text_titles():
    txts = [u'\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea', u'\u05e9\u05de\u05d5\u05ea', u'\u05d5\u05d9\u05e7\u05e8\u05d0']
    titles = model.get_text_titles(lang="he")
    for txt in txts:
        assert txt in titles
    #todo, test with query

@pytest.mark.deep
def test_index_name_change():

    #Simple Text
    tests = [
        (u"Exodus", u"Movement of Ja People"),  # Simple Text
        (u"Rashi", u"The Vintner")              # Commentator
    ]

    for old, new in tests:
        for cnt in dep_counts(new).values():
            assert cnt == 0

        old_counts = dep_counts(old)

        index = model.Index().load({"title": old})
        old_index = deepcopy(index)
        new_in_alt = new in index.titleVariants
        index.title = new
        index.save()
        assert old_counts == dep_counts(new)

        index.title = old
        if not new_in_alt:
            index.titleVariants.remove(new)
        index.save()
        assert old_index == index
        assert old_counts == dep_counts(old)
        for cnt in dep_counts(new).values():
            assert cnt == 0


def dep_counts(name):
    commentators = model.IndexSet({"categories.0": "Commentary"}).distinct("title")
    ref_patterns = {
        'alone': r'^{} \d'.format(re.escape(name)),
        'commentor': r'{} on'.format(re.escape(name)),
        'commentee': r'^({}) on {} \d'.format("|".join(commentators), re.escape(name))
    }

    commentee_title_pattern = r'^({}) on {} \d'.format("|".join(commentators), re.escape(name))

    ret = {
        'version title exact match': model.VersionSet({"title": name}).count(),
        'version title match commentor': model.VersionSet({"title": {"$regex": ref_patterns["commentor"]}}).count(),
        'version title match commentee': model.VersionSet({"title": {"$regex": commentee_title_pattern}}).count(),
        'history title exact match': model.HistorySet({"title": name}).count(),
        'history title match commentor': model.HistorySet({"title": {"$regex": ref_patterns["commentor"]}}).count(),
        'history title match commentee': model.HistorySet({"title": {"$regex": commentee_title_pattern}}).count(),
    }

    for pname, pattern in ref_patterns.items():
        ret.update({
            'note match ' + pname: model.NoteSet({"ref": {"$regex": pattern}}).count(),
            'link match ' + pname: model.LinkSet({"refs": {"$regex": pattern}}).count(),
            'history refs match ' + pname: model.HistorySet({"ref": {"$regex": pattern}}).count(),
            'history new refs match ' + pname: model.HistorySet({"new.refs": {"$regex": pattern}}).count()
        })

    return ret

