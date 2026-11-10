"""
POST /api/reader-errors (reader/browser_errors.py): what the rate limit is keyed on, and the cap for everyone together (wave-3
security review S-4; rework round 1). The tests build request.META the way the chart's chain delivers it (helm-chart/sefaria):

  visitor → [Cloudflare] → Envoy Gateway → nginx → Varnish → Django

- the gateway's Lua (templates/gateway/extensionpolicy.yaml) REPLACES X-Original-Forwarded-For with CF-Connecting-IP if present,
  else the client address Envoy resolved; everything else the client sent is passed on;
- nginx (conf/nginx.template.conf.tpl) sets X-Real-IP to $remote_addr (the gateway pod) and appends $remote_addr to X-Forwarded-For;
  other headers pass through;
- Varnish appends its client (nginx) to X-Forwarded-For; Django's REMOTE_ADDR is the Varnish pod.
Needs Postgres for the middleware only.
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
GATEWAY_POD, NGINX_POD, VARNISH_POD = "10.8.0.21", "10.8.1.5", "10.8.2.7"


def _append(xff, addr):
    return f"{xff}, {addr}" if xff else addr


def through_chart(visitor, client_headers=None, gateway=True):
    """request.META as Django sees it for a request from `visitor` carrying `client_headers` (HTTP header names)."""
    h = {k.lower(): v for k, v in (client_headers or {}).items()}
    if gateway:
        h["x-original-forwarded-for"] = h.get("cf-connecting-ip") or visitor  # replace(), never append
        nginx_peer = GATEWAY_POD
        h["x-forwarded-for"] = _append(h.get("x-forwarded-for"), visitor)  # Envoy appends the peer it saw
    else:
        nginx_peer = visitor
    h["x-real-ip"] = nginx_peer  # nginx: proxy_set_header X-Real-IP $remote_addr
    h["x-forwarded-for"] = _append(h.get("x-forwarded-for"), nginx_peer)  # $proxy_add_x_forwarded_for
    h["x-forwarded-for"] = _append(h["x-forwarded-for"], NGINX_POD)  # Varnish
    meta = {"HTTP_" + k.upper().replace("-", "_"): v for k, v in h.items()}
    meta["REMOTE_ADDR"] = VARNISH_POD
    return meta


def key(meta):
    request = RequestFactory().post(URL)
    request.META.update(meta)
    return browser_errors._client_address(request)


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False)
def test_behind_the_gateway_each_visitor_has_their_own_key_not_the_gateway_pod():
    a, b = through_chart("198.51.100.1"), through_chart("198.51.100.2")
    assert a["HTTP_X_REAL_IP"] == b["HTTP_X_REAL_IP"] == GATEWAY_POD  # why X-Real-IP cannot be the key
    assert key(a) == "198.51.100.1"
    assert key(b) == "198.51.100.2"


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False)
def test_behind_cloudflare_the_gateway_puts_cf_connecting_ip_in_the_header():
    meta = through_chart("162.158.0.1", {"CF-Connecting-IP": "203.0.113.7"})  # visitor = a Cloudflare edge
    assert key(meta) == "203.0.113.7"


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False)
def test_spoofed_client_headers_do_not_change_the_key():
    spoofs = {"X-Original-Forwarded-For": "6.6.6.6", "X-Real-IP": "7.7.7.7", "X-Forwarded-For": "8.8.8.8, 9.9.9.9"}
    assert key(through_chart("198.51.100.1", spoofs)) == "198.51.100.1"
    for name, value in spoofs.items():
        assert key(through_chart("198.51.100.1", {name: value})) == "198.51.100.1"


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False)
def test_gateway_off_nginx_is_the_edge_and_x_real_ip_is_the_visitor():
    meta = through_chart("198.51.100.1", {"X-Forwarded-For": "8.8.8.8"}, gateway=False)
    assert "HTTP_X_ORIGINAL_FORWARDED_FOR" not in meta
    assert key(meta) == "198.51.100.1"


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False)
def test_no_proxy_at_all_is_remote_addr_and_garbage_headers_are_skipped():
    assert key({"REMOTE_ADDR": "127.0.0.1"}) == "127.0.0.1"
    assert key({"REMOTE_ADDR": "127.0.0.1", "HTTP_X_ORIGINAL_FORWARDED_FOR": "not-an-ip"}) == "127.0.0.1"
    # a list keeps its last entry (the one appended nearest to Django), never the client's first
    assert key({"REMOTE_ADDR": "127.0.0.1", "HTTP_X_ORIGINAL_FORWARDED_FOR": "6.6.6.6, 198.51.100.1"}) == "198.51.100.1"


@override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=True)
def test_cf_connecting_ip_read_directly_only_when_the_origin_is_locked_to_cloudflare():
    meta = {
        "HTTP_CF_CONNECTING_IP": "203.0.113.7",
        "HTTP_X_ORIGINAL_FORWARDED_FOR": "198.51.100.1",
        "REMOTE_ADDR": VARNISH_POD,
    }
    assert key(meta) == "203.0.113.7"
    with override_settings(ORIGIN_LOCKED_TO_CLOUDFLARE=False):
        assert key(meta) == "198.51.100.1"


def test_the_setting_is_off_unless_set():
    with override_settings():
        from django.conf import settings

        if hasattr(settings, "ORIGIN_LOCKED_TO_CLOUDFLARE"):
            del settings.ORIGIN_LOCKED_TO_CLOUDFLARE
        meta = {
            "HTTP_CF_CONNECTING_IP": "203.0.113.7",
            "HTTP_X_ORIGINAL_FORWARDED_FOR": "198.51.100.1",
            "REMOTE_ADDR": "10.0.0.9",
        }
        assert key(meta) == "198.51.100.1"


@override_settings(CACHES=LOCMEM, ROOT_URLCONF="sefaria.urls_library", ORIGIN_LOCKED_TO_CLOUDFLARE=False)
class ReaderErrorsRateLimitTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        cache.clear()
        self.client = Client(enforce_csrf_checks=True)
        p = patch.object(browser_errors, "logger")
        self.logger = p.start()
        self.addCleanup(p.stop)

    def post(self, meta):
        return self.client.post(URL, json.dumps(REPORT), content_type="application/json", **meta)

    def test_one_visitor_at_the_limit_does_not_block_another_behind_the_same_gateway_pod(self):
        for _ in range(browser_errors.RATE_LIMIT):
            self.assertEqual(self.post(through_chart("198.51.100.1")).status_code, 204)
        self.assertEqual(self.post(through_chart("198.51.100.1")).status_code, 429)
        self.assertEqual(self.post(through_chart("198.51.100.2")).status_code, 204)

    def test_rotating_spoofed_headers_does_not_escape_the_limit(self):
        for i in range(browser_errors.RATE_LIMIT):
            spoof = {
                "X-Original-Forwarded-For": f"6.6.6.{i}",
                "X-Forwarded-For": f"8.8.8.{i}",
                "X-Real-IP": f"7.7.7.{i}",
            }
            self.assertEqual(self.post(through_chart("198.51.100.1", spoof)).status_code, 204)
        last = through_chart("198.51.100.1", {"X-Original-Forwarded-For": "6.6.6.250"})
        self.assertEqual(self.post(last).status_code, 429)
        self.assertEqual(self.logger.warning.call_count, browser_errors.RATE_LIMIT)

    def test_a_cap_for_everyone_together_bounds_a_rotating_cf_connecting_ip(self):
        # residual: the gateway's Lua trusts CF-Connecting-IP, so a client that bypasses Cloudflare picks its key; the cap is the backstop
        with patch.object(browser_errors, "RATE_LIMIT_GLOBAL", 5):
            for i in range(5):
                rotated = through_chart("198.51.100.1", {"CF-Connecting-IP": f"203.0.113.{i}"})
                self.assertEqual(self.post(rotated).status_code, 204)
            rotated = through_chart("198.51.100.1", {"CF-Connecting-IP": "203.0.113.99"})
            self.assertEqual(self.post(rotated).status_code, 429)
        self.assertEqual(self.logger.warning.call_count, 5)

    def test_a_client_over_its_own_limit_does_not_use_up_the_global_cap(self):
        with patch.object(browser_errors, "RATE_LIMIT", 2), patch.object(browser_errors, "RATE_LIMIT_GLOBAL", 4):
            for _ in range(10):
                self.post(through_chart("198.51.100.1"))
            self.assertEqual(self.post(through_chart("198.51.100.2")).status_code, 204)
            self.assertEqual(self.post(through_chart("198.51.100.3")).status_code, 204)
            self.assertEqual(self.post(through_chart("198.51.100.4")).status_code, 429)
