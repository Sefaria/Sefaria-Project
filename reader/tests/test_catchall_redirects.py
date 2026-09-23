"""
Tests for catchall view redirects between modules (library and voices).

Tests that reference links accessed from the wrong module (e.g., voices)
are properly redirected to the library module.
"""
from urllib.parse import urlparse, parse_qs
import pytest
from django.test import override_settings
from sefaria.system.exceptions import InputError
from sefaria.constants.model import VOICES_MODULE


TEST_DOMAIN_MODULES = {
    "en": {
        "library": "https://www.modularization.testing.sefaria.org",
        "voices": "https://voices.modularization.testing.sefaria.org",
    },
    "he": {
        "library": "https://www.modularization.testing.sefaria.org",
        "voices": "https://voices.modularization.testing.sefaria.org",
    },
}

TEST_ALLOWED_HOSTS = [
    "www.modularization.testing.sefaria.org",
    "voices.modularization.testing.sefaria.org",
]


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_voices_catchall_ref_redirects_to_library(client, monkeypatch):
    """
    Test that accessing a valid ref from voices domain redirects to library domain.
    """
    HTTP_HOST = "voices.modularization.testing.sefaria.org"
    
    class DummyRef:
        def url(self, _=False):
            return "Genesis.1.1"

    monkeypatch.setattr(
        "sefaria.model.Ref.instantiate_ref_with_legacy_parse_fallback",
        lambda tref: DummyRef(),
    )

    response = client.get(
        "/Genesis.1.1",
        {"foo": "bar"},
        HTTP_HOST=HTTP_HOST,
    )

    assert response.status_code == 301
    assert HTTP_HOST not in response["Location"]
    assert "www.modularization.testing.sefaria.org" in response["Location"]
    assert "Genesis.1.1" in response["Location"]
    assert "foo=bar" in response["Location"]


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_voices_catchall_non_ref_404(client, monkeypatch):
    """
    Test that accessing an invalid ref from voices domain returns 404 (doesn't redirect).
    """
    def raise_input_error(tref):
        raise InputError("bad ref")
    
    monkeypatch.setattr(
        "sefaria.model.Ref.instantiate_ref_with_legacy_parse_fallback",
        raise_input_error,
    )

    response = client.get(
        "/not-a-real-ref",
        HTTP_HOST="voices.modularization.testing.sefaria.org",
    )

    assert response.status_code == 404


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_library_catchall_valid_ref_no_redirect(client, monkeypatch):
    """
    Test that accessing a valid ref from library domain doesn't redirect (stays on library).
    """
    HTTP_HOST = "www.modularization.testing.sefaria.org"
    
    class DummyRef:
        def url(self, _=False):
            return "Genesis.1.1"

    monkeypatch.setattr(
        "sefaria.model.Ref.instantiate_ref_with_legacy_parse_fallback",
        lambda tref: DummyRef(),
    )

    response = client.get(
        "/Genesis.1.1",
        HTTP_HOST=HTTP_HOST,
    )

    # Should not redirect, should render the page (200 or similar)
    # Note: This might return 200 or redirect for normalization, but shouldn't redirect to voices
    assert response.status_code in [200, 301]
    if response.status_code == 301:
        # If it redirects, it should stay on library domain
        assert HTTP_HOST in response["Location"] or "www.modularization.testing.sefaria.org" in response["Location"]


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_redirect_to_module_cross_module(client):
    """
    Test redirect_to_module function for cross-module redirects.
    """
    from reader.views import redirect_to_module
    from django.test import RequestFactory
    
    factory = RequestFactory()
    request = factory.get("/test", {"param": "value"})
    request.interfaceLang = "english"
    
    response = redirect_to_module(request, "/Genesis.1.1", VOICES_MODULE)
    
    assert response.status_code == 301
    assert "voices.modularization.testing.sefaria.org" in response["Location"]
    assert "Genesis.1.1" in response["Location"]
    assert "param=value" in response["Location"]


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_redirect_to_module_same_module(client):
    """
    Test redirect_to_module function for same-module redirects (URL normalization).
    """
    from reader.views import redirect_to_module
    from django.test import RequestFactory
    
    factory = RequestFactory()
    request = factory.get("/test", {"param": "value"})
    request.interfaceLang = "english"
    
    response = redirect_to_module(request, "Genesis.1.1", target_module=None)
    
    assert response.status_code == 301
    assert "/Genesis.1.1" in response["Location"]
    assert "param=value" in response["Location"]


