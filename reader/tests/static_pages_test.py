"""
Tests for serve_static view — voices→library redirect for about-sidebar pages.
"""
import pytest
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import RequestFactory
from django.conf import settings
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
import reader.views as reader_views


@pytest.fixture
def factory():
    return RequestFactory()


def _make_request(factory, path, active_module, params=None):
    request = factory.get(path, params or {})
    request.active_module = active_module
    request.interfaceLang = "english"
    request.LANGUAGE_CODE = "en"
    request.user = AnonymousUser()
    return request


def test_voices_sidebar_page_redirects_to_library(factory):
    library_domain = settings.DOMAIN_MODULES.get("en", {}).get(LIBRARY_MODULE, "")
    request = _make_request(factory, "/about", VOICES_MODULE)
    response = reader_views.serve_static(request, "about", by_lang=True)
    assert response.status_code == 301
    assert library_domain in response["Location"]
    assert "/about" in response["Location"]


def test_voices_sidebar_page_preserves_query_params(factory):
    library_domain = settings.DOMAIN_MODULES.get("en", {}).get(LIBRARY_MODULE, "")
    request = _make_request(factory, "/terms", VOICES_MODULE, {"foo": "bar"})
    response = reader_views.serve_static(request, "terms")
    assert response.status_code == 301
    assert library_domain in response["Location"]
    assert "foo=bar" in response["Location"]


def test_library_sidebar_page_no_redirect(factory, monkeypatch):
    monkeypatch.setattr(reader_views, "render_template", lambda *a, **kw: HttpResponse())
    request = _make_request(factory, "/about", LIBRARY_MODULE)
    response = reader_views.serve_static(request, "about", by_lang=True)
    assert response.status_code not in (301, 302)
