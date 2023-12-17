# -*- coding: utf-8 -*-
import regex as re
from copy import deepcopy
import pytest

import sefaria.model as model
from sefaria.system.exceptions import InputError
from sefaria.system.testing import test_uid


def teardown_module(module):
    titles = ['Test Commentator Name',
              'Bartenura (The Next Generation)',
              'Test Index Name',
              "Changed Test Index",
              "Third Attempt",
              "Test Iu",
              "Test Del"]

    for title in titles:
        try:
            model.IndexSet({"title": title}).delete()
        except Exception:
            pass
        try:
            model.VersionSet({"title": title}).delete()
        except Exception:
            pass


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
            "heTitle": "פרשן ב",
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
    assert "Base Text Titles must point to existing texts in the system." in str(e_info.value)
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
    assert "You must create category Mishnah/Commentary/Bartenura/Gargamel before adding texts to it." in str(e_info.value)
    assert model.IndexSet({"title": title}).count() == 0

def test_best_time_period():
    i = model.library.get_index("Rashi on Genesis")
    assert i.best_time_period().period_string('en') == ' (c.1075  – c.1105 CE)'
    i.compDate = None
    assert i.best_time_period().period_string('en') == ' (1040  – 1105 CE)'  # now that compDate is None, period_string should return Rashi's birth to death years

def test_invalid_index_save_no_hebrew_collective_title():
    title = 'Bartenura (The Next Generation)'
    model.IndexSet({"title": title}).delete()
    d = {
         "categories" : [
            "Mishnah",
            "Rishonim on Mishnah",
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
    assert "You must add a hebrew translation Term for any new Collective Title: Gargamel." in str(e_info.value)
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
    he_title = "דוגמא"
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
    assert 'Rashi on Exodus' == r.title

    r = model.library.get_index("Exodus")
    assert isinstance(r, model.Index)
    assert r.title == 'Exodus'


def test_merge():
    assert model.merge_texts([["a", ""], ["", "b", "c"]], ["first", "second"]) == [["a", "b", "c"], ["first","second","second"]]
    # This fails because the source field isn't nested on return
    # assert model.merge_texts([[["a", ""],["p","","q"]], [["", "b", "c"],["p","d",""]]], ["first", "second"]) == [[["a", "b", "c"],["p","d","q"]], [["first","second","second"],["first","second","first"]]]

    # depth 2
    assert model.merge_texts([[["a", ""],["p","","q"]], [["", "b", "c"],["p","d",""]]], ["first", "second"])[0] == [["a", "b", "c"],["p","d","q"]]

    # three texts, depth 2
    assert model.merge_texts([[["a", ""],["p","",""]], [["", "b", ""],["p","d",""]], [["","","c"],["","","q"]]], ["first", "second", "third"])[0] == [["a", "b", "c"],["p","d","q"]]


def test_text_helpers():
    res = model.library.get_dependant_indices()
    assert 'Rashbam on Genesis' in res
    assert 'Rashi on Bava Batra' in res
    assert 'Bartenura on Mishnah Oholot' in res
    assert 'Onkelos Leviticus' in res
    assert 'Chizkuni' in res
    assert 'Akeidat Yitzchak' not in res
    assert 'Berakhot' not in res

    res = model.library.get_indices_by_collective_title("Rashi")
    assert 'Rashi on Bava Batra' in res
    assert 'Rashi on Genesis' in res
    assert 'Rashbam on Genesis' not in res

    res = model.library.get_indices_by_collective_title("Bartenura")
    assert 'Bartenura on Mishnah Shabbat' in res
    assert 'Bartenura on Mishnah Oholot' in res
    assert 'Rashbam on Genesis' not in res

    res = model.library.get_dependant_indices(book_title="Exodus")
    assert 'Ibn Ezra on Exodus' in res
    assert 'Ramban on Exodus' in res
    assert 'Meshekh Chokhmah' in res
    assert 'Abarbanel on Torah' in res
    assert 'Targum Jonathan on Exodus' in res
    assert 'Onkelos Exodus' in res
    assert 'Harchev Davar on Exodus' in res

    assert 'Exodus' not in res
    assert 'Rashi on Genesis' not in res

    res = model.library.get_dependant_indices(book_title="Exodus", dependence_type='Commentary')
    assert 'Ibn Ezra on Exodus' in res
    assert 'Ramban on Exodus' in res
    assert 'Meshekh Chokhmah' in res
    assert 'Abarbanel on Torah' in res
    assert 'Harchev Davar on Exodus' in res

    assert 'Targum Jonathan on Exodus' not in res
    assert 'Onkelos Exodus' not in res
    assert 'Exodus' not in res
    assert 'Rashi on Genesis' not in res

    res = model.library.get_dependant_indices(book_title="Exodus", dependence_type='Commentary', structure_match=True)
    assert 'Ibn Ezra on Exodus' in res
    assert 'Ramban on Exodus' in res

    assert 'Harchev Davar on Exodus' not in res
    assert 'Meshekh Chokhmah' not in res
    assert 'Abarbanel on Torah' not in res
    assert 'Exodus' not in res
    assert 'Rashi on Genesis' not in res

    cats = model.library.get_text_categories()
    assert 'Tanakh' in cats
    assert 'Torah' in cats
    assert 'Prophets' in cats
    assert 'Commentary' in cats


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
        "heTitle": "כבכב",
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
        "heTitle": "כבכב",
        "titleVariants": [ti],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Jewish Thought"]
    })
    i = model.Index().load({"title": ti})
    assert "Musar" not in i.categories
    assert "Jewish Thought" in i.categories
    assert i.nodes.lengths == [50, 501]

    model.IndexSet({"title": ti}).delete()