MOCK_VERSIONS = [
    {"versionTitle": "Koren Tanakh", "languageFamilyName": "hebrew", "direction": "rtl"},
    {"versionTitle": "William Davidson Edition", "languageFamilyName": "english", "direction": "ltr"},
]


class DummyRefWithVersions:
    def __init__(self, *args, **kwargs):
        pass

    def url(self, _=False):
        return "Genesis.1.1"

    def version_list(self):
        return MOCK_VERSIONS

    @staticmethod
    def instantiate_ref_with_legacy_parse_fallback(tref):
        return DummyRefWithVersions()


def _setup_version_mocks(monkeypatch):
    monkeypatch.setattr("reader.views.Ref", DummyRefWithVersions)


def _get_redirect_params(response):
    location = response["Location"]
    parsed = urlparse(location)
    return parse_qs(parsed.query)


@pytest.mark.django_db
def test_catchall_redirect_version_language_only(client, monkeypatch):
    """
    When ven/vhe has a valid language but invalid title, the version is resolved by language (Tier 2 fallback).
    Also tests that a bare language name without pipe is treated as a title lookup and removed when unmatched.
    """
    _setup_version_mocks(monkeypatch)

    response = client.get("/Genesis.1.1", {
        "ven": "english|Nonexistent_Title",
        "vhe": "hebrew|Nonexistent_Title",
        "p2": "Genesis.1",
        "ven2": "english|Nonexistent_Title",
    })
    assert response.status_code == 302
    params = _get_redirect_params(response)
    assert params["ven"] == ["english|William_Davidson_Edition"]
    assert params["vhe"] == ["hebrew|Koren_Tanakh"]
    assert params["ven2"] == ["english|William_Davidson_Edition"]

    # bare language name (no pipe) → treated as legacy title, no match → removed
    response = client.get("/Genesis.1.1", {"ven": "english", "vhe": "russian"})
    assert response.status_code == 302
    params = _get_redirect_params(response)
    assert "ven" not in params
    assert "vhe" not in params


@pytest.mark.django_db
def test_catchall_redirect_version_title_only(client, monkeypatch):
    """
    When ven/vhe is a legacy format with only the version title (no pipe),
    the version is resolved by title (Tier 3 fallback).
    """
    _setup_version_mocks(monkeypatch)

    response = client.get("/Genesis.1.1", {
        "vhe": "Koren_Tanakh",
        "p2": "Genesis.1",
        "vhe2": "Koren_Tanakh",
        "p10": "Genesis.1",
        "ven10": "William_Davidson_Edition",
    })
    assert response.status_code == 302
    params = _get_redirect_params(response)
    assert params["vhe"] == ["hebrew|Koren_Tanakh"]
    assert params["vhe2"] == ["hebrew|Koren_Tanakh"]
    assert params["ven10"] == ["english|William_Davidson_Edition"]


@pytest.mark.django_db
def test_catchall_redirect_version_one_invalid(client, monkeypatch):
    """
    When ven/vhe has an invalid language but valid title,
    the version is resolved by title only (Tier 3 fallback).
    """
    _setup_version_mocks(monkeypatch)

    response = client.get("/Genesis.1.1", {
        "ven": "nonexistent|William_Davidson_Edition",
        "p2": "Genesis.1",
        "vhe2": "nonexistent|Koren_Tanakh",
    })
    assert response.status_code == 302
    params = _get_redirect_params(response)
    assert params["ven"] == ["english|William_Davidson_Edition"]
    assert params["vhe2"] == ["hebrew|Koren_Tanakh"]


@pytest.mark.django_db
def test_catchall_redirect_version_both_invalid(client, monkeypatch):
    """
    When both language and title are invalid, the version param is removed from the redirect URL.
    """
    _setup_version_mocks(monkeypatch)

    response = client.get("/Genesis.1.1", {
        "ven": "nonexistent|Nonexistent_Title",
        "p2": "Genesis.1",
        "vhe2": "nonexistent|Nonexistent_Title",
    })
    assert response.status_code == 302
    params = _get_redirect_params(response)
    assert "ven" not in params
    assert "vhe2" not in params
