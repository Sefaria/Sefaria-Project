from sefaria.model import *
from sefaria.utils.util import list_depth

def _validate_contents(chunk):
    c = chunk.contents()
    for key in ["text", "ref", "next", "prev"]:  # todo: etc.
        assert key in c

def test_verse_chunk():
    v = TextChunk(Ref("Daniel 2:3"), "en", "The Holy Scriptures: A New Translation (JPS 1917)")
    assert isinstance(v.text, basestring)
    _validate_contents(v)

    v = TextChunk(Ref("Daniel 2:3"), "he", "Tanach with Nikkud")
    assert isinstance(v.he, basestring)
    _validate_contents(v)

def test_chapter_chunk():
    v = TextChunk(Ref("Daniel 2"), "en", "The Holy Scriptures: A New Translation (JPS 1917)")
    assert isinstance(v.text, list)
    _validate_contents(v)

    v = TextChunk(Ref("Daniel 2"), "he", "Tanach with Nikkud")
    assert isinstance(v.he, list)
    _validate_contents(v)

def test_range_chunk():
    v = TextChunk(Ref("Daniel 2:3-5"), "en", "The Holy Scriptures: A New Translation (JPS 1917)")
    assert isinstance(v.text, list)
    assert len(v.text) == 3
    _validate_contents(v)

    v = TextChunk(Ref("Daniel 2:3-5"), "he", "Tanach with Nikkud")
    assert isinstance(v.he, list)
    assert len(v.he) == 3
    _validate_contents(v)

def test_spanning_chunk():
    v = TextChunk(Ref("Daniel 2:3-4:5"), "en", "The Holy Scriptures: A New Translation (JPS 1917)")
    assert isinstance(v.text, list)
    assert isinstance(v.text[0], list)
    assert len(v.text) == 3
    assert len(v.text[2]) == 5
    _validate_contents(v)

    v = TextChunk(Ref("Daniel 2:3-4:5"), "he", "Tanach with Nikkud")
    assert isinstance(v.he, list)
    assert isinstance(v.he[0], list)
    assert len(v.he) == 3
    assert len(v.he[2]) == 5
    _validate_contents(v)

#this is supposed to get a version with exactly 1 en and 1 he.  The data may change.
def test_no_version_specified():
    v = TextChunk(Ref("Midrash Tanchuma.1.2"))
    assert isinstance(v.text, list)
    assert isinstance(v.he, list)
    _validate_contents(v)

def test_merge():
    v = TextChunk(Ref("Mishnah_Yoma.1"))
    _validate_contents(v)
    c = v.contents()
    assert "sources" in c



