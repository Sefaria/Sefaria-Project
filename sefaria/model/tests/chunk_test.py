# coding=utf-8
import pytest

from sefaria.model import *
from sefaria.model.legacy_text import LegacyTextChunk, TextFamily
from sefaria.system.exceptions import InputError
import re
from sefaria.model.text import AbstractTextRecord
from sefaria.utils.util import list_depth


def test_text_index_map():
    r = Ref("Shabbat 8b")
    tc = LegacyTextChunk(r,"he")

    def tokenizer(str):
        return re.split(r"\s+",str)

    ind_list,ref_list, total_len = tc.text_index_map(tokenizer)
    #print len(ind_list), len(ref_list)
    #make sure the last element in ind_last (start index of last segment) + the last of the last segment == len of the whole string
    assert ind_list[-1]+len(tokenizer(LegacyTextChunk(r.all_subrefs()[-1],"he").as_string())) == len(tokenizer(tc.as_string()))

    # Test Range
    g = Ref('Genesis 1:31-2:2')
    chunk = g.text('en', 'The Holy Scriptures: A New Translation (JPS 1917)')
    ind_list, ref_list, total_len = chunk.text_index_map(lambda x: x.split(' '))
    assert (ind_list, ref_list) == ([0, 26, 40], [Ref('Genesis 1:31'), Ref('Genesis 2:1'), Ref('Genesis 2:2')])

    #test depth 3 with empty sections
    r = Ref("Rashi on Joshua")
    tc = LegacyTextChunk(r,"he")
    ind_list, ref_list, total_len = tc.text_index_map()
    for sub_ref in ref_list:
        assert sub_ref.is_segment_level()
    assert ref_list[5] == Ref('Rashi on Joshua 1:4:3')
    assert ref_list[8] == Ref('Rashi on Joshua 1:7:1')

    #test depth 2 range
    r = Ref("Rashi on Joshua 1:4-1:7")
    tc = LegacyTextChunk(r,"he")
    ind_list, ref_list, total_len = tc.text_index_map()
    assert ref_list[5] == Ref('Rashi on Joshua 1:7:1')

    #test depth 3 range with missing super-section (Ramban Chapter 50 is missing)
    r = Ref("Ramban on Genesis 48-50")
    tc = LegacyTextChunk(r,"he")
    ind_list, ref_list, total_len = tc.text_index_map()
    assert ref_list[-1] == Ref('Ramban on Genesis 49:33:3')


    #test depth 2 with empty segments
    #r = Ref("Targum Jerusalem, Genesis")

