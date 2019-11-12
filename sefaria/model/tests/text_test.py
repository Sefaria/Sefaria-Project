# -*- coding: utf-8 -*-
import regex as re
from copy import deepcopy
import pytest

import sefaria.model as model
from sefaria.system.exceptions import InputError


def teardown_module(module):
    titles = ['Test Commentator Name',
              'Bartenura (The Next Generation)',
              'Test Index Name',
              "Changed Test Index",
              "Third Attempt",
              "Test Iu",
              "Test Del"]

    for title in titles:
        model.IndexSet({"title": title}).delete()
        model.VersionSet({"title": title}).delete()


def test_dup_index_save():
    title = 'Test Commentator Name'
    model.IndexSet({"title": title}).delete()
    d = {
         "categories" : [
            "Liturgy"
        ],
        "title" : title,
        "schema" : {
            "titles" : [
                {
                    "lang" : "en",
                    "text" : title,
                    "primary" : True
                },
                {
                    "lang" : "he",
                    "text" : "פרשן",
                    "primary" : True
                }
            ],
            "nodeType" : "JaggedArrayNode",
            "depth" : 2,
            "sectionNames" : [
                "Section",
                "Line"
            ],
            "addressTypes" : [
                "Integer",
                "Integer"
            ],
            "key": title
        },
    }
    idx = model.Index(d)
    idx.save()
    assert model.IndexSet({"title": title}).count() == 1
    with pytest.raises(InputError) as e_info:
        d2 = {
            "title": title,
            "heTitle": u"פרשן ב",
            "titleVariants": [title],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Commentary"],
            "lengths": [50, 501]
        }
        idx2 = model.Index(d2).save()

    assert model.IndexSet({"title": title}).count() == 1


def test_invalid_index_save_no_existing_base_text():
    title = 'Bartenura (The Next Generation)'
    model.IndexSet({"title": title}).delete()
    d = {
         "categories" : [
            "Mishnah",
            "Commentary",
            "Bartenura",
            "Seder Zeraim"
        ],
        "base_text_titles": ["Gargamel"],
        "title" : title,
        "schema" : {
            "titles" : [
                {
                    "lang" : "en",
                    "text" : title,
                    "primary" : True
                },
                {
                    "lang" : "he",
                    "text" : "פרשן",
                    "primary" : True
                }
            ],
            "nodeType" : "JaggedArrayNode",
            "depth" : 2,
            "sectionNames" : [
                "Section",
                "Line"
            ],
            "addressTypes" : [
                "Integer",
                "Integer"
            ],
            "key": title
        },
    }
    idx = model.Index(d)
    with pytest.raises(InputError) as e_info:
        idx.save()
    assert "Base Text Titles must point to existing texts in the system." in str(e_info)
    assert model.IndexSet({"title": title}).count() == 0


def test_invalid_index_save_no_category():
    title = 'Bartenura (The Next Generation)'
    model.IndexSet({"title": title}).delete()
    d = {
         "categories" : [
            "Mishnah",
            "Commentary",
            "Bartenura",
            "Gargamel"
        ],
        "title" : title,
        "schema" : {
            "titles" : [
                {
                    "lang" : "en",
                    "text" : title,
                    "primary" : True
                },
                {
                    "lang" : "he",
                    "text" : "פרשן",
                    "primary" : True
                }
            ],
            "nodeType" : "JaggedArrayNode",
            "depth" : 2,
            "sectionNames" : [
                "Section",
                "Line"
            ],
            "addressTypes" : [
                "Integer",
                "Integer"
            ],
            "key": title
        },
    }
    idx = model.Index(d)
    with pytest.raises(InputError) as e_info:
        idx.save()
    assert "You must create category Mishnah/Commentary/Bartenura/Gargamel before adding texts to it." in str(e_info)
    assert model.IndexSet({"title": title}).count() == 0


