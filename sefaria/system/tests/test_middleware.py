"""
Tests for SessionCookieDomainMiddleware.

Tests that session and CSRF cookie domains are dynamically set based on
an approved list derived from DOMAIN_MODULES.
"""
from unittest.mock import patch
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, override_settings
from django.http import HttpResponse
from sefaria.system.middleware import ModuleMiddleware, SessionCookieDomainMiddleware, SessionIDAuthMiddleware
from sefaria.utils.chatbot import build_chatbot_user_token
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE

# ============================================================================
# TEST CONFIGURATIONS
# ============================================================================

LOCAL_CONFIG = {
    "en": {
        "library": "http://localsefaria.xyz:8000",
        "voices": "http://voices.localsefaria.xyz:8000"
    },
    "he": {
        "library": "http://localsefaria-il.xyz:8000",
        "voices": "http://chiburim.localsefaria-il.xyz:8000"
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

CAULDRON_CONFIG = {
    "en": {
        "library": "http://name.cauldron.sefaria.org",
        "voices": "http://voices.cauldron.sefaria.org"
    },
    "he": {
        "library": "http://name.cauldron.sefaria.org",
        "voices": "http://voices.cauldron.sefaria.org"
    }
}

EMPTY_CONFIG = {}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_request(host, path='/'):
    """Create a mock request with the specified host."""
    factory = RequestFactory()
    request = factory.get(path)
    request.META['HTTP_HOST'] = host
    return request


def create_response_with_cookies():
    """Create a response with session and CSRF cookies set."""
    response = HttpResponse()
    response.set_cookie('sessionid', 'test-session-value')
    response.set_cookie('csrftoken', 'test-csrf-value')
    return response


def create_response_without_cookies():
    """Create a response without any cookies."""
    return HttpResponse()


# ============================================================================
# TESTS: APPROVED DOMAIN LIST BUILDING
# ============================================================================


class TestModuleMiddleware:
    """Test active module detection for regular pages and social image API requests."""

    @override_settings(DOMAIN_MODULES=LOCAL_CONFIG)
    def test_social_image_api_uses_host_module(self):
        captured = {}

        def get_response(request):
            captured["active_module"] = request.active_module
            return HttpResponse()

        middleware = ModuleMiddleware(get_response=get_response)
        request = create_request('voices.localsefaria.xyz:8000', '/api/img-gen/not-a-ref')

        middleware(request)

        assert captured["active_module"] == VOICES_MODULE

    @override_settings(DOMAIN_MODULES=LOCAL_CONFIG)
    def test_other_api_paths_use_default_module(self):
        captured = {}

        def get_response(request):
            captured["active_module"] = request.active_module
            return HttpResponse()

        middleware = ModuleMiddleware(get_response=get_response)
        request = create_request('voices.localsefaria.xyz:8000', '/api/texts/Genesis.1.1')

        middleware(request)

        assert captured["active_module"] == LIBRARY_MODULE

class TestBuildApprovedDomains:
    """Test the _build_approved_domains method."""
    
    @override_settings(DOMAIN_MODULES=LOCAL_CONFIG)
    def test_builds_correct_mapping_for_local_config(self):
        """Test that local config builds correct hostname -> cookie domain mapping."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        expected = {
            'localsefaria.xyz': '.localsefaria.xyz',
            'voices.localsefaria.xyz': '.localsefaria.xyz',
            'localsefaria-il.xyz': '.localsefaria-il.xyz',
            'chiburim.localsefaria-il.xyz': '.localsefaria-il.xyz'
        }
        
        assert middleware._approved_domains == expected
    
    @override_settings(DOMAIN_MODULES=PRODUCTION_CONFIG)
    def test_builds_correct_mapping_for_production_config(self):
        """Test that production config builds correct hostname -> cookie domain mapping."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        expected = {
            'www.sefaria.org': '.sefaria.org',
            'voices.sefaria.org': '.sefaria.org',
            'www.sefaria.org.il': '.sefaria.org.il',
            'chiburim.sefaria.org.il': '.sefaria.org.il'
        }
        
        assert middleware._approved_domains == expected
    
    @override_settings(DOMAIN_MODULES=EMPTY_CONFIG)
    def test_handles_empty_config(self):
        """Test that empty DOMAIN_MODULES results in empty approved list."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        assert middleware._approved_domains == {}
    
    def test_cauldron_domain_strips_only_first_subdomain(self):
        """Test that cauldron domain preserves second-level domain."""
        with override_settings(DOMAIN_MODULES=CAULDRON_CONFIG):
            middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
            
            expected = {
                'name.cauldron.sefaria.org': '.cauldron.sefaria.org',
                'voices.cauldron.sefaria.org': '.cauldron.sefaria.org'
            }
            
            assert middleware._approved_domains == expected
    
    def test_single_hostname_per_language_returns_no_cookie_domain(self):
        """Test that single hostname per language returns no cookie domain (need 2+ for common suffix)."""
        single_hostname_config = {
            "en": {
                "library": "http://name.cauldron.sefaria.org"
            },
            "he": {
                "library": "http://name.cauldron.sefaria.org"
            }
        }
        
        with override_settings(DOMAIN_MODULES=single_hostname_config):
            middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
            
            # No cookie domain should be set when there's only one hostname per language
            assert middleware._approved_domains == {}
    


# ============================================================================
# TESTS: PROCESS_REQUEST (stores cookie domain on request)
# ============================================================================

class TestProcessRequest:
    """Test that process_request correctly stores cookie domain on request object."""
    
    @override_settings(DOMAIN_MODULES=LOCAL_CONFIG)
    def test_approved_domain_sets_cookie_domain_on_request(self):
        """Test that approved host stores correct cookie domain on request."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        
        middleware.process_request(request)
        
        assert request._cookie_domain == '.localsefaria.xyz'
    
    @override_settings(DOMAIN_MODULES=LOCAL_CONFIG, ALLOWED_HOSTS=['*'])
    def test_unapproved_domain_sets_none_on_request(self):
        """Test that unapproved host stores None on request."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('random.example.com')
        
        middleware.process_request(request)
        
        assert request._cookie_domain is None
    
    @override_settings(DOMAIN_MODULES=PRODUCTION_CONFIG, ALLOWED_HOSTS=['*'])
    def test_production_domains_stored_correctly(self):
        """Test that production domains are stored correctly on request."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        # Test English production
        request_en = create_request('www.sefaria.org')
        middleware.process_request(request_en)
        assert request_en._cookie_domain == '.sefaria.org'
        
        # Test Hebrew production
        request_he = create_request('www.sefaria.org.il')
        middleware.process_request(request_he)
        assert request_he._cookie_domain == '.sefaria.org.il'
    
    @override_settings(DOMAIN_MODULES=EMPTY_CONFIG)
    def test_empty_config_sets_none_on_request(self):
        """Test that empty DOMAIN_MODULES sets None on request."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        
        middleware.process_request(request)
        
        assert request._cookie_domain is None


# ============================================================================
# TESTS: COOKIE DOMAIN SETTING (process_response)
# ============================================================================

class TestCookieDomainSetting:
    """Test that cookies are set with correct domains."""
    
    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken'
    )
    def test_approved_english_domain_sets_cookie_domain(self):
        """Test that approved English host sets correct cookie domain."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        response = create_response_with_cookies()
        
        middleware.process_request(request)
        result = middleware.process_response(request, response)
        
        assert result.cookies['sessionid']['domain'] == '.localsefaria.xyz'
        assert result.cookies['csrftoken']['domain'] == '.localsefaria.xyz'
    
    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken'
    )
    def test_approved_hebrew_domain_sets_cookie_domain(self):
        """Test that approved Hebrew host sets correct cookie domain."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria-il.xyz:8000')
        response = create_response_with_cookies()
        
        middleware.process_request(request)
        result = middleware.process_response(request, response)
        
        assert result.cookies['sessionid']['domain'] == '.localsefaria-il.xyz'
        assert result.cookies['csrftoken']['domain'] == '.localsefaria-il.xyz'
    
    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken'
    )
    def test_voices_subdomain_gets_same_domain_as_library(self):
        """Test that voices subdomain shares cookie domain with library."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        # Test English voices
        request_en = create_request('voices.localsefaria.xyz:8000')
        middleware.process_request(request_en)
        response_en = create_response_with_cookies()
        result_en = middleware.process_response(request_en, response_en)
        assert result_en.cookies['sessionid']['domain'] == '.localsefaria.xyz'
        
        # Test Hebrew voices
        request_he = create_request('chiburim.localsefaria-il.xyz:8000')
        middleware.process_request(request_he)
        response_he = create_response_with_cookies()
        result_he = middleware.process_response(request_he, response_he)
        assert result_he.cookies['sessionid']['domain'] == '.localsefaria-il.xyz'


