"""
Tests for language and module switching middleware and views.

Cookie Strategy (as of commit a26e7846b):
- Cookies are set on shared domain suffix (e.g., .sefaria.org, .sefariastaging.org)
- Language switches (cross-domain) use ?set-language-cookie parameter
- Module switches (same language) inherit cookies automatically without parameter
- See commits: 7d99ada0e (shared domain cookies), a26e7846b (removed param from module switch)

Test Coverage:
- Staging/Production: Test LANGUAGE switching scenarios (English ↔ Hebrew) across
  different domains, verifying redirects with ?set-language-cookie parameter
- Cauldron: Test that NO redirects occur on non-language-pinned domains (same domain
  for both languages). Language preference is handled purely via cookies without
  middleware redirects, since current_domain_lang() returns None for ambiguous domains
- Module-only switches (Library ↔ Voices) no longer require ?set-language-cookie
  parameter and are not tested here, as cookies are automatically shared across
  modules within the same language domain
"""

import pytest
from django.test import RequestFactory, override_settings
from django.contrib.auth.models import AnonymousUser
from sefaria.system.middleware import LanguageSettingsMiddleware, LanguageCookieMiddleware
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE

# ============================================================================
# TEST CONFIGURATIONS
# ============================================================================

CAULDRON_CONFIG = {
    "en": {
        "library": "https://www.modularization.cauldron.sefaria.org",
        "voices": "https://voices.modularization.cauldron.sefaria.org"
    },
    "he": {
        "library": "https://www.modularization.cauldron.sefaria.org",
        "voices": "https://voices.modularization.cauldron.sefaria.org"
    }
}

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
        "voices": "https://chiburim.sefaria.org.il"
    }
}

# Extract allowed hosts from configs
CAULDRON_HOSTS = [
    'www.modularization.cauldron.sefaria.org',
    'voices.modularization.cauldron.sefaria.org'
]

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
    'chiburim.sefaria.org.il'
]

# Create reusable decorators
cauldron_settings = override_settings(
    DOMAIN_MODULES=CAULDRON_CONFIG,
    ALLOWED_HOSTS=CAULDRON_HOSTS
)

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
    # CAULDRON TESTS - Language Switching (Same Domain, Different Languages)
    # ========================================================================
    # Note: Cauldron uses the same domain for both English and Hebrew.
    # Since the domain is NOT language-pinned (same domain serves multiple languages),
    # current_domain_lang() returns None, and LanguageCookieMiddleware doesn't process
    # the ?set-language-cookie parameter. Language switching on Cauldron is handled
    # entirely through cookies without the middleware redirect flow.

    # SCENARIO 1: Library - English language preference (cookie-based)
    @cauldron_settings
    def test_cauldron_library_english_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Cauldron Library with English cookie
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'english' based on cookie
        """
        request = factory.get('/', HTTP_HOST='www.modularization.cauldron.sefaria.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'english', "Interface language should be set to English"

    # SCENARIO 2: Library - Hebrew language preference (cookie-based)
    @cauldron_settings
    def test_cauldron_library_hebrew_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Cauldron Library with Hebrew cookie
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'hebrew' based on cookie
        """
        request = factory.get('/', HTTP_HOST='www.modularization.cauldron.sefaria.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'hebrew', "Interface language should be set to Hebrew"

    # SCENARIO 3: Voices - English language preference (cookie-based)
    @cauldron_settings
    def test_cauldron_voices_english_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Cauldron Voices with English cookie
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'english' based on cookie
        """
        request = factory.get('/', HTTP_HOST='voices.modularization.cauldron.sefaria.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'english', "Interface language should be set to English"

    # SCENARIO 4: Voices - Hebrew language preference (cookie-based)
    @cauldron_settings
    def test_cauldron_voices_hebrew_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Cauldron Voices with Hebrew cookie
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'hebrew' based on cookie
        """
        request = factory.get('/', HTTP_HOST='voices.modularization.cauldron.sefaria.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'hebrew', "Interface language should be set to Hebrew"

    # ========================================================================
    # STAGING TESTS - Language Switching Only
    # ========================================================================

    # SCENARIO 1: English-Library → Hebrew (Language Switch)
    @staging_settings
    def test_english_library_switch_to_hebrew(self, factory, language_middleware):
        """
        Given: User is on English Library (www.sefariastaging.org)
        When: User switches to Hebrew language
        Then: User should be redirected to Hebrew Library (www.sefariastaging-il.org)
              with ?set-language-cookie parameter
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
    
    # SCENARIO 2: Hebrew-Library → English (Language Switch)
    @staging_settings
    def test_hebrew_library_switch_to_english(self, factory, language_middleware):
        """
        Given: User is on Hebrew Library (www.sefariastaging-il.org)
        When: User switches to English language
        Then: User should be redirected to English Library (www.sefariastaging.org)
              with ?set-language-cookie parameter
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


    # SCENARIO 3: English-Voices → Hebrew (Language Switch)
    @staging_settings
    def test_english_voices_switch_to_hebrew(self, factory, language_middleware):
        """
        Given: User is on English Voices (voices.sefariastaging.org)
        When: User switches to Hebrew language
        Then: User should be redirected to Hebrew Voices (chiburim.sefariastaging-il.org)
              with ?set-language-cookie parameter
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


    # SCENARIO 4: Hebrew-Voices → English (Language Switch)
    @staging_settings
    def test_hebrew_voices_switch_to_english(self, factory, language_middleware):
        """
        Given: User is on Hebrew Voices (chiburim.sefariastaging-il.org)
        When: User switches to English language
        Then: User should be redirected to English Voices (voices.sefariastaging.org)
              with ?set-language-cookie parameter
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



    # ========================================================================
    # PRODUCTION TESTS - Language Switching Only
    # ========================================================================

    # SCENARIO 1: English-Library → Hebrew (Language Switch)
    @production_settings
    def test_english_library_switch_to_hebrew_prod(self, factory, language_middleware):
        """
        Given: User is on English Library (www.sefaria.org)
        When: User switches to Hebrew language
        Then: User should be redirected to Hebrew Library (www.sefaria.org.il)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='www.sefaria.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'www.sefaria.org.il' in response.url, "Should redirect to Hebrew domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"

    # SCENARIO 2: Hebrew-Library → English (Language Switch)
    @production_settings
    def test_hebrew_library_switch_to_english_prod(self, factory, language_middleware):
        """
        Given: User is on Hebrew Library (www.sefaria.org.il)
        When: User switches to English language
        Then: User should be redirected to English Library (www.sefaria.org)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='www.sefaria.org.il')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'www.sefaria.org' in response.url, "Should redirect to English domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"

    # SCENARIO 3: English-Voices → Hebrew (Language Switch)
    @production_settings
    def test_english_voices_switch_to_hebrew_prod(self, factory, language_middleware):
        """
        Given: User is on English Voices (voices.sefaria.org)
        When: User switches to Hebrew language
        Then: User should be redirected to Hebrew Voices (chiburim.sefaria.org.il)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='voices.sefaria.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'chiburim.sefaria.org.il' in response.url, "Should redirect to Hebrew domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"

    # SCENARIO 4: Hebrew-Voices → English (Language Switch)
    @production_settings
    def test_hebrew_voices_switch_to_english_prod(self, factory, language_middleware):
        """
        Given: User is on Hebrew Voices (chiburim.sefaria.org.il)
        When: User switches to English language
        Then: User should be redirected to English Voices (voices.sefaria.org)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='chiburim.sefaria.org.il')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'voices.sefaria.org' in response.url, "Should redirect to English domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"