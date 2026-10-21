"""Sheet pages print user-written fields as escaped text or as bleached HTML, and embed sheet JSON safely."""
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
    request = RequestFactory().get(path)
    request.user = AnonymousUser()
    request.interfaceLang = "english"
    return request


@pytest.fixture
def hostile_sheet(monkeypatch):
    monkeypatch.setattr(views, "get_sheet", lambda sheet_id: _hostile_sheet())
    monkeypatch.setattr(views, "db", mock.MagicMock())
    monkeypatch.setattr(views, "get_redirect_to_help_center", lambda request, sheet_id: None)
    return _hostile_sheet


def _assert_no_raw_injection(html):
    assert "onerror=alert(1)" not in html
    assert "<script>alert(2)" not in html
    assert "</script><img" not in html


@pytest.mark.django_db
def test_visual_sheet_page_escapes_hostile_fields(hostile_sheet):
    response = views.view_visual_sheet(_request("/sheets/1/visual"), "1")
    html = response.content.decode("utf8")
    _assert_no_raw_injection(html)
    # Bleached rich text and plain text still render.
    assert "<b>kept</b>" in html
    assert "note" in html
    assert "Credit" in html


@pytest.mark.django_db
def test_embedded_sheet_page_escapes_hostile_fields(hostile_sheet):
    response = views.view_sheet(_request("/sheets/1?embed=1"), "1")
    html = response.content.decode("utf8")
    _assert_no_raw_injection(html)
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
    from reader.templatetags.sefaria_tags import ref_link, he_ref_link

    assert "<img" not in ref_link(IMG_ONERROR)
    assert "<img" not in he_ref_link(IMG_ONERROR)
