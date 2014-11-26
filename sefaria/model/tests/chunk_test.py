from sefaria.model import *


def test_verse_chunk():
    v = TextChunk(Ref("Daniel 2:3"), "en", "The Holy Scriptures: A New Translation (JPS 1917)")
    assert isinstance(v.text, basestring)


def test_chapter_chunk():
    v = TextChunk(Ref("Daniel 2"), "en", "The Holy Scriptures: A New Translation (JPS 1917)")
    assert isinstance(v.text, list)

def test_heb_verse_chunk():
    v = TextChunk(Ref("Daniel 2:3"), "he", "Tanach with Nikkud")
    assert isinstance(v.he, basestring)

def test_heb_chapter_chunk():
    v = TextChunk(Ref("Daniel 2"), "he", "Tanach with Nikkud")
    assert isinstance(v.he, list)

#this is supposed to get a version with exactly 1 en and 1 he.  The data may change.
def test_no_version_specified():
    v = TextChunk(Ref("Midrash Tanchuma.1.2"))
    assert isinstance(v.text, list)
    assert isinstance(v.he, list)

