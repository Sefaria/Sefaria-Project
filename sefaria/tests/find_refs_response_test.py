from unittest.mock import Mock

from sefaria.helper.linker import linker
from sefaria.system.exceptions import ComplexBookLevelRefError


def _text_options(**overrides) -> linker._FindRefsTextOptions:
    options = {"with_text": True, "debug": False, "max_segments": 0, "version_preferences_by_corpus": {}}
    options.update(overrides)
    return linker._FindRefsTextOptions(**options)


def _mock_oref() -> Mock:
    oref = Mock()
    oref.he_normal.return_value = "heRef"
    oref.url.return_value = "/Derekh_Hashem,_Part_Four"
    oref.primary_category = "Jewish Thought"
    oref.index.get_primary_corpus.return_value = "Jewish Thought"
    return oref


def test_make_ref_response_for_linker_omits_text_when_ref_has_no_text():
    # A complex book-level ref (e.g. "Derekh Hashem, Part Four") has no text of its own,
    # so TextChunk refuses to build it. The response builder must return the resolved ref
    # without text rather than raising and failing the whole find-refs request.
    oref = _mock_oref()
    oref.text.side_effect = ComplexBookLevelRefError(book_ref="Derekh Hashem, Part Four")

    response = linker._make_ref_response_for_linker(oref, _text_options())

    assert response == {
        "heRef": "heRef",
        "url": "/Derekh_Hashem,_Part_Four",
        "primaryCategory": "Jewish Thought",
    }


def test_make_ref_response_for_linker_includes_text_when_ref_has_text():
    oref = _mock_oref()
    chunk = Mock()
    chunk.ja.return_value = Mock(flatten_to_array=lambda: ["first", "second"])
    chunk.strip_itags.side_effect = lambda s: s
    oref.text.return_value = chunk

    response = linker._make_ref_response_for_linker(oref, _text_options())

    assert response["he"] == ["first", "second"]
    assert response["en"] == ["first", "second"]
    assert response["isTruncated"] is False
