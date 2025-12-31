"""
Tests for language and module switching middleware and views.

Cookie Strategy:
- Cookies are set on shared domain suffix (e.g., .sefaria.org, .sef-stage.org)
- Language switches (cross-domain) use ?set-language-cookie parameter
- Module switches (same language) inherit cookies automatically without parameter

Test Coverage:
- Staging/Production: Test LANGUAGE switching scenarios (English ↔ Hebrew) across
  different domains, verifying redirects with ?set-language-cookie parameter
- Testing environment: Test that NO redirects occur on non-language-pinned domains (same domain
  for both languages). Language preference is handled purely via cookies without
  middleware redirects, since current_domain_lang() returns None for ambiguous domains
- Module-only switches (Library ↔ Voices) does not require ?set-language-cookie
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

# Note: These are mocked URLS to mimic our testing environment
TESTING_CONFIG = {
    "en": {
        "library": "https://www.modularization.testing.sefaria.org",
        "voices": "https://voices.modularization.testing.sefaria.org"
    },
    "he": {
        "library": "https://www.modularization.testing.sefaria.org",
        "voices": "https://voices.modularization.testing.sefaria.org"
    }
}

# NOTE: these are mock urls to mimic staging
STAGING_CONFIG = {
    "en": {
        "library": "https://www.sef-stage.org",
        "voices": "https://voices.sef-stage.org"
    },
    "he": {
        "library": "https://www.sef-stage-il.org",
        "voices": "https://chiburim.sef-stage-il.org"
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

# Note: These are mocked URLS to mimic our testing environment
TESTING_HOSTS = [
    'www.modularization.testing.sefaria.org',
    'voices.modularization.testing.sefaria.org'
]

STAGING_HOSTS = [
    'www.sef-stage.org',
    'voices.sef-stage.org',
    'www.sef-stage-il.org',
    'chiburim.sef-stage-il.org'
]

PRODUCTION_HOSTS = [
    'www.sefaria.org',
    'voices.sefaria.org',
    'www.sefaria.org.il',
    'chiburim.sefaria.org.il'
]

# Create reusable decorators
testing_settings = override_settings(
    DOMAIN_MODULES=TESTING_CONFIG,
    ALLOWED_HOSTS=TESTING_HOSTS
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
    # TESTING ENV TESTS - Language Switching (Same Domain, Different Languages)
    # ========================================================================
    # Note: Testing environment uses the same domain for both English and Hebrew.
    # Since the domain is NOT language-pinned (same domain serves multiple languages),
    # current_domain_lang() returns None, and LanguageCookieMiddleware doesn't process
    # the ?set-language-cookie parameter. Language switching in the testing env is handled
    # entirely through cookies without the middleware redirect flow.

    # SCENARIO 1: Library - English language preference (cookie-based)
    @testing_settings
    def test_testing_env_library_english_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Library with English cookie in our testing environment
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'english' based on cookie
        """
        request = factory.get('/', HTTP_HOST='www.modularization.testing.sefaria.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'english', "Interface language should be set to English"

    # SCENARIO 2: Library - Hebrew language preference (cookie-based)
    @testing_settings
    def test_testing_env_library_hebrew_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Library with Hebrew cookie in our testing environment
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'hebrew' based on cookie
        """
        request = factory.get('/', HTTP_HOST='www.modularization.testing.sefaria.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'hebrew', "Interface language should be set to Hebrew"

    # SCENARIO 3: Voices - English language preference (cookie-based)
    @testing_settings
    def test_testing_env_voices_english_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Voices with English cookie in our testing environment
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'english' based on cookie
        """
        request = factory.get('/', HTTP_HOST='voices.modularization.testing.sefaria.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        # Should NOT redirect since domain is the same for both languages
        assert response is None, "Should not redirect on non-language-pinned domain"
        assert request.interfaceLang == 'english', "Interface language should be set to English"

    # SCENARIO 4: Voices - Hebrew language preference (cookie-based)
    @testing_settings
    def test_testing_env_voices_hebrew_no_redirect(self, factory, language_middleware):
        """
        Given: User is on Voices in testing env with Hebrew cookie
        When: LanguageSettingsMiddleware processes the request
        Then: Should NOT redirect (domain is same for both languages)
              Language should be set to 'hebrew' based on cookie
        """
        request = factory.get('/', HTTP_HOST='voices.modularization.testing.sefaria.org')
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
        Given: User is on English Library (www.sef-stage.org)
        When: User switches to Hebrew language
        Then: User should be redirected to Hebrew Library (www.sef-stage-il.org)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='www.sef-stage.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'www.sef-stage-il.org' in response.url, "Should redirect to Hebrew domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"
    
    # SCENARIO 2: Hebrew-Library → English (Language Switch)
    @staging_settings
    def test_hebrew_library_switch_to_english(self, factory, language_middleware):
        """
        Given: User is on Hebrew Library (www.sef-stage-il.org)
        When: User switches to English language
        Then: User should be redirected to English Library (www.sef-stage.org)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='www.sef-stage-il.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = LIBRARY_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'www.sef-stage.org' in response.url, "Should redirect to English domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"


    # SCENARIO 3: English-Voices → Hebrew (Language Switch)
    @staging_settings
    def test_english_voices_switch_to_hebrew(self, factory, language_middleware):
        """
        Given: User is on English Voices (voices.sef-stage.org)
        When: User switches to Hebrew language
        Then: User should be redirected to Hebrew Voices (chiburim.sef-stage-il.org)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='voices.sef-stage.org')
        request.COOKIES = {'interfaceLang': 'hebrew'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'chiburim.sef-stage-il.org' in response.url, "Should redirect to Hebrew domain"
        assert 'set-language-cookie' in response.url, "Should include cookie parameter"


    # SCENARIO 4: Hebrew-Voices → English (Language Switch)
    @staging_settings
    def test_hebrew_voices_switch_to_english(self, factory, language_middleware):
        """
        Given: User is on Hebrew Voices (chiburim.sef-stage-il.org)
        When: User switches to English language
        Then: User should be redirected to English Voices (voices.sef-stage.org)
              with ?set-language-cookie parameter
        """
        request = factory.get('/', HTTP_HOST='chiburim.sef-stage-il.org')
        request.COOKIES = {'interfaceLang': 'english'}
        request.user = AnonymousUser()
        request.META['HTTP_USER_AGENT'] = 'Mozilla/5.0'
        request.active_module = VOICES_MODULE

        response = language_middleware.process_request(request)

        assert response is not None, "Middleware should return a redirect"
        assert response.status_code == 302, "Should be a redirect (302)"
        assert 'voices.sef-stage.org' in response.url, "Should redirect to English domain"
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