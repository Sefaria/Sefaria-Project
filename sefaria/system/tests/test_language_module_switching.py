"""
Tests for language and module switching middleware and views.
"""

import pytest
from django.test import RequestFactory, override_settings
from django.contrib.auth.models import AnonymousUser
from sefaria.system.middleware import LanguageSettingsMiddleware, LanguageCookieMiddleware
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE

# ============================================================================
# TEST CONFIGURATIONS
# ============================================================================

STAGING_CONFIG = {
    "en": {
        "library": "https://www.sefariastaging.org",
        "voices": "https://voices.sefariastaging.org"
    },
    "he": {
        "library": "https://www.sefariastaging-il.org",
        "voices": "https://chiburim.sefariastaging-il.org"
    }
}

PRODUCTION_CONFIG = {
    "en": {
        "library": "https://www.sefaria.org",
        "voices": "https://voices.sefaria.org"
    },
    "he": {
        "library": "https://www.sefaria.org.il",
        "voices": "https://voices.sefaria.org.il"
    }
}

# Extract allowed hosts from configs
STAGING_HOSTS = [
    'www.sefariastaging.org',
    'voices.sefariastaging.org',
    'www.sefariastaging-il.org',
    'chiburim.sefariastaging-il.org'
]

PRODUCTION_HOSTS = [
    'www.sefaria.org',
    'voices.sefaria.org',
    'www.sefaria.org.il',
    'voices.sefaria.org.il'
]

# Create reusable decorators
staging_settings = override_settings(
    DOMAIN_MODULES=STAGING_CONFIG,
    ALLOWED_HOSTS=STAGING_HOSTS
)

production_settings = override_settings(
    DOMAIN_MODULES=PRODUCTION_CONFIG,
    ALLOWED_HOSTS=PRODUCTION_HOSTS
)


# ============================================================================
# TESTS
# ============================================================================