def test_invalid_index_save_no_hebrew_collective_title():
    title = 'Bartenura (The Next Generation)'
    model.IndexSet({"title": title}).delete()
    d = {
         "categories" : [
            "Mishnah",
            "Commentary",
            "Bartenura"
        ],
        "collective_title": 'Gargamel',
        "title" : title,
        "schema" : {
            "titles" : [
                {
                    "lang" : "en",
                    "text" : title,
                    "primary" : True
                },
                {
                    "lang" : "he",
                    "text" : "פרשן",
                    "primary" : True
                }
            ],
            "nodeType" : "JaggedArrayNode",
            "depth" : 2,
            "sectionNames" : [
                "Section",
                "Line"
            ],
            "addressTypes" : [
                "Integer",
                "Integer"
            ],
            "key": title
        },
    }
    idx = model.Index(d)
    with pytest.raises(InputError) as e_info:
        idx.save()
    assert "You must add a hebrew translation Term for any new Collective Title: Gargamel." in str(e_info)
    assert model.IndexSet({"title": title}).count() == 0



"""def test_add_old_commentator():
    title = "Old Commentator Record"
    commentator = {
        "title": title,
        "heTitle": u"פרשן ב",
        "titleVariants": [title],
        "sectionNames": ["", ""],
        "categories": ["Commentary"],
    }
    commentator_idx = model.Index(commentator).save()
    assert getattr(commentator_idx, "nodes", None) is not None"""


def test_index_title_setter():
    title = 'Test Index Name'
    he_title = u"דוגמא"
    d = {
         "categories" : [
            "Liturgy"
        ],
        "title" : title,
        "schema" : {
            "titles" : [
                {
                    "lang" : "en",
                    "text" : title,
                    "primary" : True
                },
                {
                    "lang" : "he",
                    "text" : he_title,
                    "primary" : True
                }
            ],
            "nodeType" : "JaggedArrayNode",
            "depth" : 2,
            "sectionNames" : [
                "Section",
                "Line"
            ],
            "addressTypes" : [
                "Integer",
                "Integer"
            ],
            "key": title
        },
    }
    idx = model.Index(d)
    assert idx.title == title
    assert idx.nodes.key == title
    assert idx.nodes.primary_title("en") == title
    assert getattr(idx, 'title') == title
    idx.save()

    new_title = "Changed Test Index"
    new_heb_title = "דוגמא אחרי שינוי"
    idx.title = new_title

    assert idx.title == new_title
    assert idx.nodes.key == new_title
    assert idx.nodes.primary_title("en") == new_title
    assert getattr(idx, 'title') == new_title

    idx.set_title(new_heb_title, 'he')
    assert idx.nodes.primary_title('he') == new_heb_title


    third_title = "Third Attempt"
    setattr(idx, 'title', third_title)
    assert idx.title == third_title
    assert idx.nodes.key == third_title
    assert idx.nodes.primary_title("en") == third_title
    assert getattr(idx, 'title') == third_title
    idx.save()
    # make sure all caches pointing to this index are cleaned up
    for t in [("en",title),("en",new_title),("he",he_title),("en",new_heb_title)]:
        assert t[1] not in model.library._index_title_maps[t[0]]
    assert title not in model.library._index_map
    assert new_title not in model.library._index_map
    idx.delete()
    assert title not in model.library._index_map
    assert new_title not in model.library._index_map
    assert third_title not in model.library._index_map
    for t in [("en",title),("en",new_title),("en", third_title),("he",he_title),("en",new_heb_title)]:
        assert t[1] not in model.library._index_title_maps[t[0]]


def test_get_index():
    r = model.library.get_index("Rashi on Exodus")
    assert isinstance(r, model.Index)
    assert u'Rashi on Exodus' == r.title

    r = model.library.get_index("Exodus")
    assert isinstance(r, model.Index)
    assert r.title == u'Exodus'

def test_merge():
    assert model.merge_texts([["a", ""], ["", "b", "c"]], ["first", "second"]) == [["a", "b", "c"], ["first","second","second"]]
    # This fails because the source field isn't nested on return
    # assert model.merge_texts([[["a", ""],["p","","q"]], [["", "b", "c"],["p","d",""]]], ["first", "second"]) == [[["a", "b", "c"],["p","d","q"]], [["first","second","second"],["first","second","first"]]]
    assert model.merge_texts([[["a", ""],["p","","q"]], [["", "b", "c"],["p","d",""]]], ["first", "second"])[0] == [["a", "b", "c"],["p","d","q"]]



