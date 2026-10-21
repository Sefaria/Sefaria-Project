"""Save-path sanitization of sheet sources: every rendered text field and media URL is cleaned."""
import copy

import pytest

from sefaria.sheets import bleach_text, clean_source, clean_sources, clean_sheet_attribution

SCRIPT = "<script>alert(1)</script>"
IMG_ONERROR = "<img src=x onerror=alert(1)>"


def test_custom_title_is_bleached():
    source = clean_source({"ref": "Genesis 1:1", "node": 1, "customTitle": IMG_ONERROR + "Title" + SCRIPT})
    assert "<" not in source["customTitle"]
    assert "onerror" not in source["customTitle"]
    assert "Title" in source["customTitle"]


@pytest.mark.parametrize("field", ["outsideText", "comment"])
def test_text_fields_are_bleached(field):
    source = clean_source({field: "<svg onload=alert(1)>hi</svg>" + SCRIPT, "node": 1})
    assert "onload" not in source[field]
    assert "<" not in source[field]
    assert "hi" in source[field]


def test_ref_less_text_is_bleached():
    source = clean_source({"text": {"en": SCRIPT, "he": "<b>x</b>"}, "node": 1})
    assert "<script" not in source["text"]["en"]
    assert source["text"]["he"] == "<b>x</b>"


def test_outside_bitext_is_bleached():
    source = clean_source({"outsideBiText": {"en": SCRIPT, "he": IMG_ONERROR}, "node": 1})
    assert "<" not in source["outsideBiText"]["en"]
    assert "onerror" not in source["outsideBiText"]["he"]


def test_caption_is_bleached():
    source = clean_source({
        "media": "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "caption": {"en": IMG_ONERROR + "cap", "he": SCRIPT},
        "node": 1,
    })
    assert "onerror" not in source["caption"]["en"]
    assert "<script" not in source["caption"]["he"]
    assert "cap" in source["caption"]["en"]


def test_option_values_are_validated_and_unknown_keys_dropped():
    source = clean_source({
        "ref": "Genesis 1:1",
        "node": 1,
        "options": {
            "indented": '"><script>alert(1)</script>',
            "refDisplayPosition": "above",
            "sourcePrefix": IMG_ONERROR + "1",
            "onclick": "alert(1)",
        },
    })
    options = source["options"]
    assert "indented" not in options
    assert options["refDisplayPosition"] == "above"
    assert "onerror" not in options["sourcePrefix"]
    assert "onclick" not in options


def test_option_text_drops_quote_characters():
    source = clean_source({"comment": "hi", "node": 1, "options": {"PrependRefWithEn": "a'b\"c"}})
    assert source["options"]["PrependRefWithEn"] == "abc"


def test_known_option_tokens_are_kept():
    options = {
        "indented": "indented-2",
        "sourceLayout": "stacked",
        "sourceLanguage": "",
        "sourceLangLayout": "heLeft",
        "numbered": 1,
    }
    source = clean_source({"comment": "hi", "node": 1, "options": dict(options)})
    assert source["options"] == options


@pytest.mark.parametrize("media", [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://evil.example/x.html",
    'https://www.youtube.com/embed/abc" onload="alert(1)',
    "https://www.youtube.com.evil.example/embed/abc",
    "https://user@www.youtube.com/embed/abc",
    "https://www.youtube.com/watch?v=abc",
    "https://storage.googleapis.com/bucket/page.html",
])
def test_media_url_outside_allowlist_is_removed(media):
    source = clean_source({"media": media, "caption": {"en": "cap"}, "node": 1})
    assert "media" not in source
    assert "caption" not in source


@pytest.mark.parametrize("media, expected", [
    ("http://www.youtube.com/embed/abc", "https://www.youtube.com/embed/abc"),
    ("//www.youtube.com/embed/abc", "https://www.youtube.com/embed/abc"),
])
def test_media_scheme_is_upgraded_to_https(media, expected):
    source = clean_source({"media": media, "node": 1})
    assert source["media"] == expected


@pytest.mark.parametrize("media", [
    "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&amp;showinfo=0",
    "https://player.vimeo.com/video/123",
    "https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/1",
    "https://open.spotify.com/embed/episode/abc",
    "https://bandcamp.com/EmbeddedPlayer/album=1/size=large",
    "https://storage.googleapis.com/sefaria-ugc-sheet/abc.png",
    "https://example.org/photo.JPG",
    "https://example.org/audio/track.mp3",
])
def test_allowlisted_media_url_is_kept(media):
    source = clean_source({"media": media, "node": 1})
    assert source["media"] == media


def test_clean_sources_keeps_unrenderable_sources_and_drops_non_dicts():
    cleaned = clean_sources([
        {"text": {"en": SCRIPT}, "node": 1},
        "not-a-source",
        {"comment": "hi", "node": 2},
    ])
    assert len(cleaned) == 2
    assert "<script" not in cleaned[0]["text"]["en"]
    assert cleaned[1]["comment"] == "hi"


def test_legit_source_round_trips_unchanged():
    original = {
        "ref": "Genesis 1:1",
        "node": 1,
        "customTitle": "Title",
        "text": {"he": "<b>בראשית</b>", "en": "<i>In the beginning</i>"},
        "options": {"indented": "indented-1", "sourcePrefix": "a", "refDisplayPosition": "above"},
    }
    assert clean_source(copy.deepcopy(original)) == original


def test_sheet_attribution_is_bleached():
    sheet = {"attribution": '<a href="https://www.sefaria.org">Ann</a>' + IMG_ONERROR + SCRIPT}
    cleaned = clean_sheet_attribution(sheet)["attribution"]
    assert "onerror" not in cleaned
    assert "<script" not in cleaned
    assert "Ann" in cleaned


def test_sheet_without_string_attribution_is_left_alone():
    assert clean_sheet_attribution({"attribution": None}) == {"attribution": None}
    assert clean_sheet_attribution({"title": "x"}) == {"title": "x"}
