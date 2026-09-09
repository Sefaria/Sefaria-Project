"""
Tests for sefaria.helper.linker.tasks
"""
from types import SimpleNamespace

import pytest
from ne_span import NEDoc
from sefaria.model.linker.ref_part import RawRef
from sefaria.model.linker.ref_resolver import ResolvedRef
from sefaria.helper.linker.tasks import _get_link_trefs_to_add_and_delete, _extract_resolved_spans


@pytest.mark.parametrize("trefs_found,existing_linked_trefs,all_linked_trefs,expected_add,expected_delete,test_id", [
    # Empty sets
    (set(), set(), set(), set(), set(), "all_empty"),
    
    # Adding new refs
    ({"Genesis 1:1", "Exodus 2:3"}, set(), set(), 
     {"Genesis 1:1", "Exodus 2:3"}, set(), "add_new_refs"),
    
    # No additions when already linked
    ({"Genesis 1:1", "Exodus 2:3"}, set(), {"Genesis 1:1", "Exodus 2:3"}, 
     set(), set(), "already_linked"),
    
    # Partial additions
    ({"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, set(), {"Genesis 1:1"}, 
     {"Exodus 2:3", "Leviticus 3:4"}, set(), "partial_add"),
    
    # Deleting prev refs
    (set(), {"Genesis 1:1", "Exodus 2:3"}, set(), 
     set(), {"Genesis 1:1", "Exodus 2:3"}, "delete_prev_refs"),
    
    # No deletions when prev refs still linked
    (set(), {"Genesis 1:1", "Exodus 2:3"}, {"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, 
     set(), set(), "prev_refs_preserved"),
    
    # Partial deletions
    (set(), {"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, {"Genesis 1:1"}, 
     set(), {"Exodus 2:3", "Leviticus 3:4"}, "partial_delete"),
    
    # Add and delete simultaneously
    ({"Genesis 1:1", "Exodus 2:3"}, {"Leviticus 3:4", "Numbers 4:5"}, set(), 
     {"Genesis 1:1", "Exodus 2:3"}, {"Leviticus 3:4", "Numbers 4:5"}, "add_and_delete"),
    ({"Genesis 1:1"}, {"Exodus 2:3"}, set(), 
     {"Genesis 1:1"}, {"Exodus 2:3"}, "single_ref_swap"),
    
    # Complex scenarios
    ({"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4"}, 
     {"Leviticus 3:4", "Numbers 4:5", "Deuteronomy 5:6"}, 
     {"Leviticus 3:4", "Genesis 1:1"}, 
     {"Exodus 2:3"}, {"Numbers 4:5", "Deuteronomy 5:6"}, "complex_overlapping"),
    
    ({"Genesis 1:1", "Exodus 2:3"}, {"Leviticus 3:4", "Numbers 4:5"}, 
     {"Genesis 1:1", "Exodus 2:3", "Leviticus 3:4", "Numbers 4:5"}, 
     set(), set(), "all_preserved"),
    
    ({"Genesis 1:1", "Exodus 2:3"}, {"Genesis 1:1", "Leviticus 3:4"}, {"Genesis 1:1"}, 
     {"Exodus 2:3"}, {"Leviticus 3:4"}, "same_ref_in_both"),
])
def test_link_trefs_operations(trefs_found, existing_linked_trefs, all_linked_trefs, 
                               expected_add, expected_delete, test_id):
    """Test various scenarios for adding and deleting link trefs"""
    to_add, to_delete = _get_link_trefs_to_add_and_delete(trefs_found, existing_linked_trefs, all_linked_trefs)
    
    assert to_add == expected_add, f"Failed for test: {test_id}"
    assert to_delete == expected_delete, f"Failed for test: {test_id}"


def _make_resolved_ref(doc_text, span_text, tref):
    doc = NEDoc(doc_text)
    start = doc_text.index(span_text)
    end = start + len(span_text)
    raw_ref = RawRef(doc.subspan(slice(start, end)), 'he', [])
    # _extract_resolved_spans only ever calls .normal() on `ref`, so a stand-in avoids needing a real Ref/DB
    fake_ref = SimpleNamespace(normal=lambda: tref)
    return ResolvedRef(raw_ref, [], fake_ref)


@pytest.mark.parametrize(('doc_text', 'span_text', 'tref'), [
    # Rashba on Berakhot 17b:1: "אסקה רב אשי בגמרא (לקמן ברכות יח, א) דמוטל...". Confirmed against the real
    # LinkerOutput debug span (GET /api/v3/texts/Rashba_on_Berakhot.17b.1?debug_mode=linker) that the raw
    # entity span is 'בגמרא (לקמן ברכות יח, א' -- the trailing ")" is just outside the matched span.
    ['אסקה רב אשי בגמרא (לקמן ברכות יח, א) דמוטל עליו לקוברו', 'בגמרא (לקמן ברכות יח, א', 'Berakhot 18a'],
])
def test_extract_resolved_spans_end_paren(doc_text, span_text, tref):
    """
    `_extract_resolved_spans` builds the citation spans that end up on the live MarkedUpTextChunk (i.e. the
    text that actually gets highlighted/linked for readers), and it reads straight off
    `resolved_ref.raw_entity.char_indices`/`.text` rather than `resolved_ref.pretty_text`. `pretty_text`
    already knows how to extend the span to include a trailing ")" just outside the raw entity (see
    test_pretty_text_end_paren in sefaria/model/linker/tests/linker_test.py) -- this function just never
    consults it, so the closing paren silently gets dropped from what's actually shown to readers.
    """
    resolved_ref = _make_resolved_ref(doc_text, span_text, tref)
    spans = _extract_resolved_spans([resolved_ref])

    assert len(spans) == 1
    assert spans[0]['text'] == resolved_ref.pretty_text
    start, end = spans[0]['charRange']
    assert doc_text[start:end] == resolved_ref.pretty_text