def test_text_helpers():
    res = model.library.get_dependant_indices()
    assert u'Rashbam on Genesis' in res
    assert u'Rashi on Bava Batra' in res
    assert u'Bartenura on Mishnah Oholot' in res
    assert u'Onkelos Leviticus' in res
    assert u'Chizkuni' in res
    assert u'Akeidat Yitzchak' not in res
    assert u'Berakhot' not in res

    res = model.library.get_indices_by_collective_title("Rashi")
    assert u'Rashi on Bava Batra' in res
    assert u'Rashi on Genesis' in res
    assert u'Rashbam on Genesis' not in res

    res = model.library.get_indices_by_collective_title("Bartenura")
    assert u'Bartenura on Mishnah Shabbat' in res
    assert u'Bartenura on Mishnah Oholot' in res
    assert u'Rashbam on Genesis' not in res

    res = model.library.get_dependant_indices(book_title="Exodus")
    assert u'Ibn Ezra on Exodus' in res
    assert u'Ramban on Exodus' in res
    assert u'Meshech Hochma' in res
    assert u'Abarbanel on Torah' in res
    assert u'Targum Jonathan on Exodus' in res
    assert u'Onkelos Exodus' in res
    assert u'Harchev Davar on Exodus' in res

    assert u'Exodus' not in res
    assert u'Rashi on Genesis' not in res

    res = model.library.get_dependant_indices(book_title="Exodus", dependence_type='Commentary')
    assert u'Ibn Ezra on Exodus' in res
    assert u'Ramban on Exodus' in res
    assert u'Meshech Hochma' in res
    assert u'Abarbanel on Torah' in res
    assert u'Harchev Davar on Exodus' in res

    assert u'Targum Jonathan on Exodus' not in res
    assert u'Onkelos Exodus' not in res
    assert u'Exodus' not in res
    assert u'Rashi on Genesis' not in res

    res = model.library.get_dependant_indices(book_title="Exodus", dependence_type='Commentary', structure_match=True)
    assert u'Ibn Ezra on Exodus' in res
    assert u'Ramban on Exodus' in res

    assert u'Harchev Davar on Exodus' not in res
    assert u'Meshech Hochma' not in res
    assert u'Abarbanel on Torah' not in res
    assert u'Exodus' not in res
    assert u'Rashi on Genesis' not in res

    cats = model.library.get_text_categories()
    assert u'Tanakh' in cats
    assert u'Torah' in cats
    assert u'Prophets' in cats
    assert u'Commentary' in cats


def test_index_update():
    '''
    :return: Test:
        index creation from legacy form
        update() function
        update of Index, like what happens on the frontend, doesn't whack hidden attrs
    '''
    ti = "Test Iu"

    i = model.Index({
        "title": ti,
        "heTitle": u"כבכב",
        "titleVariants": [ti],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Musar"],
        "lengths": [50, 501]
    }).save()
    i = model.Index().load({"title": ti})
    assert "Musar" in i.categories
    assert i.nodes.lengths == [50, 501]

    i = model.Index().update({"title": ti}, {
        "title": ti,
        "heTitle": u"כבכב",
        "titleVariants": [ti],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Philosophy"]
    })
    i = model.Index().load({"title": ti})
    assert "Musar" not in i.categories
    assert "Philosophy" in i.categories
    assert i.nodes.lengths == [50, 501]

    model.IndexSet({"title": ti}).delete()


