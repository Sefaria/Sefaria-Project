"""
Regression tests for the numeric query parameters of text_panels (aliyot, notes).

A non-numeric value for any of these optional display parameters used to reach a
bare int() call and raise ValueError, turning a text page into HTTP 500. See
https://www.sefaria.org/Genesis.25.19-28.9?lang=bi&aliyot=1) (2026-11-13).
"""

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

import reader.views as reader_views
from sefaria.constants.model import LIBRARY_MODULE


class _DummyIndex:
    enDesc = ""
    heDesc = ""


class _DummyRef:
    book = "Genesis"
    sections = [1]
    index = _DummyIndex()

    def normal(self):
        return "Genesis 1:1"

    def he_normal(self):
        return "Genesis 1:1"

    def is_book_level(self):
        return True

    def is_segment_level(self):
        return False


@pytest.fixture
def request_factory():
    return RequestFactory()


def _make_request(factory, params):
    request = factory.get("/Genesis.1.1", params)
    request.active_module = LIBRARY_MODULE
    request.interfaceLang = "english"
    request.contentLang = "english"
    request.translation_language_preference = "english"
    request.LANGUAGE_CODE = "en"
    request.user = AnonymousUser()
    request.user_agent = type("UserAgent", (), {"is_mobile": False})()
    return request


@pytest.fixture
def captured_kwargs(monkeypatch):
    """Patch text_panels' heavy dependencies and capture the kwargs it builds."""
    captured = []

    def fake_make_panel_dicts(oref, primaryVersion, translationVersion, filter, versionFilter, multi_panel, **kwargs):
        captured.append(kwargs)
        return []

    monkeypatch.setattr(reader_views, "Ref", lambda ref: _DummyRef())
    monkeypatch.setattr(
        reader_views, "_extract_version_params", lambda request, key: {"languageFamilyName": "", "versionTitle": ""}
    )
    monkeypatch.setattr(
        reader_views,
        "override_version_with_preference",
        lambda oref, request, versionEn, versionHe: (versionEn, versionHe),
    )
    monkeypatch.setattr(reader_views, "make_panel_dicts", fake_make_panel_dicts)
    monkeypatch.setattr(reader_views, "get_page_title", lambda *a, **k: "Genesis 1")
    monkeypatch.setattr(reader_views, "ld_cat_crumbs", lambda *a, **k: [])
    monkeypatch.setattr(reader_views, "canonical_url", lambda request: "")
    monkeypatch.setattr(reader_views, "render_template", lambda *a, **k: None)
    return captured


@pytest.mark.parametrize(
    "params,expected_override",
    [
        ({"aliyot": "1)"}, "aliyotOff"),
        ({"aliyot": "1"}, "aliyotOn"),
        ({"aliyot": "2"}, "aliyotOff"),
        ({"aliyot": "abc"}, "aliyotOff"),
        ({"p2": "true", "aliyot2": "1)"}, "aliyotOff"),
        ({"p2": "true", "aliyot2": "1"}, "aliyotOn"),
    ],
)
def test_text_panels_accepts_malformed_aliyot(request_factory, captured_kwargs, params, expected_override):
    """A text page with a non-numeric aliyot value must render, not raise ValueError."""
    request = _make_request(request_factory, params)
    reader_views.text_panels(request, "Genesis.1.1")
    assert captured_kwargs
    assert captured_kwargs[-1]["aliyotOverride"] == expected_override


@pytest.mark.parametrize(
    "params,expected_notes",
    [
        ({"notes": "x"}, 0),
        ({"notes": ""}, 0),
        ({"notes": "1"}, 1),
        ({"p2": "true", "notes2": "x"}, 0),
        ({"p2": "true", "notes2": "2"}, 2),
    ],
)
def test_text_panels_accepts_malformed_notes(request_factory, captured_kwargs, params, expected_notes):
    """A text page with a non-numeric notes value must render, not raise ValueError."""
    request = _make_request(request_factory, params)
    reader_views.text_panels(request, "Genesis.1.1")
    assert captured_kwargs
    assert captured_kwargs[-1]["extended notes"] == expected_notes


def test_text_panels_omits_aliyot_override_when_absent(request_factory, captured_kwargs):
    request = _make_request(request_factory, {})
    reader_views.text_panels(request, "Genesis.1.1")
    assert captured_kwargs
    assert "aliyotOverride" not in captured_kwargs[0]
