"""
Tests for the linker bulk corrector backend (sefaria/helper/linker_bulk_corrector.py).

Pure-logic tests only; the persist path (LinkerOutput / MarkedUpTextChunk / Link writes) is
exercised by manual verification to avoid mutating shared data.
"""
import pytest

from sefaria.helper import linker_bulk_corrector as lbc
from sefaria.system.exceptions import InputError


def _citation_span(char_range, **fields):
    return {"type": "citation", "charRange": list(char_range), "text": "Gen. 1:1-3", **fields}


def _item(spans, ref="Genesis 1:1", char_range=(0, 10)):
    return lbc.CitationItem(ref, "Tanach with Ta'amei Hamikra", "he", char_range, spans, ref, lbc._citation_status(spans))


RANGE_SPAN = _citation_span(
    (0, 10),
    inputRefParts=["Gen.", "1:1-3"],
    inputRefPartTypes=["NAMED", "RANGE"],
    inputRangeSections=["1", "1"],
    inputRangeToSections=["3"],
    contextRef="Rashi on Genesis 1:1:1",
)


def test_flattened_ref_parts_expands_ranges():
    assert lbc._flattened_ref_parts(RANGE_SPAN) == [
        {"text": "Gen.", "type": "NAMED"},
        {"text": "1", "type": "NUMBERED"},
        {"text": "1", "type": "NUMBERED"},
        {"text": "-", "type": "RANGE_SYMBOL"},
        {"text": "3", "type": "NUMBERED"},
    ]


def test_parse_payload_requires_ref_parts():
    with pytest.raises(InputError):
        lbc._parse_payload(_item([_citation_span((0, 10))]))
    payload = lbc._parse_payload(_item([RANGE_SPAN]))
    assert payload["contextRef"] == "Rashi on Genesis 1:1:1"
    assert payload["lang"] == "he"


def _parse_result(*parsings):
    # parse_linker_citation reports the RawRef's regrouped parts: a RANGE part with no sections.
    return {
        "input": {"parts": [{"text": "Gen.", "type": "NAMED"}, {"text": "1:1-3", "type": "RANGE"}]},
        "parsings": list(parsings),
    }


@pytest.mark.parametrize("parsings, status", [
    ([], "unparsed"),
    ([{"ref": None, "valid": True}, {"ref": "Genesis 1:1-3", "valid": False}], "unparsed"),
    ([{"ref": "Genesis 1:1-3", "valid": True}], "parsed"),
    ([{"ref": "Genesis 1:1-3", "valid": True}, {"ref": "Exodus 1:1-3", "valid": True}], "ambiguous"),
])
def test_status_from_parse_result(parsings, status):
    assert lbc._status_from_parse_result(_parse_result(*parsings)) == status


def test_reparsed_spans_keep_range_sections_so_they_can_be_reparsed_again():
    item = _item([RANGE_SPAN])
    new_spans = lbc._spans_from_parse_result(item, _parse_result({"ref": "Genesis 1:1-3", "valid": True}))
    assert len(new_spans) == 1
    assert new_spans[0]["ref"] == "Genesis 1:1-3"
    assert not new_spans[0]["failed"] and not new_spans[0]["ambiguous"]
    assert new_spans[0]["inputRangeSections"] == ["1", "1"]
    reparsed_item = _item(new_spans)
    assert lbc._parse_payload(reparsed_item) == lbc._parse_payload(item)


def test_reparsed_spans_one_per_valid_parsing_or_single_failed_span():
    item = _item([RANGE_SPAN])
    ambiguous = lbc._spans_from_parse_result(item, _parse_result(
        {"ref": "Genesis 1:1-3", "valid": True}, {"ref": "Exodus 1:1-3", "valid": True},
    ))
    assert [span["ref"] for span in ambiguous] == ["Genesis 1:1-3", "Exodus 1:1-3"]
    assert all(span["ambiguous"] for span in ambiguous)

    failed = lbc._spans_from_parse_result(item, _parse_result(
        {"ref": "Genesis 5", "valid": False, "disqualificationReason": "no match"},
    ))
    assert len(failed) == 1
    assert failed[0]["failed"]
    assert failed[0]["disqualificationReason"] == "no match"


def test_cursor_key():
    assert lbc._cursor_key(None) is None
    assert lbc._cursor_key({"ref": "Genesis 1:1", "charRange": [3, 8]}) == ("Genesis 1:1", (3, 8))
    assert lbc._cursor_key({"ref": "Genesis 1:1", "charRange": "3-8"}) == ("Genesis 1:1", (3, 8))
    with pytest.raises(InputError):
        lbc._cursor_key({"charRange": [3, 8]})
    with pytest.raises(InputError):
        lbc._cursor_key({"ref": "Genesis 1:1", "charRange": ["a", 8]})


def test_group_citation_spans_groups_by_char_range_and_skips_non_citations():
    key = ("Genesis 1:2", "v", "he")
    spans_by_key = {
        ("Genesis 1:1", "v", "he"): [
            _citation_span((5, 9), ref="Exodus 1:1", ambiguous=True),
            _citation_span((5, 9), ref="Exodus 2:1", ambiguous=True),
            _citation_span((20, 25), deleted=True),
            {"type": "named-entity", "charRange": [0, 3]},
        ],
        key: [_citation_span((0, 4), failed=True)],
    }
    items = lbc._group_citation_spans(spans_by_key)
    assert [(item.ref, item.charRange, item.status, len(item.spans)) for item in items] == [
        ("Genesis 1:1", (5, 9), "ambiguous", 2),
        ("Genesis 1:2", (0, 4), "unparsed", 1),
    ]
    assert lbc._cursor_index(items, ("Genesis 1:2", (0, 4))) == 1
    assert lbc._cursor_index(items, ("Genesis 1:2", (0, 5))) is None


def test_mark_snippet_anchors():
    html = ('<a class="refLink spanFailed" href="" data-ref="" data-range=0-4>a</a> '
            '<a class="refLink spanSucceeded" href="/x" data-ref="X" data-range=10-14>b</a>')
    marked = lbc._mark_snippet_anchors(html, "10-14")
    assert 'class="refLink lbcContextCitation spanFailed"' in marked
    assert 'class="refLink lbcFocusedCitation spanSucceeded"' in marked


@pytest.mark.parametrize("text, expected", [
    ("https://www.sefaria.org/Genesis.1.1?lang=bi", "Genesis.1.1"),
    ("sefaria.org.il/Rashi_on_Genesis.1.1.1/he/Some_Version", "Rashi_on_Genesis.1.1.1"),
    ("Mishnah_Berakhot.1.1%2C3", "Mishnah_Berakhot.1.1,3"),
])
def test_strip_sefaria_url(text, expected):
    assert lbc._strip_sefaria_url(text) == expected
