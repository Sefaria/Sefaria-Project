# coding=utf-8
import pytest

from sefaria.model import *
from sefaria.system.exceptions import InputError
import re
from sefaria.model.text import AbstractTextRecord
from sefaria.utils.util import list_depth


def test_text_index_map():
    r = Ref("Shabbat 8b")
    tc = TextChunk(r,"he")

    def tokenizer(str):
        return re.split(r"\s+",str)

    ind_list,ref_list, total_len = tc.text_index_map(tokenizer)
    #print len(ind_list), len(ref_list)
    #make sure the last element in ind_last (start index of last segment) + the last of the last segment == len of the whole string
    assert ind_list[-1]+len(tokenizer(TextChunk(r.all_subrefs()[-1],"he").as_string())) == len(tokenizer(tc.as_string()))

    # Test Range
    g = Ref('Genesis 1:31-2:2')
    chunk = g.text('en', 'The Holy Scriptures: A New Translation (JPS 1917)')
    ind_list, ref_list, total_len = chunk.text_index_map(lambda x: x.split(' '))
    assert (ind_list, ref_list) == ([0, 26, 40], [Ref('Genesis 1:31'), Ref('Genesis 2:1'), Ref('Genesis 2:2')])

    #test depth 3 with empty sections
    r = Ref("Rashi on Joshua")
    tc = TextChunk(r,"he")
    ind_list, ref_list, total_len = tc.text_index_map()
    for sub_ref in ref_list:
        assert sub_ref.is_segment_level()
    assert ref_list[5] == Ref('Rashi on Joshua 1:4:3')
    assert ref_list[8] == Ref('Rashi on Joshua 1:7:1')

    #test depth 2 range
    r = Ref("Rashi on Joshua 1:4-1:7")
    tc = TextChunk(r,"he")
    ind_list, ref_list, total_len = tc.text_index_map()
    assert ref_list[5] == Ref('Rashi on Joshua 1:7:1')

    #test depth 3 range with missing super-section (Ramban Chapter 50 is missing)
    r = Ref("Ramban on Genesis 48-50")
    tc = TextChunk(r,"he")
    ind_list, ref_list, total_len = tc.text_index_map()
    assert ref_list[-1] == Ref('Ramban on Genesis 49:33:3')


    #test depth 2 with empty segments
    #r = Ref("Targum Jerusalem, Genesis")