class TestLanguageModuleSwitching:
    """Test language and module switching behavior"""
    
    @pytest.fixture
    def factory(self):
        """Provides RequestFactory for creating mock requests"""
        return RequestFactory()
    
    @pytest.fixture
    def language_middleware(self):
        """Provides LanguageSettingsMiddleware instance"""
        return LanguageSettingsMiddleware(get_response=lambda r: None)
    
    # ========================================================================
    # STAGING TESTS
    # ========================================================================
    
    @staging_settings
    def test_english_library_switch_to_hebrew(self, factory, language_middleware):
        """
        Given: User is on English Library (www.sefariastaging.org)
        When: User switches to Hebrew
        Then: User should arrive at Hebrew Library (www.sefariastaging-il.org)
        """
        request = factory.get('/', HTTP_HOST='www.sefariastaging.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'www.sefariastaging-il.org' in response.url, "Should redirect to Hebrew domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"
    
    # SCENARIO 2: English-Library → Voices
    @staging_settings
    def test_voices_with_set_language_cookie_param(self, factory):
        """
        When user arrives at Voices from Library with set-language-cookie param,
        cookie middleware should set the interfaceLang cookie.
        """
        cookie_middleware = LanguageCookieMiddleware(get_response=lambda r: None)

        request = factory.get('/?set-language-cookie', HTTP_HOST='voices.sefariastaging.org')
        request.user = AnonymousUser()
        request.active_module = VOICES_MODULE
        request.interfaceLang = 'english'

        response = cookie_middleware.process_request(request)
        
        # Should redirect to clean URL and set cookie
        assert response is not None
        assert response.status_code == 302
        assert '/?set-language-cookie' not in response.url
        assert 'interfaceLang' in response.cookies
        assert response.cookies['interfaceLang'].value == 'english'
    
    # SCENARIO 3: Hebrew-Library → English
    @staging_settings
    def test_hebrew_library_switch_to_english(self, factory, language_middleware):
        """
        Given: User is on Hebrew Library (www.sefariastaging-il.org)
        When: User switches to English
        Then: User should arrive on English Library (www.sefariastaging.org)
        """
        request = factory.get('/', HTTP_HOST='www.sefariastaging-il.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'www.sefariastaging.org' in response.url, "Should redirect to English domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"
    
    
    # SCENARIO 4: Hebrew-Library → Voices
    @staging_settings
    def test_hebrew_library_switch_to_voices(self, factory, language_middleware):
        """
        Given: User is on Hebrew Library (www.sefariastaging-il.org)
        When: User switches to Voices module
        Then: User should arrive on Hebrew Voices (chiburim.sefariastaging-il.org)
        """
        cookie_middleware = LanguageCookieMiddleware(get_response=lambda r: None)

        request = factory.get('/?set-language-cookie', HTTP_HOST='chiburim.sefariastaging-il.org')
        request.user = AnonymousUser()
        request.active_module = VOICES_MODULE
        request.interfaceLang = 'hebrew'

        response = cookie_middleware.process_request(request)
        
        # Should redirect to clean URL and set cookie
        assert response is not None
        assert response.status_code == 302
        assert '/?set-language-cookie' not in response.url
        assert 'interfaceLang' in response.cookies
        assert response.cookies['interfaceLang'].value == 'hebrew'
    
    # SCENARIO 5: English-Voices → Hebrew
    @staging_settings
    def test_english_voices_switch_to_hebrew(self, factory, language_middleware):
        """
        Given: User is on English Voices (voices.sefariastaging.org)
        When: User switches to Hebrew
        Then: User should arrive on Hebrew Voices (chiburim.sefariastaging-il.org)
        """
        request = factory.get('/', HTTP_HOST='voices.sefariastaging.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'chiburim.sefariastaging-il.org' in response.url, "Should redirect to Hebrew domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"
    
    # SCENARIO 6: English-Voices → Library
    @staging_settings
    def test_english_voices_switch_to_library(self, factory, language_middleware):
        """
        Given: User is on English Voices (voices.sefariastaging.org)
        When: User switches to Library module
        Then: User should arrive on English Library (www.sefariastaging.org)
        """
        cookie_middleware = LanguageCookieMiddleware(get_response=lambda r: None)

        request = factory.get('/?set-language-cookie', HTTP_HOST='www.sefariastaging.org')
        request.user = AnonymousUser()
        request.active_module = LIBRARY_MODULE
        request.interfaceLang = 'english'

        response = cookie_middleware.process_request(request)
        
        # Should redirect to clean URL and set cookie
        assert response is not None
        assert response.status_code == 302
        assert '/?set-language-cookie' not in response.url
        assert 'interfaceLang' in response.cookies
        assert response.cookies['interfaceLang'].value == 'english'
    
    # SCENARIO 7: Hebrew-Voices → English
    @staging_settings
    def test_hebrew_voices_switch_to_english(self, factory, language_middleware):
        """
        Given: User is on Hebrew Voices (chiburim.sefariastaging-il.org)
        When: User switches to English
        Then: User should arrive on English Voices (voices.sefariastaging.org)
        """
        request = factory.get('/', HTTP_HOST='chiburim.sefariastaging-il.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'voices.sefariastaging.org' in response.url, "Should redirect to English domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"

    
    # SCENARIO 8: Hebrew-Voices → Library
    @staging_settings
    def test_hebrew_voices_switch_to_library(self, factory, language_middleware):
        """
        Given: User is on Hebrew Voices (chiburim.sefariastaging-il.org)
        When: User switches to Library module
        Then: User should arrive on Hebrew Library (www.sefariastaging-il.org)
        """
        cookie_middleware = LanguageCookieMiddleware(get_response=lambda r: None)

        request = factory.get('/?set-language-cookie', HTTP_HOST='www.sefariastaging-il.org')
        request.user = AnonymousUser()
        request.active_module = LIBRARY_MODULE
        request.interfaceLang = 'hebrew'

        response = cookie_middleware.process_request(request)
        
        # Should redirect to clean URL and set cookie
        assert response is not None
        assert response.status_code == 302
        assert '/?set-language-cookie' not in response.url
        assert 'interfaceLang' in response.cookies
        assert response.cookies['interfaceLang'].value == 'hebrew'