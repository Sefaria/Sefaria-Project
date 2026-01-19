"""
Tests for SessionCookieDomainMiddleware.

Tests that session and CSRF cookie domains are dynamically set based on
an approved list derived from DOMAIN_MODULES.
"""
from unittest.mock import patch
from django.test import RequestFactory, override_settings
from django.http import HttpResponse
from sefaria.system.middleware import SessionCookieDomainMiddleware


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

def create_request(host):
    """Create a mock request with the specified host."""
    factory = RequestFactory()
    request = factory.get('/')
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

        # No legacy cookie headers should be added
        assert 'set-cookie-legacy-sessionid' not in result._headers
        assert 'set-cookie-legacy-csrftoken' not in result._headers

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

        # Legacy cookie headers should be added
        assert 'set-cookie-legacy-sessionid' in result._headers
        assert 'set-cookie-legacy-csrftoken' in result._headers

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

        # Check the Set-Cookie header format for CSRF token
        header_name, header_value = result._headers['set-cookie-legacy-csrftoken']
        assert header_name == 'Set-Cookie'
        assert 'csrftoken=' in header_value
        assert 'expires=Thu, 01 Jan 1970 00:00:00 GMT' in header_value
        assert 'Max-Age=0' in header_value
        assert 'Path=/' in header_value
        # Crucially, no Domain attribute
        assert 'Domain=' not in header_value

        # Check session cookie header
        header_name, header_value = result._headers['set-cookie-legacy-sessionid']
        assert header_name == 'Set-Cookie'
        assert 'sessionid=' in header_value

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

        # No legacy cookie headers should be added for unapproved domains
        assert 'set-cookie-legacy-sessionid' not in result._headers
        assert 'set-cookie-legacy-csrftoken' not in result._headers

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

        # Only CSRF legacy header should be added
        assert 'set-cookie-legacy-csrftoken' in result._headers
        assert 'set-cookie-legacy-sessionid' not in result._headers
