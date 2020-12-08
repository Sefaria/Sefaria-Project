# encoding=utf-8
import pytest
from sefaria.model import *
from sefaria.helper.text import modify_text_by_function
from sefaria.datatype.jagged_array import JaggedTextArray


@pytest.mark.deep
def test_modify_text_by_function():

    original = TextChunk(Ref("Job"), vtitle="The Holy Scriptures: A New Translation (JPS 1917)")
    total_spaces = JaggedTextArray(original.text).flatten_to_string(joiner="|").count(" ")

    v = Version({
        "language": "en",
        "title": "Job",
        "versionSource": "http://foobar.com",
        "versionTitle": "TextChangeTest",
        "chapter": original.text
    }).save()

    modify_text_by_function("Job", "TextChangeTest", "en", lambda x, sections: x.replace(" ", "$"), 23432)
    modified = TextChunk(Ref("Job"), vtitle="TextChangeTest")
    total_dollars = JaggedTextArray(modified.text).flatten_to_string(joiner="|").count("$")
    v.delete()
    assert total_dollars > 0
    assert total_spaces == total_dollars