# ============================================================================
# TESTS: UNAPPROVED DOMAINS
# ============================================================================

class TestUnapprovedDomains:
    """Test that unapproved domains don't have cookies modified."""
    
    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']  # Allow all hosts for testing
    )
    def test_unapproved_domain_leaves_cookies_unchanged(self):
        """Test that unapproved host doesn't modify cookie domain."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('random.example.com')
        response = create_response_with_cookies()
        
        # Get original domain (empty string by default)
        original_session_domain = response.cookies['sessionid']['domain']
        original_csrf_domain = response.cookies['csrftoken']['domain']
        
        middleware.process_request(request)
        result = middleware.process_response(request, response)
        
        # Domain should remain unchanged
        assert result.cookies['sessionid']['domain'] == original_session_domain
        assert result.cookies['csrftoken']['domain'] == original_csrf_domain
    
    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['localhost', '127.0.0.1']
    )
    def test_localhost_not_in_approved_list(self):
        """Test that localhost isn't automatically approved."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localhost:8000')
        response = create_response_with_cookies()
        
        original_domain = response.cookies['sessionid']['domain']
        middleware.process_request(request)
        result = middleware.process_response(request, response)
        
        # Domain should remain unchanged since localhost not in DOMAIN_MODULES
        assert result.cookies['sessionid']['domain'] == original_domain