def test_index_delete():
    #Simple Text
    ti = "Test Del"

    i = model.Index({
        "title": ti,
        "heTitle": "כבכב",
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
    new_version1.chapter = [[''],[''],["לה לה לה לא חשוב על מה"]]
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
        ("The Book of Maccabees I", "Movement of Ja People"),  # Simple Text
        # (u"Rashi", u"The Vintner")              # Commentator Invalid after commentary refactor?
    ]

    for old, new in tests:
        index = model.Index().load({"title": old})

        # Make sure that the test isn't passing just because we've been comparing 0 to 0
        assert all([cnt > 0 for cnt in dep_counts(old, index)])

        for cnt in list(dep_counts(new, index).values()):
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
        for cnt in list(dep_counts(new, index).values()):
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

    test_index_titles = ["Genesis", "Rashi on Shabbat", "Pesach Haggadah", "Orot", "Ramban on Deuteronomy", "Zohar"]
    for t in test_index_titles:
        ind = model.library.get_index(t)
        version = ind.versionSet()[0]
        version.walk_thru_contents(action)


class TestModifyVersion:
    simpleIndexTitle = "Test ModifyVersion Simple " + test_uid
    complexIndexTitle = "Test ModifyVersion Complex " + test_uid
    vtitle = "Version TEST"
    vlang = "he"

    @classmethod
    def setup_class(cls):
        cls.simpleIndex = model.Index({
            "title": cls.simpleIndexTitle,
            "heTitle": "בלה1",
            "titleVariants": [cls.simpleIndexTitle],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
            "lengths": [50, 501]
        }).save()
        cls.simpleVersion = model.Version(
            {
                "chapter": cls.simpleIndex.nodes.create_skeleton(),
                "versionTitle": "Version 1 TEST",
                "versionSource": "blabla",
                "language": "he",
                "title": cls.simpleIndexTitle
            }
        )
        cls.simpleVersion.chapter = [['1'], ['2'], ["original text", "2nd"]]
        cls.simpleVersion.save()
        cls.complexIndex = model.Index({
            "title": cls.complexIndexTitle,
            "heTitle": "2בלה",
            "titleVariants": [cls.complexIndexTitle],
            "schema": {
                "nodes": [
                    {
                        "nodes": [
                            {
                                "nodeType": "JaggedArrayNode",
                                "depth": 2,
                                "sectionNames": ["Chapter", "Paragraph"],
                                "addressTypes": ["Integer", "Integer"],
                                "titles": [{"text": "Node 2", "lang": "en", "primary": True}, {"text": "Node 2 he", "lang": "he", "primary": True}],
                                "key": "Node 2"
                            }
                        ],
                        "titles": [{"text": "Node 1", "lang": "en", "primary": True}, {"text": "Node 1 he", "lang": "he", "primary": True}],
                        "key": "Node 1"
                    },
                    {
                        "nodeType": "JaggedArrayNode",
                        "depth": 1,
                        "sectionNames": ["Paragraph"],
                        "addressTypes": ["Integer"],
                        "titles": [{"text": "Node 3", "lang": "en", "primary": True}, {"text": "Node 3 he", "lang": "he", "primary": True}],
                        "key": "Node 3"
                    }
                ],
                "titles": [{"text": cls.complexIndexTitle, "lang": "en", "primary": True},
                           {"text": cls.complexIndexTitle + "he", "lang": "he", "primary": True}],
                "key": cls.complexIndexTitle
            },
            "categories": ["Musar"]
        }).save()
        cls.complexVersion = model.Version(
                    {
                        "chapter": cls.complexIndex.nodes.create_skeleton(),
                        "versionTitle": "Version 2 TEST",
                        "versionSource": "blabla",
                        "language": "en",
                        "title": cls.complexIndexTitle
                    }
        )
        cls.complexVersion.chapter = {"Node 1": {"Node 2": [['yo'],['', 'blah'],["original text", "2nd"]]}, "Node 3": ['1', '2', '3', '4']}
        cls.complexVersion.save()

    @classmethod
    def teardown_class(cls):
        for c in [cls.simpleIndex, cls.complexIndex, cls.simpleVersion, cls.complexVersion]:
            try:
                c.delete()
            except Exception:
                pass

    def test_sub_content_with_ref(self):
        self.simpleVersion.sub_content_with_ref(model.Ref(f"{self.simpleIndexTitle} 3:2"), "new text")
        assert self.simpleVersion.chapter[2][1] == "new text"

        self.complexVersion.sub_content_with_ref(model.Ref(f"{self.complexIndexTitle}, Node 1, Node 2 3:2"), "new text")
        assert self.complexVersion.chapter["Node 1"]["Node 2"][2][1] == "new text"

        self.complexVersion.sub_content_with_ref(model.Ref(f"{self.complexIndexTitle}, Node 1, Node 2 3"), ["blah", "blarg"])
        assert self.complexVersion.chapter["Node 1"]["Node 2"][2] == ["blah", "blarg"]
        self.complexVersion.sub_content_with_ref(model.Ref(f"{self.complexIndexTitle}, Node 1, Node 2 3"), ["original text", "2nd"])  # set back to original content for other tests

        self.complexVersion.sub_content_with_ref(model.Ref(f"{self.complexIndexTitle}, Node 1, Node 2"), [["blah", "blarg"], ['more content']])
        assert self.complexVersion.chapter["Node 1"]["Node 2"] == [["blah", "blarg"], ['more content']]
        self.complexVersion.sub_content_with_ref(model.Ref(f"{self.complexIndexTitle}, Node 1, Node 2"), [['yo'],['', 'blah'],["original text", "2nd"]])  # set back to original content for other tests

    def test_sub_content_with_ref_padding(self):
        self.simpleVersion.sub_content_with_ref(model.Ref(f"{self.simpleIndexTitle} 3:5"), "new text")
        assert self.simpleVersion.chapter[2][2] == ""
        assert self.simpleVersion.chapter[2][3] == ""
        assert self.simpleVersion.chapter[2][4] == "new text"

        self.simpleVersion.sub_content_with_ref(model.Ref(f"{self.simpleIndexTitle} 5:1"), "new text2")
        assert self.simpleVersion.chapter[3] == []
        assert self.simpleVersion.chapter[4][0] == "new text2"

        # reset
        self.simpleVersion.sub_content_with_ref(model.Ref(f"{self.simpleIndexTitle}"), [['1'], ['2'], ["original text", "2nd"]])

    def test_sub_content_simple_setter(self):
        self.simpleVersion.sub_content(self.simpleIndex.nodes.version_address(), value=[[], [], []])
        for i in range(3):
            assert self.simpleVersion.chapter[i] == []

        self.simpleVersion.sub_content(self.simpleIndex.nodes.version_address(), [1], value=['yo1', 'yo2', 'yo3'])
        assert self.simpleVersion.chapter[1] == ['yo1', 'yo2', 'yo3']

        self.simpleVersion.sub_content(self.simpleIndex.nodes.version_address(), [0, 1], value='yo')
        assert self.simpleVersion.chapter[0][1] == 'yo'

        # reset
        self.simpleVersion.sub_content_with_ref(model.Ref(f"{self.simpleIndexTitle}"), [['1'], ['2'], ["original text", "2nd"]])

    def test_sub_content_complex_setter(self):
        self.complexVersion.sub_content([], value={"Node 1": {"Node 2": [['wadup']], "Node 3": []}})
        assert self.complexVersion.chapter['Node 1']['Node 2'] == [['wadup']]

        self.complexVersion.sub_content(["Node 1"], value={"Node 2": [['yoyoyo']]})
        assert self.complexVersion.chapter['Node 1']['Node 2'] == [['yoyoyo']]

        self.complexVersion.sub_content_with_ref(model.Ref(f"{self.complexIndexTitle}"), {"Node 1": {"Node 2": [['yo'],['', 'blah'],["original text", "2nd"]]}, "Node 3": ['1', '2', '3', '4']})

    def test_get_top_level_jas_text_chunk(self):
        tc = model.Ref(self.simpleIndexTitle).text('he')
        jas, parent_key_list = tc.get_top_level_jas()
        assert len(jas) == 1 == len(parent_key_list)
        assert jas[0][1][0] == '2'
        assert parent_key_list[0][0] is None
        assert parent_key_list[0][1] is None

    def test_get_top_level_jas_version_simple(self):
        jas, parent_key_list = self.simpleVersion.get_top_level_jas()
        assert len(jas) == 1 == len(parent_key_list)
        assert jas[0][1][0] == '2'
        assert parent_key_list[0][0] is None
        assert parent_key_list[0][1] is None

    def test_get_top_level_jas_version_complex(self):
        jas, parent_key_list = self.complexVersion.get_top_level_jas()
        assert len(jas) == 2 == len(parent_key_list)
        assert jas[0][1][1] == 'blah'
        assert jas[1][3] == '4'
        for ja, (parent, key) in zip(jas, parent_key_list):
            assert parent[key] == ja

    def test_trim_ending_whitespace_text_chunk(self):
        tc = model.Ref(self.simpleIndexTitle).text('he')
        original_len = len(tc.text[0])
        tc.text[0] += ['', '', '   ', None]
        tc._trim_ending_whitespace()
        assert len(tc.text[0]) == original_len

    def test_trim_ending_whitespace_version_simple(self):
        original_len = len(self.simpleVersion.chapter[0])
        self.simpleVersion.chapter[0] += ['', '', '   ', None]
        self.simpleVersion._trim_ending_whitespace()
        assert len(self.simpleVersion.chapter[0]) == original_len

    def test_trim_ending_whitespace_version_complex(self):
        node = self.complexVersion.chapter['Node 1']['Node 2']
        original_len = len(node[0])
        node[0] += ['', '', '   ', None]
        self.complexVersion._trim_ending_whitespace()
        assert (len(self.complexVersion.chapter['Node 1']['Node 2'][0]) == original_len)


class TestVersionActualLanguage:
    myIndexTitle = "Test VersionActualLanguage " + test_uid
    vtitle = "Version TEST"
    vlang = "he"

    @classmethod
    def setup_class(cls):
        cls.myIndex = model.Index({
            "title": cls.myIndexTitle,
            "heTitle": "בלה2",
            "titleVariants": [cls.myIndexTitle],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
            "lengths": [50, 501]
        }).save()
        cls.versionWithTranslation = model.Version(
            {
                "chapter": cls.myIndex.nodes.create_skeleton(),
                "versionTitle": "Version 1 TEST [fr]",
                "versionSource": "blabla",
                "language": "he",
                "title": cls.myIndexTitle
            }
        )
        cls.versionWithTranslation.chapter = [['1'], ['2'], ["original text", "2nd"]]
        cls.versionWithTranslation.save()
        cls.versionWithoutTranslation = model.Version(
            {
                "chapter": cls.myIndex.nodes.create_skeleton(),
                "versionTitle": "Version 1 TEST",
                "versionSource": "blabla",
                "language": "he",
                "title": cls.myIndexTitle
            }
        )
        cls.versionWithoutTranslation.chapter = [['1'], ['2'], ["original text", "2nd"]]
        cls.versionWithoutTranslation.save()
        cls.versionWithLangCodeMismatch = model.Version(
            {
                "chapter": cls.myIndex.nodes.create_skeleton(),
                "versionTitle": "Version 1 TEST [ar]",
                "versionSource": "blabla",
                "language": "he",
                "actualLanguage": "fr",
                "title": cls.myIndexTitle
            }
        )
        
    @classmethod
    def teardown_class(cls):
        for c in [cls.myIndex, cls.versionWithTranslation, cls.versionWithoutTranslation, cls.versionWithLangCodeMismatch]:
            try:
                c.delete()
            except Exception:
                pass
    
    def test_normalizes_actualLanguage_from_brackets(self):
        assert self.versionWithTranslation.actualLanguage == "fr"
    
    def test_normalizes_language_from_language(self):
        assert self.versionWithoutTranslation.actualLanguage == "he"

    def test_save_when_language_mismatch(self):
        self.versionWithLangCodeMismatch.save()
        assert self.versionWithLangCodeMismatch.actualLanguage == "ar"