def test_verse_chunk():
    chunks = [
        TextChunk(Ref("Daniel 2:3"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        TextChunk(Ref("Daniel 2:3"), "he", "Tanach with Nikkud"),
        TextChunk(Ref("Daniel 2:3"), "en"),
        TextChunk(Ref("Daniel 2:3"), "he")
    ]
    for c in chunks:
        assert isinstance(c.text, str)
        assert len(c.text)


def test_chapter_chunk():
    chunks = [
        TextChunk(Ref("Daniel 2"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        TextChunk(Ref("Daniel 2"), "he", "Tanach with Nikkud"),
        TextChunk(Ref("Daniel 2"), "en"),
        TextChunk(Ref("Daniel 2"), "he")
    ]
    for c in chunks:
        assert isinstance(c.text, list)
        assert len(c.text)


def test_depth_1_chunk():
    c = TextChunk(Ref("Hadran"), "he")
    assert isinstance(c.text, list)
    c = TextChunk(Ref("Hadran 3"), "he")
    assert isinstance(c.text, str)


def test_out_of_range_chunks():
    # test out of range where text has length
    with pytest.raises(InputError):
        TextChunk(Ref("Job 80"), "he")

    with pytest.raises(InputError):
        TextChunk(Ref("Shabbat 180"), "he")


def test_range_chunk():
    chunks = [
        TextChunk(Ref("Daniel 2:3-5"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        TextChunk(Ref("Daniel 2:3-5"), "he", "Tanach with Nikkud"),
        TextChunk(Ref("Daniel 2:3-5"), "en"),
        TextChunk(Ref("Daniel 2:3-5"), "he"),
    ]

    for c in chunks:
        assert isinstance(c.text, list)
        assert len(c.text) == 3


def test_spanning_chunk():
    chunks = [
        TextChunk(Ref("Daniel 2:3-4:5"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        TextChunk(Ref("Daniel 2:3-4:5"), "he", "Tanach with Nikkud"),
        TextChunk(Ref("Daniel 2:3-4:5"), "en"),
        TextChunk(Ref("Daniel 2:3-4:5"), "he")
    ]

    for c in chunks:
        assert isinstance(c.text, list)
        assert isinstance(c.text[0], list)
        assert len(c.text) == 3
        assert len(c.text[2]) == 5


def test_commentary_chunks():
    verse = TextChunk(Ref("Rashi on Exodus 3:1"), lang="he")
    rang = TextChunk(Ref("Rashi on Exodus 3:1-10"), lang="he")
    span = TextChunk(Ref("Rashi on Exodus 3:1-4:10"), lang="he")
    assert verse.text == rang.text[0]
    assert verse.text == span.text[0][0]

    verse = TextChunk(Ref("Rashi on Exodus 4:10"), lang="he")
    rang = TextChunk(Ref("Rashi on Exodus 4:1-10"), lang="he")
    assert rang.text[-1] == verse.text
    assert span.text[-1][-1] == verse.text


def test_default_in_family():
    r = Ref('Shulchan Arukh, Even HaEzer')
    f = TextFamily(r)
    assert isinstance(f.text, list)
    assert isinstance(f.he, list)
    assert len(f.text) > 0
    assert len(f.he) > 0


def test_spanning_family():
    f = TextFamily(Ref("Daniel 2:3-4:5"), context=0)

    assert isinstance(f.text, list)
    assert isinstance(f.he, list)
    assert len(f.text) == 3
    assert len(f.text[2]) == 5
    assert len(f.he) == 3
    assert len(f.he[2]) == 5
    assert isinstance(f.commentary[0], list)

    f = TextFamily(Ref("Daniel 2:3-4:5"))  # context = 1
    assert isinstance(f.text, list)
    assert isinstance(f.he, list)
    assert len(f.text) == 3
    assert len(f.text[2]) == 34
    assert len(f.he) == 3
    assert len(f.he[2]) == 34
    assert isinstance(f.commentary[0], list)


def test_family_chapter_result_no_merge():
    families = [
        TextFamily(Ref("Onkelos Exodus 12")),  # this is supposed to get a version with exactly 1 en and 1 he.  The data may change.
        TextFamily(Ref("Daniel 2")),
        TextFamily(Ref("Daniel 4"), lang="en", version="The Holy Scriptures: A New Translation (JPS 1917)"),
        TextFamily(Ref("Daniel 4"), lang="he", version="Tanach with Nikkud")
    ]

    for v in families:
        assert isinstance(v.text, list)
        assert isinstance(v.he, list)

        c = v.contents()
        for key in ["text", "ref", "he", "book", "commentary"]:  # todo: etc.
            assert key in c

# Yoma.1 is no longer merged.
# todo: find a merged text to test with
@pytest.mark.xfail(reason="unknown")
def test_chapter_result_merge():
    v = TextFamily(Ref("Mishnah_Yoma.1"))

    assert isinstance(v.text, list)
    assert isinstance(v.he, list)
    c = v.contents()
    for key in ["text", "ref", "he", "book", "sources", "commentary"]:  # todo: etc.
        assert key in c


def test_text_family_alts():
    tf = TextFamily(Ref("Exodus 6"), commentary=False, alts=True)
    c = tf.contents()
    assert c.get("alts")

def test_text_family_version_with_underscores():
    with_spaces = TextFamily(
        Ref("Amos 1"), lang="he", lang2="en", commentary=False,
        version="Miqra according to the Masorah",
        version2="Tanakh: The Holy Scriptures, published by JPS")
    with_underscores = TextFamily(
        Ref("Amos 1"), lang="he", lang2="en", commentary=False,
        version="Miqra_according_to_the_Masorah",
        version2="Tanakh:_The_Holy_Scriptures,_published_by_JPS")
    assert with_spaces.he == with_underscores.he
    assert with_spaces.text == with_underscores.text

def test_validate():
    passing_refs = [
        Ref("Exodus"),
        Ref("Exodus 3"),
        Ref("Exodus 3:4"),
        Ref("Exodus 3-5"),
        Ref("Exodus 3:4-5:7"),
        Ref("Exodus 3:4-7"),
        Ref("Rashi on Exodus"),
        Ref("Rashi on Exodus 3"),
        Ref("Rashi on Exodus 3:2"),
        Ref("Rashi on Exodus 3-5"),
        Ref("Rashi on Exodus 3:2-5:7"),
        Ref("Rashi on Exodus 3:2-7"),
        Ref("Rashi on Exodus 3:2:1"),
        Ref("Rashi on Exodus 3:2:1-3"),
        Ref("Rashi on Exodus 3:2:1-3:5:1"),
        Ref("Shabbat"),
        Ref("Shabbat 7a"),
        Ref("Shabbat 7a-8b"),
        Ref("Shabbat 7a:9"),
        Ref("Shabbat 7a:2-9"),
        Ref("Shabbat 7a:2-7b:3"),
        Ref("Rashi on Shabbat 7a"),
        Ref("Rashi on Shabbat 7a-8b"),
        Ref("Rashi on Shabbat 7a:9"),
        Ref("Rashi on Shabbat 7a:2-9"),
        Ref("Rashi on Shabbat 7a:2-7b:3")
    ]
    for ref in passing_refs:
        TextChunk(ref, lang="he")._validate()


def test_save():
    # Delete any old ghost
    vs = ["Hadran Test", "Pirkei Avot Test", "Rashi on Exodus Test"]
    for vt in vs:
        try:
            Version().load({"versionTitle": vt}).delete()
        except:
            pass

    # create new version, depth 1
    v = Version({
        "language": "en",
        "title": "Hadran",
        "versionSource": "http://foobar.com",
        "versionTitle": "Hadran Test",
        "chapter": []
    }).save()
    # write to blank version
    c = TextChunk(Ref("Hadran 3"), "en", "Hadran Test")
    c.text = "Here's a translation for the eras"
    c.save()

    # write beyond current extent
    c = TextChunk(Ref("Hadran 5"), "en", "Hadran Test")
    c.text = "Here's another translation for the eras"
    c.save()

    # write within current extent
    c = TextChunk(Ref("Hadran 4"), "en", "Hadran Test")
    c.text = "Here's yet another translation for the eras"
    c.save()

    # insert some nefarious code
    c = TextChunk(Ref("Hadran 6"), "en", "Hadran Test")
    c.text = 'Here\'s yet another translation for the eras <a href="javascript:alert(8007)">Click me</a>'
    c.save()

    # verify
    c = TextChunk(Ref("Hadran"), "en", "Hadran Test")
    assert c.text[2] == "Here's a translation for the eras"
    assert c.text[3] == "Here's yet another translation for the eras"
    assert c.text[4] == "Here's another translation for the eras"
    assert c.text[5] == "Here's yet another translation for the eras <a>Click me</a>"

    # delete version
    v.delete()

    # create new version, depth 2
    v = Version({
        "language": "en",
        "title": "Pirkei Avot",
        "versionSource": "http://foobar.com",
        "versionTitle": "Pirkei Avot Test",
        "chapter": []
    }).save()

    # write to new verse of new chapter
    c = TextChunk(Ref("Pirkei Avot 2:3"), "en", "Pirkei Avot Test")
    c.text = "Text for 2:3"
    c.save()

    # extend to new verse of later chapter
    c = TextChunk(Ref("Pirkei Avot 3:4"), "en", "Pirkei Avot Test")
    c.text = "Text for 3:4"
    c.save()

    # write new chapter beyond created range
    # also test that blank space isn't saved
    c = TextChunk(Ref("Pirkei Avot 5"), "en", "Pirkei Avot Test")
    c.text = ["Text for 5:1", "Text for 5:2", "Text for 5:3", "Text for 5:4", "", " "]
    c.save()

    # write new chapter within created range
    c = TextChunk(Ref("Pirkei Avot 4"), "en", "Pirkei Avot Test")
    c.text = ["Text for 4:1", "Text for 4:2", "Text for 4:3", "Text for 4:4"]
    c.save()

    # write within explicitly created chapter
    c = TextChunk(Ref("Pirkei Avot 3:5"), "en", "Pirkei Avot Test")
    c.text = "Text for 3:5"
    c.save()
    c = TextChunk(Ref("Pirkei Avot 3:3"), "en", "Pirkei Avot Test")
    c.text = "Text for 3:3"
    c.save()

    # write within implicitly created chapter
    c = TextChunk(Ref("Pirkei Avot 1:5"), "en", "Pirkei Avot Test")
    c.text = "Text for 1:5"
    c.save()

    # Rewrite
    c = TextChunk(Ref("Pirkei Avot 4:2"), "en", "Pirkei Avot Test")
    c.text = "New Text for 4:2"
    c.save()

    # verify
    c = TextChunk(Ref("Pirkei Avot"), "en", "Pirkei Avot Test")
    assert c.text == [
        ["", "", "", "", "Text for 1:5"],
        ["", "", "Text for 2:3"],
        ["", "", "Text for 3:3", "Text for 3:4", "Text for 3:5"],
        ["Text for 4:1", "New Text for 4:2", "Text for 4:3", "Text for 4:4"],
        ["Text for 5:1", "Text for 5:2", "Text for 5:3", "Text for 5:4"]
    ]

    # Test overwrite of whole text
    # also test that blank space isn't saved
    c.text = [
        ["Fee", "", "Fi", ""],
        ["", "", "Fo"],
        ["", "Fum", "Text for 3:3", "Text for 3:4"],
        ["Text for 4:1", "New Text for 4:2","", "Text for 4:4",""]
    ]
    c.save()
    c = TextChunk(Ref("Pirkei Avot"), "en", "Pirkei Avot Test")
    assert c.text == [
        ["Fee", "", "Fi"],
        ["", "", "Fo"],
        ["", "Fum", "Text for 3:3", "Text for 3:4"],
        ["Text for 4:1", "New Text for 4:2","", "Text for 4:4"]
    ]

    v.delete()

    with pytest.raises(Exception) as e_info:
        # create new version for a non existing commentary, depth 3 - should fail
        v = Version({
            "language": "en",
            "title": "Rashi on Pirkei Avot",
            "versionSource": "http://foobar.com",
            "versionTitle": "Rashi on Pirkei Avot Test",
            "chapter": []
        }).save()

    v = Version({
        "language": "en",
        "title": "Rashi on Exodus",
        "versionSource": "http://foobar.com",
        "versionTitle": "Rashi on Exodus Test",
        "chapter": []
    }).save()
    # write to new verse of new chapter
    c = TextChunk(Ref("Rashi on Exodus 2:3"), "en", "Rashi on Exodus Test")
    c.text = ["Text for 2:3:1", "Text for 2:3:2"]
    c.save()

    # extend to new verse of later chapter
    c = TextChunk(Ref("Rashi on Exodus 3:4:3"), "en", "Rashi on Exodus Test")
    c.text = "Text for 3:4:3"
    c.save()

    # write new chapter beyond created range
    # test that blank space isn't saved
    c = TextChunk(Ref("Rashi on Exodus 5"), "en", "Rashi on Exodus Test")
    c.text = [["Text for 5:1:1"], ["Text for 5:2:1", "", ""], ["Text for 5:3:1","Text for 5:3:2", "     ", "", " "],["Text for 5:4:1", "", "  "]]
    c.save()

    # write new chapter within created range
    c = TextChunk(Ref("Rashi on Exodus 4"), "en", "Rashi on Exodus Test")
    c.text = [["Text for 4:1:1", "Text for 4:1:2", "Text for 4:1:3", "Text for 4:1:4"]]
    c.save()

    # write within explicitly created chapter
    c = TextChunk(Ref("Rashi on Exodus 3:5:1"), "en", "Rashi on Exodus Test")
    c.text = "Text for 3:5:1"
    c.save()
    c = TextChunk(Ref("Rashi on Exodus 3:3:3"), "en", "Rashi on Exodus Test")
    c.text = "Text for 3:3:3"
    c.save()

    # write within implicitly created chapter
    c = TextChunk(Ref("Rashi on Exodus 1:5"), "en", "Rashi on Exodus Test")
    c.text = ["Text for 1:5", "Text for 1:5:2"]
    c.save()

    # Rewrite
    c = TextChunk(Ref("Rashi on Exodus 4:1:2"), "en", "Rashi on Exodus Test")
    c.text = "New Text for 4:1:2"
    c.save()

    # verify
    c = TextChunk(Ref("Rashi on Exodus"), "en", "Rashi on Exodus Test")
    assert c.text == [
        [[], [], [], [], ["Text for 1:5", "Text for 1:5:2"]],
        [[], [], ["Text for 2:3:1", "Text for 2:3:2"]],
        [[], [], ["", "", "Text for 3:3:3"], ["", "", "Text for 3:4:3"], ["Text for 3:5:1"]],
        [["Text for 4:1:1", "New Text for 4:1:2", "Text for 4:1:3", "Text for 4:1:4"]],
        [["Text for 5:1:1"], ["Text for 5:2:1"], ["Text for 5:3:1", "Text for 5:3:2"], ["Text for 5:4:1"]]
    ]

    v.delete()

    # write


def test_complex_with_depth_1():
    # There was a bug that chunks of complex texts always returned the first element of the array, even for deeper chunks
    r = Ref('Pesach Haggadah, Kadesh 1')
    c = TextChunk(r, "he")
    assert "כוס ראשון" in c.text

    r = Ref('Pesach Haggadah, Kadesh 2')
    c = TextChunk(r, "he")
    assert "קַדֵּשׁ" in c.text

    r = Ref('Pesach Haggadah, Kadesh 2-4')
    c = TextChunk(r, "he")
    assert len(c.text) == 3
    assert "קַדֵּשׁ" in c.text[0]

    #Comparing Hebrew is hard.
    #assert u"בְּשַׁבָּת מַתְחִילִין" in c.text[1]
    #assert u"וַיִּשְׁבֹּת" in c.text[2]

    c = TextChunk(r, "en")
    assert len(c.text) == 3
    assert "Kiddush" in c.text[0]
    assert "seventh day" in c.text[2]


def test_complex_with_depth_2():
    pass


def test_strip_imgs():
    text = "text with an image"
    image = "<img src='src.jpg' alt='image caption'>"
    assert AbstractTextRecord.strip_imgs(f"{text}{image}") == text
    assert AbstractTextRecord.strip_imgs(text) == text


@pytest.mark.xfail(reason="<br/> tags become <br>, so don't match exactly.")
def test_strip_itags():
    vs = ["Hadran Test"]
    for vt in vs:
        try:
            Version().load({"versionTitle": vt}).delete()
        except:
            pass

    r = Ref("Genesis 1:1")
    c = TextChunk(r, "he")
    text = c._get_text_after_modifications([c.strip_itags])
    assert text == TextChunk(r, "he").text

    r = Ref("Genesis 1")
    c = TextChunk(r, "he")
    modified_text = c._get_text_after_modifications([c.strip_itags])
    original_text = TextChunk(r, "he").text
    for mod, ori in zip(modified_text, original_text):
        assert mod == ori

    # create new version, depth 1
    v = Version({
        "language": "en",
        "title": "Hadran",
        "versionSource": "http://foobar.com",
        "versionTitle": "Hadran Test",
        "chapter": ['Cool text <sup>1</sup><i class="footnote yo">well, not that cool</i>',
                    'Silly text <sup>1</sup><i class="footnote">See <i>cool text</i></i>',
                    'More text <i data-commentator="Boring comment" data-order="1"></i> and yet more',
                    'Where the <i data-overlay="Other system" data-value=""></i>']
    }).save()
    modified_text = ['Cool text', 'Silly text', 'More text and yet more']
    c = TextChunk(Ref("Hadran"), "en", "Hadran Test")
    test_modified_text = c._get_text_after_modifications([c.strip_itags, lambda x, _: ' '.join(x.split()).strip()])
    for m, t in zip(modified_text, test_modified_text):
        assert m == t

    test_modified_text = v._get_text_after_modifications([v.strip_itags, lambda x, _: ' '.join(x.split()).strip()])
    for m, t in zip(modified_text, test_modified_text):
        assert m == t

    # test without any modification functions
    test_modified_text = c._get_text_after_modifications([])
    for m, t in zip(c.text, test_modified_text):
        assert m == t

    test_modified_text = v._get_text_after_modifications([])
    for m, t in zip(v.chapter, test_modified_text):
        assert m == t

    text = '<i></i>Lo, his spirit.'
    assert TextChunk.strip_itags(text) == text

