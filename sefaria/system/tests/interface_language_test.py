"""
Tests for sefaria/system/middleware.py::LanguageSettingsMiddleware on
"excluded" paths (/api/, /interface/, static, etc.).

The SSO branch extracted the cookie/cf-ipcountry/Accept-Language resolution
into _interface_from_request_signals and reused it on the excluded-path
branch, which previously hardcoded request.interfaceLang = "english"
unconditionally. That's a real behavior change bundled into what reads like a
pure refactor: excluded paths (most notably every /api/ request) now honor
the same language signals as regular page requests. These tests pin that
behavior down directly, independent of the rest of the middleware chain.
"""
import pytest
from django.test import RequestFactory

from sefaria.system.middleware import LanguageSettingsMiddleware


@pytest.fixture
def factory():
    return RequestFactory()


def _excluded_path_request(factory, cookie=None, cf_ipcountry=None):
    request = factory.get('/api/texts/Genesis.1.1')
    request.COOKIES = {'interfaceLang': cookie} if cookie else {}
    if cf_ipcountry:
        request.META['HTTP_CF_IPCOUNTRY'] = cf_ipcountry
    # Normally set upstream (e.g. Django's LocaleMiddleware) before this
    # middleware runs; _interface_from_request_signals reads it directly.
    request.LANGUAGE_CODE = 'en'
    return request


def test_excluded_path_defaults_to_english_with_no_signals(factory):
    request = _excluded_path_request(factory)
    LanguageSettingsMiddleware().process_request(request)
    assert request.interfaceLang == 'english'
    assert request.LANGUAGE_CODE == 'en'


def test_excluded_path_honors_interfaceLang_cookie(factory):
    request = _excluded_path_request(factory, cookie='hebrew')
    LanguageSettingsMiddleware().process_request(request)
    assert request.interfaceLang == 'hebrew'
    assert request.LANGUAGE_CODE == 'he'


def test_excluded_path_honors_cf_ipcountry_header(factory):
    # Cloudflare geolocates the request and sets this header; 'IL' maps to
    # Hebrew the same way it does on non-excluded paths.
    request = _excluded_path_request(factory, cf_ipcountry='IL')
    LanguageSettingsMiddleware().process_request(request)
    assert request.interfaceLang == 'hebrew'


def test_excluded_path_rejects_unsupported_language(factory):
    # Only english/hebrew are handled; anything else (e.g. a stray cookie
    # value) must fall back to english rather than leaking through.
    request = _excluded_path_request(factory, cookie='french')
    LanguageSettingsMiddleware().process_request(request)
    assert request.interfaceLang == 'english'


def test_excluded_path_cookie_takes_precedence_over_geo_header(factory):
    request = _excluded_path_request(factory, cookie='english', cf_ipcountry='IL')
    LanguageSettingsMiddleware().process_request(request)
    assert request.interfaceLang == 'english'
