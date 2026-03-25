"""
Tests for catchall view redirects between modules (library and voices).

Tests that reference links accessed from the wrong module (e.g., voices)
are properly redirected to the library module.
"""
import pytest
from django.test import override_settings
from django.test.client import Client
from sefaria.system.exceptions import InputError
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE


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