def test_verse_chunk():
    chunks = [
        LegacyTextChunk(Ref("Daniel 2:3"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        LegacyTextChunk(Ref("Daniel 2:3"), "he", "Tanach with Nikkud"),
        LegacyTextChunk(Ref("Daniel 2:3"), "en"),
        LegacyTextChunk(Ref("Daniel 2:3"), "he")
    ]
    for c in chunks:
        assert isinstance(c.text, str)
        assert len(c.text)


def test_chapter_chunk():
    chunks = [
        LegacyTextChunk(Ref("Daniel 2"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        LegacyTextChunk(Ref("Daniel 2"), "he", "Tanach with Nikkud"),
        LegacyTextChunk(Ref("Daniel 2"), "en"),
        LegacyTextChunk(Ref("Daniel 2"), "he")
    ]
    for c in chunks:
        assert isinstance(c.text, list)
        assert len(c.text)


def test_depth_1_chunk():
    c = LegacyTextChunk(Ref("Hadran"), "he")
    assert isinstance(c.text, list)
    c = LegacyTextChunk(Ref("Hadran 3"), "he")
    assert isinstance(c.text, str)


def test_out_of_range_chunks():
    # test out of range where text has length
    with pytest.raises(InputError):
        LegacyTextChunk(Ref("Job 80"), "he")

    with pytest.raises(InputError):
        LegacyTextChunk(Ref("Shabbat 180"), "he")


def test_range_chunk():
    chunks = [
        LegacyTextChunk(Ref("Daniel 2:3-5"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        LegacyTextChunk(Ref("Daniel 2:3-5"), "he", "Tanach with Nikkud"),
        LegacyTextChunk(Ref("Daniel 2:3-5"), "en"),
        LegacyTextChunk(Ref("Daniel 2:3-5"), "he"),
    ]

    for c in chunks:
        assert isinstance(c.text, list)
        assert len(c.text) == 3


def test_spanning_chunk():
    chunks = [
        LegacyTextChunk(Ref("Daniel 2:3-4:5"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        LegacyTextChunk(Ref("Daniel 2:3-4:5"), "he", "Tanach with Nikkud"),
        LegacyTextChunk(Ref("Daniel 2:3-4:5"), "en"),
        LegacyTextChunk(Ref("Daniel 2:3-4:5"), "he")
    ]

    for c in chunks:
        assert isinstance(c.text, list)
        assert isinstance(c.text[0], list)
        assert len(c.text) == 3
        assert len(c.text[2]) == 5


def test_commentary_chunks():
    verse = LegacyTextChunk(Ref("Rashi on Exodus 3:1"), lang="he")
    rang = LegacyTextChunk(Ref("Rashi on Exodus 3:1-10"), lang="he")
    span = LegacyTextChunk(Ref("Rashi on Exodus 3:1-4:10"), lang="he")
    assert verse.text == rang.text[0]
    assert verse.text == span.text[0][0]

    verse = LegacyTextChunk(Ref("Rashi on Exodus 4:10"), lang="he")
    rang = LegacyTextChunk(Ref("Rashi on Exodus 4:1-10"), lang="he")
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


def test_sources_scoped_and_no_fake_attribution_for_depth_gt_2():
    """
    TextChunk.sources used to lose positional correspondence for depth>2 texts (merge_texts
    flattened across the whole node before any per-ref scoping) and attributed empty positions
    to an arbitrary candidate instead of leaving them unattributed. Two versions of a depth-3
    book (chapter > verse > comment), each contributing at a different comment within the same
    verse and neither at a third, reproduce both bugs. Uses a throwaway synthetic index so real
    books' existing content can't interfere.
    """
    title = "Chunk Sources Test Book"
    try:
        Index().load({"title": title}).delete()
    except Exception:
        pass

    idx = Index({
        "title": title,
        "categories": ["Liturgy"],
        "schema": {
            "titles": [
                {"lang": "en", "text": title, "primary": True},
                {"lang": "he", "text": "ספר בדיקה", "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 3,
            "sectionNames": ["Chapter", "Verse", "Comment"],
            "addressTypes": ["Integer", "Integer", "Integer"],
            "key": title,
        },
    })
    idx.save()

    vt_a, vt_b = "Sources Test A", "Sources Test B"
    va = Version({"language": "en", "title": title, "versionSource": "http://foobar.com",
                 "versionTitle": vt_a, "chapter": []}).save()
    vb = Version({"language": "en", "title": title, "versionSource": "http://foobar.com",
                 "versionTitle": vt_b, "chapter": []}).save()

    try:
        c = LegacyTextChunk(Ref(f"{title} 1:1"), "en", vt_a)
        c.text = ["Only in A", "", ""]
        c.save()

        c = LegacyTextChunk(Ref(f"{title} 1:1"), "en", vt_b)
        c.text = ["", "", "Only in B"]
        c.save()

        tc = Ref(f"{title} 1").text(direction="ltr")
        flat_text = tc.ja().flatten_to_array()

        assert flat_text == ["Only in A", "", "Only in B"]
        assert tc.sources is not None
        assert len(tc.sources) == 3
        assert tc.sources[0] == vt_a
        assert tc.sources[1] == ""  # no fake attribution where neither version has content
        assert tc.sources[2] == vt_b
    finally:
        va.delete()
        vb.delete()
        idx.delete()


def test_save_reuses_existing_version_despite_stale_unsuffixed_vtitle():
    """
    Saving a new non-en/he version auto-suffixes its versionTitle with "[xx]"
    (Version._normalize()). TextChunk.save() must update self.vtitle to the real, saved title
    afterward -- callers (e.g. the save API response) rely on reading it back from there rather
    than re-deriving it. A second, independent TextChunk built using that corrected title (as a
    caller who read it back would) must land on the same version, not create a duplicate.
    """
    title = "Chunk Save Suffix Test Book"
    try:
        Index().load({"title": title}).delete()
    except Exception:
        pass

    idx = Index({
        "title": title,
        "categories": ["Liturgy"],
        "schema": {
            "titles": [
                {"lang": "en", "text": title, "primary": True},
                {"lang": "he", "text": "ספר בדיקת גרסה", "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Chapter", "Verse"],
            "addressTypes": ["Integer", "Integer"],
            "key": title,
        },
    })
    idx.save()

    vtitle = "Suffix Test Version"
    try:
        chunk1 = TextChunk(Ref(f"{title} 1:1"), vtitle=vtitle, direction="rtl", actual_lang="yi")
        chunk1.text = "First segment"
        chunk1.save()
        assert chunk1.vtitle == f"{vtitle} [yi]"

        versions = VersionSet({"title": title, "direction": "rtl"})
        assert len(versions) == 1
        assert versions[0].versionTitle == f"{vtitle} [yi]"

        # Second, independent TextChunk built using the corrected title chunk1.save() reported --
        # must land on the same version, not create a duplicate.
        chunk2 = TextChunk(Ref(f"{title} 1:2"), vtitle=chunk1.vtitle, direction="rtl", actual_lang="yi")
        chunk2.text = "Second segment"
        chunk2.save()
        assert chunk2.vtitle == f"{vtitle} [yi]"

        versions = VersionSet({"title": title, "direction": "rtl"})
        assert len(versions) == 1, "Reusing the corrected title must not create a duplicate Version"

        tc = Ref(f"{title} 1").text(direction="rtl")
        assert tc.ja().flatten_to_array() == ["First segment", "Second segment"]
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def _make_synthetic_index(title, he_title, depth, section_names):
    try:
        Index().load({"title": title}).delete()
    except Exception:
        pass
    idx = Index({
        "title": title,
        "categories": ["Liturgy"],
        "schema": {
            "titles": [
                {"lang": "en", "text": title, "primary": True},
                {"lang": "he", "text": he_title, "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": depth,
            "sectionNames": section_names,
            "addressTypes": ["Integer"] * depth,
            "key": title,
        },
    })
    idx.save()
    return idx


def test_new_chunk_verse_chapter_range_spanning_reads():
    """
    Read-path coverage for the new (real-language) TextChunk, mirroring the old
    LegacyTextChunk verse/chapter/range/spanning tests -- segment reads return a string,
    section reads return a list, ranges return a list of the right length, and refs spanning
    multiple sections return a nested list. Synthetic depth-2 book, so this doesn't depend on
    any real book's content.
    """
    title = "New Chunk Read Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת קריאה", 2, ["Chapter", "Verse"])
    try:
        chapter1 = ["Alpha", "Beta", "Gamma"]
        chapter2 = ["Delta", "Epsilon"]
        for i, val in enumerate(chapter1, start=1):
            c = Ref(f"{title} 1:{i}").text(direction="ltr", lang="en", vtitle="Read Test Version")
            c.text = val
            c.save()
        for i, val in enumerate(chapter2, start=1):
            c = Ref(f"{title} 2:{i}").text(direction="ltr", lang="en", vtitle="Read Test Version")
            c.text = val
            c.save()

        verse = Ref(f"{title} 1:2").text(direction="ltr")
        assert isinstance(verse.text, str)
        assert verse.text == "Beta"

        chapter = Ref(f"{title} 1").text(direction="ltr")
        assert isinstance(chapter.text, list)
        assert chapter.text == chapter1

        rng = Ref(f"{title} 1:1-3").text(direction="ltr")
        assert isinstance(rng.text, list)
        assert rng.text == chapter1

        span = Ref(f"{title} 1:2-2:2").text(direction="ltr")
        assert isinstance(span.text, list)
        assert len(span.text) == 2
        assert span.text[0] == ["Beta", "Gamma"]
        assert span.text[1] == ["Delta", "Epsilon"]
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def test_new_chunk_depth_1_read():
    """Depth-1 books address individual segments directly at the top numeric level."""
    title = "New Chunk Depth1 Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת עומק אחד", 1, ["Line"])
    try:
        lines = ["First line", "Second line", "Third line"]
        c = Ref(title).text(direction="ltr", lang="en", vtitle="Depth1 Test Version")
        c.text = lines
        c.save()

        whole = Ref(title).text(direction="ltr")
        assert isinstance(whole.text, list)
        assert whole.text == lines

        single = Ref(f"{title} 3").text(direction="ltr")
        assert isinstance(single.text, str)
        assert single.text == "Third line"
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def test_new_chunk_commentary_style_depth_3_read():
    """
    Nested (chapter>verse>comment) addressing consistency, mirroring the old
    LegacyTextChunk commentary test: a single-comment read must equal the corresponding
    position within a wider range read of the same content.
    """
    title = "New Chunk Depth3 Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת עומק שלוש", 3, ["Chapter", "Verse", "Comment"])
    try:
        c = Ref(f"{title} 1:1:1").text(direction="ltr", lang="en", vtitle="Depth3 Test Version")
        c.text = "First comment"
        c.save()
        c = Ref(f"{title} 1:1:2").text(direction="ltr", lang="en", vtitle="Depth3 Test Version")
        c.text = "Second comment"
        c.save()

        verse = Ref(f"{title} 1:1:1").text(direction="ltr")
        rng = Ref(f"{title} 1:1:1-2").text(direction="ltr")
        assert verse.text == rng.text[0]
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def test_new_chunk_save_write_blank_extend_and_within_extent():
    """
    Save-path coverage for the new TextChunk, mirroring LegacyTextChunk's test_save: writing
    to a blank version, writing beyond the current extent (implicitly padding), and writing
    within the current extent, all correctly reflected on read-back.
    """
    title = "New Chunk Save Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת שמירה", 2, ["Chapter", "Verse"])
    vtitle = "Save Test Version"
    try:
        c = TextChunk(Ref(f"{title} 3:1"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = "Here's a translation for the eras"
        c.save()

        # write beyond current extent
        c = TextChunk(Ref(f"{title} 5:1"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = "Here's another translation for the eras"
        c.save()

        # write within current extent
        c = TextChunk(Ref(f"{title} 4:1"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = "Here's yet another translation for the eras"
        c.save()

        whole = Ref(title).text(direction="ltr")
        assert whole.text[2] == ["Here's a translation for the eras"]
        assert whole.text[3] == ["Here's yet another translation for the eras"]
        assert whole.text[4] == ["Here's another translation for the eras"]
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def test_new_chunk_save_sanitizes_html_and_trims_blank_overwrite():
    """
    Save-path coverage: dangerous HTML is stripped on save (matching LegacyTextChunk's
    sanitization), and overwriting a whole chapter drops blank trailing entries rather than
    saving them.
    """
    title = "New Chunk Sanitize Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת חיטוי", 2, ["Chapter", "Verse"])
    vtitle = "Sanitize Test Version"
    try:
        c = TextChunk(Ref(f"{title} 1:1"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = 'Here\'s some text <a href="javascript:alert(8007)">Click me</a>'
        c.save()

        read_back = Ref(f"{title} 1:1").text(direction="ltr")
        assert read_back.text == "Here's some text <a>Click me</a>"

        # Overwrite whole chapter; blank trailing entries should not be saved.
        c = Ref(f"{title} 1").text(direction="ltr", vtitle=vtitle)
        c.text = ["Fee", "", "Fi", ""]
        c.save()

        whole = Ref(f"{title} 1").text(direction="ltr")
        assert whole.text == ["Fee", "", "Fi"]
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def test_new_chunk_save_depth_3_commentary_style():
    """Save-path coverage for a depth-3 (chapter>verse>comment) structure, matching
    LegacyTextChunk's Rashi-on-Exodus-style save test."""
    title = "New Chunk Save Depth3 Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת שמירה עומק שלוש", 3, ["Chapter", "Verse", "Comment"])
    vtitle = "Save Depth3 Test Version"
    try:
        c = TextChunk(Ref(f"{title} 2:3:1"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = "Text for 2:3:1"
        c.save()
        c = TextChunk(Ref(f"{title} 2:3:2"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = "Text for 2:3:2"
        c.save()
        c = TextChunk(Ref(f"{title} 3:4:3"), vtitle=vtitle, direction="ltr", actual_lang="en")
        c.text = "Text for 3:4:3"
        c.save()

        whole = Ref(title).text(direction="ltr")
        assert whole.text[1][2] == ["Text for 2:3:1", "Text for 2:3:2"]
        assert whole.text[2][3] == ["", "", "Text for 3:4:3"]
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


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
        LegacyTextChunk(ref, lang="he")._validate()


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
    c = LegacyTextChunk(Ref("Hadran 3"), "en", "Hadran Test")
    c.text = "Here's a translation for the eras"
    c.save()

    # write beyond current extent
    c = LegacyTextChunk(Ref("Hadran 5"), "en", "Hadran Test")
    c.text = "Here's another translation for the eras"
    c.save()

    # write within current extent
    c = LegacyTextChunk(Ref("Hadran 4"), "en", "Hadran Test")
    c.text = "Here's yet another translation for the eras"
    c.save()

    # insert some nefarious code
    c = LegacyTextChunk(Ref("Hadran 6"), "en", "Hadran Test")
    c.text = 'Here\'s yet another translation for the eras <a href="javascript:alert(8007)">Click me</a>'
    c.save()

    # verify
    c = LegacyTextChunk(Ref("Hadran"), "en", "Hadran Test")
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
    c = LegacyTextChunk(Ref("Pirkei Avot 2:3"), "en", "Pirkei Avot Test")
    c.text = "Text for 2:3"
    c.save()

    # extend to new verse of later chapter
    c = LegacyTextChunk(Ref("Pirkei Avot 3:4"), "en", "Pirkei Avot Test")
    c.text = "Text for 3:4"
    c.save()

    # write new chapter beyond created range
    # also test that blank space isn't saved
    c = LegacyTextChunk(Ref("Pirkei Avot 5"), "en", "Pirkei Avot Test")
    c.text = ["Text for 5:1", "Text for 5:2", "Text for 5:3", "Text for 5:4", "", " "]
    c.save()

    # write new chapter within created range
    c = LegacyTextChunk(Ref("Pirkei Avot 4"), "en", "Pirkei Avot Test")
    c.text = ["Text for 4:1", "Text for 4:2", "Text for 4:3", "Text for 4:4"]
    c.save()

    # write within explicitly created chapter
    c = LegacyTextChunk(Ref("Pirkei Avot 3:5"), "en", "Pirkei Avot Test")
    c.text = "Text for 3:5"
    c.save()
    c = LegacyTextChunk(Ref("Pirkei Avot 3:3"), "en", "Pirkei Avot Test")
    c.text = "Text for 3:3"
    c.save()

    # write within implicitly created chapter
    c = LegacyTextChunk(Ref("Pirkei Avot 1:5"), "en", "Pirkei Avot Test")
    c.text = "Text for 1:5"
    c.save()

    # Rewrite
    c = LegacyTextChunk(Ref("Pirkei Avot 4:2"), "en", "Pirkei Avot Test")
    c.text = "New Text for 4:2"
    c.save()

    # verify
    c = LegacyTextChunk(Ref("Pirkei Avot"), "en", "Pirkei Avot Test")
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
    c = LegacyTextChunk(Ref("Pirkei Avot"), "en", "Pirkei Avot Test")
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
    c = LegacyTextChunk(Ref("Rashi on Exodus 2:3"), "en", "Rashi on Exodus Test")
    c.text = ["Text for 2:3:1", "Text for 2:3:2"]
    c.save()

    # extend to new verse of later chapter
    c = LegacyTextChunk(Ref("Rashi on Exodus 3:4:3"), "en", "Rashi on Exodus Test")
    c.text = "Text for 3:4:3"
    c.save()

    # write new chapter beyond created range
    # test that blank space isn't saved
    c = LegacyTextChunk(Ref("Rashi on Exodus 5"), "en", "Rashi on Exodus Test")
    c.text = [["Text for 5:1:1"], ["Text for 5:2:1", "", ""], ["Text for 5:3:1","Text for 5:3:2", "     ", "", " "],["Text for 5:4:1", "", "  "]]
    c.save()

    # write new chapter within created range
    c = LegacyTextChunk(Ref("Rashi on Exodus 4"), "en", "Rashi on Exodus Test")
    c.text = [["Text for 4:1:1", "Text for 4:1:2", "Text for 4:1:3", "Text for 4:1:4"]]
    c.save()

    # write within explicitly created chapter
    c = LegacyTextChunk(Ref("Rashi on Exodus 3:5:1"), "en", "Rashi on Exodus Test")
    c.text = "Text for 3:5:1"
    c.save()
    c = LegacyTextChunk(Ref("Rashi on Exodus 3:3:3"), "en", "Rashi on Exodus Test")
    c.text = "Text for 3:3:3"
    c.save()

    # write within implicitly created chapter
    c = LegacyTextChunk(Ref("Rashi on Exodus 1:5"), "en", "Rashi on Exodus Test")
    c.text = ["Text for 1:5", "Text for 1:5:2"]
    c.save()

    # Rewrite
    c = LegacyTextChunk(Ref("Rashi on Exodus 4:1:2"), "en", "Rashi on Exodus Test")
    c.text = "New Text for 4:1:2"
    c.save()

    # verify
    c = LegacyTextChunk(Ref("Rashi on Exodus"), "en", "Rashi on Exodus Test")
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
    c = LegacyTextChunk(r, "he")
    assert "כוס ראשון" in c.text

    r = Ref('Pesach Haggadah, Kadesh 2')
    c = LegacyTextChunk(r, "he")
    assert "קַדֵּשׁ" in c.text

    r = Ref('Pesach Haggadah, Kadesh 2-4')
    c = LegacyTextChunk(r, "he")
    assert len(c.text) == 3
    assert "קַדֵּשׁ" in c.text[0]

    #Comparing Hebrew is hard.
    #assert u"בְּשַׁבָּת מַתְחִילִין" in c.text[1]
    #assert u"וַיִּשְׁבֹּת" in c.text[2]

    c = LegacyTextChunk(r, "en")
    assert len(c.text) == 3
    assert "kiddush" in c.text[0].lower()
    assert "seventh day" in c.text[2]


def test_complex_with_depth_2():
    pass


def test_strip_imgs():
    text = "text with an image"
    image = "<img src='src.jpg' alt='image caption'>"
    assert AbstractTextRecord.strip_imgs(f"{text}{image}") == text
    assert AbstractTextRecord.strip_imgs(text) == text


def test_strip_itags():
    vs = ["Hadran Test"]
    for vt in vs:
        try:
            Version().load({"versionTitle": vt}).delete()
        except:
            pass

    r = Ref("Genesis 1:1")
    c = LegacyTextChunk(r, "he")
    text = c._get_text_after_modifications([c.strip_itags])
    assert text == LegacyTextChunk(r, "he").text

    r = Ref("Genesis 1")
    c = LegacyTextChunk(r, "he")
    modified_text = c._get_text_after_modifications([c.strip_itags])
    original_text = LegacyTextChunk(r, "he").text
    for mod, ori in zip(modified_text, original_text):
        assert mod == ori

    # create new version, depth 1
    v = Version({
        "language": "en",
        "title": "Hadran",
        "versionSource": "http://foobar.com",
        "versionTitle": "Hadran Test",
        "chapter": ['Cool text <sup class="footnote-marker">1</sup><i class="footnote yo">well, not that cool</i >',  # test </i> malformed with extra space
                    'Silly text <sup class="footnote-marker">1</sup><i class="footnote">See <i>cool text</i></i>',
                    'More text <i data-commentator="Boring comment" data-order="1"></i> and yet more',
                    'Where the <i data-overlay="Other system" data-value=""></i> #$%^&*',
                    'Obscure thing<sup class="endFootnote">1</sup> that nobody cares about except Noah.']
    }).save()
    modified_text = ['Cool text', 'Silly text', 'More text and yet more', 'Where the #$%^&*', 'Obscure thing that nobody cares about except Noah.']
    c = LegacyTextChunk(Ref("Hadran"), "en", "Hadran Test")
    test_modified_text = c._get_text_after_modifications([c.strip_itags, lambda x, _: ' '.join(x.split()).strip()])
    for m, t in zip(modified_text, test_modified_text):
        assert m == t

    test_modified_text = v._get_text_after_modifications([v.strip_itags, lambda x, _: ' '.join(x.split()).strip()])
    for m, t in zip(modified_text, test_modified_text):
        assert t == m

    # test without any modification functions
    test_modified_text = c._get_text_after_modifications([])
    for m, t in zip(c.text, test_modified_text):
        assert m == t

    test_modified_text = v._get_text_after_modifications([])
    for m, t in zip(v.chapter, test_modified_text):
        assert m == t

    text = '<i></i>Lo, his spirit.'
    assert LegacyTextChunk.strip_itags(text) == text

