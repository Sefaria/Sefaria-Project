from unittest.mock import Mock

from sefaria.helper.linker import linker


def _complex_book_level_oref() -> Mock:
    """A ref to an internal node of a complex text (for example "Sifra, Shemini").

    Its index_node is a SchemaNode (not a JaggedArrayNode or DictionaryEntryNode) and it has no
    default child, so TextChunk raises ComplexBookLevelRefError for it.
    """
    oref = Mock()
    oref.index_node = Mock()
    oref.has_default_child.return_value = False
    return oref


def test_get_ref_text_by_lang_for_linker_returns_empty_for_ref_without_text():
    # TextChunk raises ComplexBookLevelRefError for this ref. The text lookup must return no
    # preview text instead of letting the exception abort the whole find-refs response.
    options = linker._FindRefsTextOptions(True, False, 10, {})
    oref = _complex_book_level_oref()

    text_array, was_truncated = linker._get_ref_text_by_lang_for_linker(oref, "he", options)

    assert text_array == []
    assert was_truncated is False
    oref.text.assert_not_called()


def test_ref_has_text_false_for_schema_node_without_default_child():
    assert linker._ref_has_text(_complex_book_level_oref()) is False


def test_ref_has_text_true_for_textual_node():
    oref = Mock()
    oref.index_node = Mock(spec=linker.text.JaggedArrayNode)
    oref.has_default_child.return_value = False
    assert linker._ref_has_text(oref) is True
