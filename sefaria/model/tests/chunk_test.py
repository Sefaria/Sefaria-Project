from sefaria.model import *
from sefaria.utils.util import list_depth


def test_verse_chunk():
    chunks = [
        TextChunk(Ref("Daniel 2:3"), "en", "The Holy Scriptures: A New Translation (JPS 1917)"),
        TextChunk(Ref("Daniel 2:3"), "he", "Tanach with Nikkud"),
        TextChunk(Ref("Daniel 2:3"), "en"),
        TextChunk(Ref("Daniel 2:3"), "he")
    ]
    for c in chunks:
        assert isinstance(c.text, basestring)
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
        TextFamily(Ref("Midrash Tanchuma.1.2")),  # this is supposed to get a version with exactly 1 en and 1 he.  The data may change.
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


def test_chapter_result_merge():
    v = TextFamily(Ref("Mishnah_Yoma.1"))

    assert isinstance(v.text, list)
    assert isinstance(v.he, list)
    c = v.contents()
    for key in ["text", "ref", "he", "book", "sources", "commentary"]:  # todo: etc.
        assert key in c



