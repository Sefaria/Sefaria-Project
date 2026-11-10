"""
POST /api/reader-errors (reader/browser_errors.py): what the rate limit is keyed on, and the cap for everyone together (wave-3
security review S-4). The key is the address nginx sets (X-Real-IP, overwritten by nginx on every proxied location), else REMOTE_ADDR;
CF-Connecting-IP only when settings.ORIGIN_LOCKED_TO_CLOUDFLARE; X-Forwarded-For never. Needs Postgres for the middleware only.
"""

import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import Client, RequestFactory, TestCase, override_settings

from reader import browser_errors

URL = "/api/reader-errors"
REPORT = {"v": 1, "kind": "error", "message": "Error: induced", "path": "/Genesis.1"}
# CI configures a DummyCache; the limit needs a real one
LOCMEM = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "reader-errors-rate-test"},
    "shared": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "reader-errors-rate-test-shared",
    },
}


def address(**meta):
    return browser_errors._client_address(RequestFactory().post(URL, **meta))


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False)
def test_key_is_the_address_nginx_sets_not_a_client_header():
    real = {"HTTP_X_REAL_IP": "198.51.100.1", "REMOTE_ADDR": "10.0.0.9"}
    assert address(**real) == "198.51.100.1"
    assert address(HTTP_CF_CONNECTING_IP="203.0.113.7", **real) == "198.51.100.1"
    assert address(HTTP_X_FORWARDED_FOR="203.0.113.7, 10.0.0.1", **real) == "198.51.100.1"
    # no nginx in front (a local run): the connection's own address, whatever the client claims
    claims = {"HTTP_CF_CONNECTING_IP": "203.0.113.7", "HTTP_X_FORWARDED_FOR": "203.0.113.8"}
    assert address(REMOTE_ADDR="10.0.0.9", **claims) == "10.0.0.9"


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=True)
def test_cf_connecting_ip_only_when_the_origin_is_locked_to_cloudflare():
    assert address(HTTP_CF_CONNECTING_IP="203.0.113.7", HTTP_X_REAL_IP="198.51.100.1") == "203.0.113.7"
    assert address(HTTP_X_REAL_IP="198.51.100.1") == "198.51.100.1"
    assert address(HTTP_X_FORWARDED_FOR="203.0.113.8", HTTP_X_REAL_IP="198.51.100.1") == "198.51.100.1"


def test_the_setting_is_off_unless_set():
    with override_settings():
        from django.conf import settings

        if hasattr(settings, "ORIGIN_LOCKED_TO_CLOUDFLARE"):
            del settings.ORIGIN_LOCKED_TO_CLOUDFLARE
        assert address(HTTP_CF_CONNECTING_IP="203.0.113.7", REMOTE_ADDR="10.0.0.9") == "10.0.0.9"


@override_settings(CACHES=LOCMEM, ROOT_URLCONF="sefaria.urls_library", ORIGIN_LOCKED_TO_CLOUDFLARE=False)
class ReaderErrorsRateLimitTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        cache.clear()
        self.client = Client(enforce_csrf_checks=True)
        p = patch.object(browser_errors, "logger")
        self.logger = p.start()
        self.addCleanup(p.stop)

    def post(self, **extra):
        return self.client.post(URL, json.dumps(REPORT), content_type="application/json", **extra)

    def test_a_new_cf_connecting_ip_or_x_forwarded_for_per_beacon_does_not_escape_the_limit(self):
        real = {"HTTP_X_REAL_IP": "198.51.100.1"}
        for i in range(browser_errors.RATE_LIMIT):
            self.assertEqual(self.post(HTTP_CF_CONNECTING_IP=f"203.0.113.{i}", **real).status_code, 204)
        self.assertEqual(self.post(HTTP_CF_CONNECTING_IP="203.0.113.250", **real).status_code, 429)
        self.assertEqual(self.post(HTTP_X_FORWARDED_FOR="192.0.2.1", **real).status_code, 429)
        self.assertEqual(self.logger.warning.call_count, browser_errors.RATE_LIMIT)

    @override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=True)
    def test_behind_cloudflare_each_visitor_has_their_own_limit(self):
        # nginx's X-Real-IP is then a Cloudflare edge, shared by many visitors
        edge = {"HTTP_X_REAL_IP": "162.158.0.1"}
        for _ in range(browser_errors.RATE_LIMIT):
            self.assertEqual(self.post(HTTP_CF_CONNECTING_IP="203.0.113.7", **edge).status_code, 204)
        self.assertEqual(self.post(HTTP_CF_CONNECTING_IP="203.0.113.7", **edge).status_code, 429)
        self.assertEqual(self.post(HTTP_CF_CONNECTING_IP="203.0.113.8", **edge).status_code, 204)

    def test_a_cap_for_everyone_together(self):
        with patch.object(browser_errors, "RATE_LIMIT_GLOBAL", 5):
            for i in range(5):
                self.assertEqual(self.post(HTTP_X_REAL_IP=f"198.51.100.{i}").status_code, 204)
            self.assertEqual(self.post(HTTP_X_REAL_IP="198.51.100.200").status_code, 429)
        self.assertEqual(self.logger.warning.call_count, 5)

    def test_a_client_over_its_own_limit_does_not_use_up_the_global_cap(self):
        with patch.object(browser_errors, "RATE_LIMIT", 2), patch.object(browser_errors, "RATE_LIMIT_GLOBAL", 4):
            for _ in range(10):
                self.post(HTTP_X_REAL_IP="198.51.100.1")
            self.assertEqual(self.post(HTTP_X_REAL_IP="198.51.100.2").status_code, 204)
            self.assertEqual(self.post(HTTP_X_REAL_IP="198.51.100.3").status_code, 204)
            self.assertEqual(self.post(HTTP_X_REAL_IP="198.51.100.4").status_code, 429)
