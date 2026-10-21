"""
Tests for sefaria/sheet_markup_scan.py: detection of stored sheet fields that
still hold markup. Pure dict-in, paths-out checks; no database needed.
"""
from sefaria.sheet_markup_scan import find_markup_fields, scan_sheets

HOSTILE = '<img src=x onerror="alert(1)">'


def _sheet(**overrides):
    sheet = {
        "id": 1,
        "owner": 2,
        "options": {"numbered": 0},
        "sources": [{"ref": "Genesis 1:1", "text": {"en": "plain", "he": "plain"}}],
    }
    sheet.update(overrides)
    return sheet


def test_clean_sheet_has_no_markup_fields():
    assert find_markup_fields(_sheet()) == []


def test_attribution_with_markup_is_reported():
    assert find_markup_fields(_sheet(attribution=HOSTILE)) == ["attribution"]


def test_source_custom_title_with_markup_is_reported():
    sheet = _sheet(sources=[{"ref": "Genesis 1:1", "customTitle": HOSTILE, "text": {"en": "a", "he": "b"}}])
    assert find_markup_fields(sheet) == ["sources[0].customTitle"]


def test_source_title_as_stored_by_the_editor_is_reported():
    sheet = _sheet(sources=[{"ref": "Genesis 1:1", "title": HOSTILE, "text": {"en": "a", "he": "b"}}])
    assert find_markup_fields(sheet) == ["sources[0].title"]


def test_caption_languages_are_reported_separately():
    sheet = _sheet(sources=[{"outsideText": "x", "caption": {"en": "ok", "he": HOSTILE}}])
    assert find_markup_fields(sheet) == ["sources[0].caption.he"]


def test_markup_nested_inside_options_list_is_reported():
    sheet = _sheet(sources=[{"outsideText": "x", "options": {"tags": [HOSTILE]}}])
    assert find_markup_fields(sheet) == ["sources[0].options.tags[0]"]


def test_ref_less_text_fields_are_reported():
    sheet = _sheet(sources=[
        {"outsideText": HOSTILE},
        {"outsideBiText": {"en": "e", "he": HOSTILE}},
        {"comment": "<script>x</script>"},
    ])
    assert find_markup_fields(sheet) == [
        "sources[0].outsideText",
        "sources[1].outsideBiText.he",
        "sources[2].comment",
    ]


def test_ref_text_is_out_of_scope_because_save_already_bleaches_it():
    sheet = _sheet(sources=[{"ref": "Genesis 1:1", "text": {"en": HOSTILE, "he": "b"}}])
    assert find_markup_fields(sheet) == []


def test_plain_angle_brackets_without_a_tag_start_are_not_markup():
    sheet = _sheet(attribution="1 < 2 and 3 > 2", sources=[{"outsideText": "a & b"}])
    assert find_markup_fields(sheet) == []


def test_scan_sheets_yields_only_flagged_sheets_with_owner():
    clean = _sheet(id=1)
    flagged = _sheet(id=2, owner=7, attribution=HOSTILE)
    assert list(scan_sheets([clean, flagged])) == [(2, 7, ["attribution"])]
