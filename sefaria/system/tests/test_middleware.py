"""
Tests for SessionCookieDomainMiddleware.

Tests that session and CSRF cookie domains are dynamically set based on 
an approved list derived from DOMAIN_MODULES.
"""

import pytest
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
        
        assert middleware.approved_domains == expected
    
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
        
        assert middleware.approved_domains == expected
    
    @override_settings(DOMAIN_MODULES=EMPTY_CONFIG)
    def test_handles_empty_config(self):
        """Test that empty DOMAIN_MODULES results in empty approved list."""
        middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
        
        assert middleware.approved_domains == {}
    
    def test_cauldron_domain_strips_only_first_subdomain(self):
        """Test that cauldron domain preserves second-level domain."""
        cauldron_config = {
            "en": {
                "library": "http://name.cauldron.sefaria.org",
                "voices": "http://voices.cauldron.sefaria.org"
            }
        }
        
        with override_settings(DOMAIN_MODULES=cauldron_config):
            middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
            
            expected = {
                'name.cauldron.sefaria.org': '.cauldron.sefaria.org',
                'voices.cauldron.sefaria.org': '.cauldron.sefaria.org'
            }
            
            assert middleware.approved_domains == expected
    
    def test_single_cauldron_hostname_strips_first_subdomain(self):
        """Test that single cauldron hostname strips only first subdomain."""
        single_cauldron_config = {
            "en": {
                "library": "http://name.cauldron.sefaria.org"
            }
        }
        
        with override_settings(DOMAIN_MODULES=single_cauldron_config):
            middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
            
            expected = {
                'name.cauldron.sefaria.org': '.cauldron.sefaria.org'
            }
            
            assert middleware.approved_domains == expected
    
    def test_cauldron_domain_strips_only_first_subdomain(self):
        """Test that cauldron domain preserves second-level domain."""
        cauldron_config = {
            "en": {
                "library": "http://name.cauldron.sefaria.org",
                "voices": "http://voices.cauldron.sefaria.org"
            }
        }
        
        with override_settings(DOMAIN_MODULES=cauldron_config):
            middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
            
            expected = {
                'name.cauldron.sefaria.org': '.cauldron.sefaria.org',
                'voices.cauldron.sefaria.org': '.cauldron.sefaria.org'
            }
            
            assert middleware.approved_domains == expected
    
    def test_single_cauldron_hostname_strips_first_subdomain(self):
        """Test that single cauldron hostname strips only first subdomain."""
        single_cauldron_config = {
            "en": {
                "library": "http://name.cauldron.sefaria.org"
            }
        }
        
        with override_settings(DOMAIN_MODULES=single_cauldron_config):
            middleware = SessionCookieDomainMiddleware(get_response=lambda r: HttpResponse())
            
            expected = {
                'name.cauldron.sefaria.org': '.cauldron.sefaria.org'
            }
            
            assert middleware.approved_domains == expected


# ============================================================================
# TESTS: COOKIE DOMAIN SETTING
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
        response_en = create_response_with_cookies()
        result_en = middleware.process_response(request_en, response_en)
        assert result_en.cookies['sessionid']['domain'] == '.localsefaria.xyz'
        
        # Test Hebrew voices
        request_he = create_request('chiburim.localsefaria-il.xyz:8000')
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
        response = create_response_with_cookies()
        result = middleware.process_response(request, response)
        assert result.cookies['sessionid']['domain'] == '.sefaria.org'
        
        # Test Hebrew production
        request = create_request('www.sefaria.org.il')
        response = create_response_with_cookies()
        result = middleware.process_response(request, response)
        assert result.cookies['sessionid']['domain'] == '.sefaria.org.il'
