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
    res = model.library.get_commentary_version_titles()
    assert u'Rashbam on Genesis' in res
    assert u'Rashi on Bava Batra' in res
    assert u'Bartenura on Mishnah Oholot' in res

    res = model.library.get_commentary_version_titles("Rashi")
    assert u'Rashi on Bava Batra' in res
    assert u'Rashi on Genesis' in res
    assert u'Rashbam on Genesis' not in res

    res = model.library.get_commentary_version_titles(["Rashi", "Bartenura"])
    assert u'Rashi on Bava Batra' in res
    assert u'Rashi on Genesis' in res
    assert u'Bartenura on Mishnah Oholot' in res
    assert u'Rashbam on Genesis' not in res

    res = model.library.get_commentary_version_titles_on_book("Exodus")
    assert u'Ibn Ezra on Exodus' in res
    assert u'Ramban on Exodus' in res
    assert u'Rashi on Genesis' not in res

    cats = model.library.get_text_categories()
    assert u'Tanach' in cats
    assert u'Torah' in cats
    assert u'Prophets' in cats
    assert u'Commentary' in cats


def test_index_delete():
    #Simple Text

    #Commentator
    pass



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