# ============================================================================
# TESTS: EDGE CASES
# ============================================================================

class TestEdgeCases:
    """Test edge cases and error handling."""
    
    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']
    )
    def test_response_without_cookies_does_not_error(self):
        """Test that response without cookies doesn't cause an error."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        response = create_response_without_cookies()
        
        # Should not raise an exception
        middleware.process_request(request)
        result = middleware.process_response(request, response)
        
        assert 'sessionid' not in result.cookies
        assert 'csrftoken' not in result.cookies
    
    @override_settings(
        DOMAIN_MODULES=EMPTY_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken'
    )
    def test_empty_domain_modules_does_not_modify_cookies(self):
        """Test that empty DOMAIN_MODULES doesn't modify any cookies."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        response = create_response_with_cookies()
        
        original_domain = response.cookies['sessionid']['domain']
        middleware.process_request(request)
        result = middleware.process_response(request, response)
        
        assert result.cookies['sessionid']['domain'] == original_domain
    
    @override_settings(
        DOMAIN_MODULES=PRODUCTION_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']  # Allow all hosts for testing
    )
    def test_production_domains_work_correctly(self):
        """Test that production-style domains work correctly."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        # Test English production
        request = create_request('www.sefaria.org')
        middleware.process_request(request)
        response = create_response_with_cookies()
        result = middleware.process_response(request, response)
        assert result.cookies['sessionid']['domain'] == '.sefaria.org'
        
        # Test Hebrew production
        request = create_request('www.sefaria.org.il')
        middleware.process_request(request)
        response = create_response_with_cookies()
        result = middleware.process_response(request, response)
        assert result.cookies['sessionid']['domain'] == '.sefaria.org.il'


# ============================================================================
# TESTS: LEGACY COOKIE EXPIRATION
# ============================================================================

class TestLegacyCookieExpiration:
    """Test that legacy cookies (without Domain) are expired when feature is enabled."""

    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']
    )
    @patch('sefaria.system.middleware.remoteConfigCache')
    def test_legacy_cookies_not_expired_when_feature_disabled(self, mock_cache):
        """Test that legacy cookies are NOT expired when feature is disabled."""
        mock_cache.get.return_value = False
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        response = create_response_with_cookies()

        middleware.process_request(request)
        result = middleware.process_response(request, response)

        # No legacy expiry morsels should be added to response.cookies
        assert '_legacy_expire_sessionid' not in result.cookies
        assert '_legacy_expire_csrftoken' not in result.cookies

    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']
    )
    @patch('sefaria.system.middleware.remoteConfigCache')
    def test_legacy_cookies_expired_when_feature_enabled(self, mock_cache):
        """Test that legacy cookies ARE expired when feature is enabled."""
        mock_cache.get.return_value = True
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        response = create_response_with_cookies()

        middleware.process_request(request)
        result = middleware.process_response(request, response)

        # Legacy expiry morsels should be in response.cookies under unique keys
        assert '_legacy_expire_sessionid' in result.cookies
        assert '_legacy_expire_csrftoken' in result.cookies

    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']
    )
    @patch('sefaria.system.middleware.remoteConfigCache')
    def test_legacy_cookie_header_format(self, mock_cache):
        """Test that legacy cookie expiration header has correct format."""
        mock_cache.get.return_value = True
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')
        response = create_response_with_cookies()

        middleware.process_request(request)
        result = middleware.process_response(request, response)

        # Check the legacy expiry morsel for CSRF token
        csrf_morsel = result.cookies['_legacy_expire_csrftoken']
        assert csrf_morsel._key == 'csrftoken'        # outputs real cookie name
        assert csrf_morsel['expires'] == 'Thu, 01 Jan 1970 00:00:00 GMT'
        assert csrf_morsel['max-age'] == '0'
        assert csrf_morsel['path'] == '/'
        # Crucially, no Domain attribute
        assert csrf_morsel['domain'] == ''

        # Check session cookie legacy morsel
        session_morsel = result.cookies['_legacy_expire_sessionid']
        assert session_morsel._key == 'sessionid'

    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']
    )
    @patch('sefaria.system.middleware.remoteConfigCache')
    def test_legacy_cookies_not_expired_for_unapproved_domain(self, mock_cache):
        """Test that legacy cookies are NOT expired for unapproved domains."""
        mock_cache.get.return_value = True
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('random.example.com')
        response = create_response_with_cookies()

        middleware.process_request(request)
        result = middleware.process_response(request, response)

        # No legacy expiry morsels should be added for unapproved domains
        assert '_legacy_expire_sessionid' not in result.cookies
        assert '_legacy_expire_csrftoken' not in result.cookies

    @override_settings(
        DOMAIN_MODULES=LOCAL_CONFIG,
        SESSION_COOKIE_NAME='sessionid',
        CSRF_COOKIE_NAME='csrftoken',
        ALLOWED_HOSTS=['*']
    )
    @patch('sefaria.system.middleware.remoteConfigCache')
    def test_legacy_expiration_only_for_cookies_present_in_response(self, mock_cache):
        """Test that legacy expiration only happens for cookies actually in the response."""
        mock_cache.get.return_value = True
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        request = create_request('localsefaria.xyz:8000')

        # Response with only CSRF token, no session cookie
        response = HttpResponse()
        response.set_cookie('csrftoken', 'test-csrf-value')

        middleware.process_request(request)
        result = middleware.process_response(request, response)

        # Only CSRF legacy morsel should be added — session cookie was not in the response
        assert '_legacy_expire_csrftoken' in result.cookies
        assert '_legacy_expire_sessionid' not in result.cookies


class TestSessionIDAuthMiddleware:
    secret = "test-session-id-secret"

    def setup_method(self):
        self.factory = RequestFactory()
        self.middleware = SessionIDAuthMiddleware(get_response=lambda r: HttpResponse())

    def test_valid_header_authenticates_anonymous_request(self, django_user_model):
        user = django_user_model.objects.create_user(username="header-auth-user", password="pass")
        token = build_chatbot_user_token(user.id, self.secret)
        request = self.factory.get("/", HTTP_X_SESSION_ID=token)
        request.user = AnonymousUser()

        with override_settings(CHATBOT_USER_ID_SECRET=self.secret):
            self.middleware.process_request(request)

        assert request.user.is_authenticated
        assert request.user.id == user.id
        assert request.user_id == user.id
        assert request._cached_user.id == user.id

    def test_invalid_header_leaves_request_anonymous(self):
        request = self.factory.get("/", HTTP_X_SESSION_ID="not-a-valid-token")
        request.user = AnonymousUser()

        with override_settings(CHATBOT_USER_ID_SECRET=self.secret):
            self.middleware.process_request(request)

        assert not request.user.is_authenticated

    def test_existing_session_user_takes_precedence(self, django_user_model):
        session_user = django_user_model.objects.create_user(username="session-user", password="pass")
        other_user = django_user_model.objects.create_user(username="header-other-user", password="pass")
        token = build_chatbot_user_token(other_user.id, self.secret)
        request = self.factory.get("/", HTTP_X_SESSION_ID=token)
        request.user = session_user
        request._cached_user = session_user

        with override_settings(CHATBOT_USER_ID_SECRET=self.secret):
            self.middleware.process_request(request)

        assert request.user.id == session_user.id
        assert request._cached_user.id == session_user.id

    def test_expired_header_leaves_request_anonymous(self, django_user_model):
        user = django_user_model.objects.create_user(username="expired-header-user", password="pass")
        token = build_chatbot_user_token(user.id, self.secret, ttl_hours=-1)
        request = self.factory.get("/", HTTP_X_SESSION_ID=token)
        request.user = AnonymousUser()

        with override_settings(CHATBOT_USER_ID_SECRET=self.secret):
            self.middleware.process_request(request)

        assert not request.user.is_authenticated


# ============================================================================
# CSRF TRUSTED ORIGINS TESTS
# ============================================================================

class TestCsrfTrustedOrigins:
    """Tests that CSRF_TRUSTED_ORIGINS allows POST requests when Origin differs from Host.

    The wildcard-trusted-origins behavior only matters when the request Origin/Referer
    does NOT match the request Host — same-host requests pass via Django's same-origin
    fallback regardless of CSRF_TRUSTED_ORIGINS. So we deliberately set Host to an
    unrelated value and Origin/Referer to the sefaria.org subdomain we want to test.

    Calls _check_referer directly to isolate the Origin/Referer logic from the token
    check — a fully-mocked CSRF token round-trip is out of scope here.
    """

    def _make_csrf_middleware(self):
        from django.middleware.csrf import CsrfViewMiddleware
        return CsrfViewMiddleware(get_response=lambda r: HttpResponse())

    def _post_request(self, host, origin, referer=None):
        """Create a secure POST request with Origin and Referer headers."""
        referer = referer or f'{origin}/login/'
        return RequestFactory().post(
            '/login/',
            secure=True,
            HTTP_HOST=host,
            HTTP_ORIGIN=origin,
            HTTP_REFERER=referer,
        )

    def _check_referer(self, request):
        """Run only the Origin/Referer half of CSRF validation.

        Returns None if the referer is accepted, the RejectRequest exception otherwise.
        """
        from django.middleware.csrf import RejectRequest
        middleware = self._make_csrf_middleware()
        try:
            middleware._check_referer(request)
        except RejectRequest as e:
            return e
        return None

    # Host is an unrelated value so the same-host fallback never short-circuits the check.
    # Anything that passes here passes specifically because of CSRF_TRUSTED_ORIGINS.
    UNRELATED_HOST = 'internal-proxy.example'

    @override_settings(CSRF_TRUSTED_ORIGINS=['https://*.sefaria.org'], ALLOWED_HOSTS=['*'])
    def test_sefaria_subdomain_origin_is_trusted_when_host_differs(self):
        """Origin under *.sefaria.org should be accepted via CSRF_TRUSTED_ORIGINS, not host-match."""
        request = self._post_request(
            host=self.UNRELATED_HOST,
            origin='https://www.django6.cauldron.sefaria.org',
        )
        assert self._check_referer(request) is None, \
            "Cauldron origin should be trusted via CSRF_TRUSTED_ORIGINS but was rejected"

    @override_settings(CSRF_TRUSTED_ORIGINS=['https://*.sefaria.org'], ALLOWED_HOSTS=['*'])
    def test_untrusted_origin_is_rejected_when_host_differs(self):
        """Origin outside *.sefaria.org should be rejected when host doesn't match either."""
        request = self._post_request(
            host=self.UNRELATED_HOST,
            origin='https://evil.example.com',
        )
        assert self._check_referer(request) is not None, \
            "External origin should be rejected by CSRF middleware"

    @override_settings(CSRF_TRUSTED_ORIGINS=['https://*.sefaria.org'], ALLOWED_HOSTS=['*'])
    def test_sefaria_org_subdomains_are_trusted_via_wildcard(self):
        """Various sefaria.org subdomains should all be accepted via the wildcard."""
        trusted_origins = [
            'https://www.sefaria.org',
            'https://voices.sefaria.org',
            'https://www.django6.cauldron.sefaria.org',
            'https://staging.cauldron.sefaria.org',
        ]
        for origin in trusted_origins:
            request = self._post_request(host=self.UNRELATED_HOST, origin=origin)
            assert self._check_referer(request) is None, \
                f"Origin {origin} should be trusted via wildcard but was rejected"