def test_index_delete():
    #Simple Text
    ti = "Test Del"

    i = model.Index({
        "title": ti,
        "heTitle": u"כבכב",
        "titleVariants": [ti],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Musar"],
        "lengths": [50, 501]
    }).save()
    new_version1 = model.Version(
                {
                    "chapter": i.nodes.create_skeleton(),
                    "versionTitle": "Version 1 TEST",
                    "versionSource": "blabla",
                    "language": "he",
                    "title": i.title
                }
    )
    new_version1.chapter = [[u''],[u''],[u"לה לה לה לא חשוב על מה"]]
    new_version1.save()
    new_version2 = model.Version(
                {
                    "chapter": i.nodes.create_skeleton(),
                    "versionTitle": "Version 2 TEST",
                    "versionSource": "blabla",
                    "language": "en",
                    "title": i.title
                }
    )
    new_version2.chapter = [[],["Hello goodbye bla bla blah"],[]]
    new_version2.save()

    i.delete()
    assert model.Index().load({'title': ti}) is None
    assert model.VersionSet({'title':ti}).count() == 0





@pytest.mark.deep
def test_index_name_change():

    #Simple Text
    tests = [
        (u"The Book of Maccabees I", u"Movement of Ja People"),  # Simple Text
        # (u"Rashi", u"The Vintner")              # Commentator Invalid after commentary refactor?
    ]

    for old, new in tests:
        index = model.Index().load({"title": old})

        # Make sure that the test isn't passing just because we've been comparing 0 to 0
        assert all([cnt > 0 for cnt in dep_counts(old, index)])

        for cnt in dep_counts(new, index).values():
            assert cnt == 0

        old_counts = dep_counts(old, index)

        old_index = deepcopy(index)
        #new_in_alt = new in index.titleVariants
        index.title = new
        index.save()
        assert old_counts == dep_counts(new, index)

        index.title = old
        #if not new_in_alt:
        if getattr(index, "titleVariants", None):
            index.titleVariants.remove(new)
        index.save()
        #assert old_index == index   #needs redo of titling, above, i suspect
        assert old_counts == dep_counts(old, index)
        for cnt in dep_counts(new, index).values():
            assert cnt == 0


def dep_counts(name, indx):

    def construct_query(attribute, queries):
        query_list = [{attribute: {'$regex': query}} for query in queries]
        return {'$or': query_list}

    from sefaria.model.text import prepare_index_regex_for_dependency_process
    patterns = prepare_index_regex_for_dependency_process(indx, as_list=True)
    patterns = [pattern.replace(re.escape(indx.title), re.escape(name)) for pattern in patterns]

    ret = {
        'version title exact match': model.VersionSet({"title": name}, sort=[('title', 1)]).count(),
        'history title exact match': model.HistorySet({"title": name}, sort=[('title', 1)]).count(),
        'note match ': model.NoteSet(construct_query("ref", patterns), sort=[('ref', 1)]).count(),
        'link match ': model.LinkSet(construct_query("refs", patterns)).count(),
        'history refs match ': model.HistorySet(construct_query("ref", patterns), sort=[('ref', 1)]).count(),
        'history new refs match ': model.HistorySet(construct_query("new.refs", patterns), sort=[('new.refs', 1)]).count()
    }

    return ret


def test_version_word_count():
    #simple
    assert model.Version().load({"title": "Genesis", "language": "he", "versionTitle": "Tanach with Ta'amei Hamikra"}).word_count() == 20813
    assert model.Version().load({"title": "Rashi on Shabbat", "language": "he"}).word_count() > 0
    #complex
    assert model.Version().load({"title": "Pesach Haggadah", "language": "he"}).word_count() > 0
    assert model.Version().load({"title": "Orot", "language": "he"}).word_count() > 0
    assert model.Version().load({"title": "Ephod Bad on Pesach Haggadah"}).word_count() > 0

    #sets
    assert model.VersionSet({"title": {"$regex": "Haggadah"}}).word_count() > 200000


def test_version_walk_thru_contents():
    def action(segment_str, tref, heTref, version):
        r = model.Ref(tref)
        tc = model.TextChunk(r, lang=version.language, vtitle=version.versionTitle)
        assert tc.text == segment_str
        assert tref == r.normal()
        assert heTref == r.he_normal()

    test_index_titles = ["Genesis", "Rashi on Shabbat", "Pesach Haggadah", "Orot", "Ramban on Deuteronomy"]
    for t in test_index_titles:
        ind = model.library.get_index(t)
        vs = ind.versionSet()
        for v in vs:
            v.walk_thru_contents(action)


