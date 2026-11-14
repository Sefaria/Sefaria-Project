"""Tests for the /interface/<language> redirect view.

The language switcher always sends `next` as a site-relative path. Any other
value must fall back to "/": a slash-less string reaches
django.shortcuts.redirect, which treats it as a view name and raises
NoReverseMatch (HTTP 500). See reader.views.interface_language_redirect.
"""

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from reader.views import interface_language_redirect

PRODUCTION_CONFIG = {
    "en": {"library": "https://www.sefaria.org", "voices": "https://voices.sefaria.org"},
    "he": {"library": "https://www.sefaria.org.il", "voices": "https://chiburim.sefaria.org.il"},
}


@pytest.fixture
def production_settings(settings):
    # Production sets ALLOWED_HOSTS = ["*"] (helm-chart local-settings-file), so the
    # allowlist guard cannot filter relative junk; mirror that here.
    settings.DOMAIN_MODULES = PRODUCTION_CONFIG
    settings.ALLOWED_HOSTS = ["*"]
    return settings


def _request(language, host, **params):
    request = RequestFactory().get(f"/interface/{language}", params, HTTP_HOST=host)
    request.user = AnonymousUser()
    return request


@pytest.mark.parametrize(
    "junk",
    [
        "上架app store",
        "foo",
        "foo/bar",
        "javascript:alert(1)",
        "//evil.example.com/x",
        "https://evil.example.com/x",
    ],
)
def test_invalid_next_falls_back_to_root(production_settings, junk):
    response = interface_language_redirect(_request("hebrew", "www.sefaria.org.il", next=junk), "hebrew")

    assert response.status_code == 302
    assert response["Location"] == "/"


def test_relative_path_next_is_preserved(production_settings):
    response = interface_language_redirect(_request("hebrew", "www.sefaria.org.il", next="/Genesis.1"), "hebrew")

    assert response.status_code == 302
    assert response["Location"] == "/Genesis.1"


def test_domain_switch_preserves_path_on_target_domain(production_settings):
    response = interface_language_redirect(_request("hebrew", "www.sefaria.org", next="/Genesis.1"), "hebrew")

    assert response.status_code == 302
    assert response["Location"].startswith("https://www.sefaria.org.il/Genesis.1")
    assert "set-language-cookie" in response["Location"]
