"""Sheet pages print user-written fields as escaped text or as bleached HTML, and embed sheet JSON safely."""

import re
from unittest import mock

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from sefaria.sheets import clean_sheet_for_render
from sourcesheets import views

IMG_ONERROR = "<img src=x onerror=alert(1)>"
SCRIPT_BREAKOUT = "</script><img src=x onerror=alert(1)>"


def _hostile_sheet():
    return {
        "id": 1,
        "owner": 0,
        "title": SCRIPT_BREAKOUT,
        "status": "public",
        "attribution": IMG_ONERROR + "Credit",
        "sources": [
            {
                "ref": "Genesis 1:1",
                "node": 1,
                "customTitle": IMG_ONERROR + "Custom",
                "text": {"en": "<b>kept</b><script>alert(2)</script>", "he": ""},
                "options": {"sourceLayout": "stacked"},
            },
            {"comment": "<i>note</i>" + IMG_ONERROR, "node": 2},
        ],
    }


def _request(path):
    """A request carrying everything reader.views.base_props() and the template context processors read."""
    request = RequestFactory().get(path)
    request.user = AnonymousUser()
    request.session = {}
    request.LANGUAGE_CODE = "en"
    request.interfaceLang = "english"
    request.contentLang = "english"
    request.active_module = "voices"
    request.country_code = "us"
    request.diaspora = True
    request.user_agent = mock.MagicMock(is_mobile=False)
    request.translation_language_preference = None
    request.translation_language_preference_suggestion = None
    request.version_preferences_by_corpus = {}
    return request


@pytest.fixture
def hostile_sheet(monkeypatch):
    monkeypatch.setattr(views, "get_sheet", lambda sheet_id: _hostile_sheet())
    monkeypatch.setattr(views, "db", mock.MagicMock())
    monkeypatch.setattr(views, "get_redirect_to_help_center", lambda request, sheet_id: None)
    return _hostile_sheet


SCRIPT_BLOCK = re.compile(r"<script\b.*?</script>", re.IGNORECASE | re.DOTALL)
EVENT_HANDLER_ATTR = re.compile(r"<[^>]*\bon\w+\s*=", re.IGNORECASE)


def _assert_no_executable_injection(html):
    """
    The sheet JSON blob is escaped inside a script block, so the payload text legitimately appears there.
    Remove every script block and check what is left: any injected tag, event-handler attribute or
    script-breakout would sit outside the blocks (a premature </script> ends the block early).
    """
    markup = SCRIPT_BLOCK.sub("", html)
    assert "<img src=x" not in markup
    assert not EVENT_HANDLER_ATTR.search(markup)
    assert "alert(" not in markup
    assert "</script><img" not in html
    # No script block may contain a second closing tag (a breakout would end it early).
    for block in SCRIPT_BLOCK.findall(html):
        assert block.lower().count("</script") == 1


@pytest.mark.django_db
def test_visual_sheet_page_escapes_hostile_fields(hostile_sheet):
    response = views.view_visual_sheet(_request("/sheets/visual/1"), "1")
    html = response.content.decode("utf8")
    _assert_no_executable_injection(html)
    # Bleached rich text and plain text still render.
    assert "<b>kept</b>" in html
    assert "note" in html
    assert "Credit" in html


@pytest.mark.django_db
def test_embedded_sheet_page_escapes_hostile_fields(hostile_sheet):
    response = views.view_sheet(_request("/sheets/1?embed=1"), "1")
    html = response.content.decode("utf8")
    _assert_no_executable_injection(html)
    assert "<b>kept</b>" in html
    assert "Credit" in html


def test_render_cleaner_bleaches_text_fields_and_keeps_media():
    sheet = _hostile_sheet()
    sheet["sources"].append({"media": "http://example.com/clip.mp4", "node": 3})
    clean_sheet_for_render(sheet)
    assert "onerror" not in sheet["attribution"]
    assert "onerror" not in sheet["sources"][0]["customTitle"]
    assert "<script" not in sheet["sources"][0]["text"]["en"]
    assert "onerror" not in sheet["sources"][1]["comment"]
    # Media is left for the editor to handle; render-time cleaning only bleaches text.
    assert sheet["sources"][2]["media"] == "http://example.com/clip.mp4"


@pytest.mark.django_db
def test_ref_link_fallback_escapes_unparseable_ref():
    from reader.templatetags.sefaria_tags import he_ref_link, ref_link

    assert "<img" not in ref_link(IMG_ONERROR)
    assert "<img" not in he_ref_link(IMG_ONERROR)
