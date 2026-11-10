"""
POST /api/reader-errors (reader/browser_errors.py): the new reader's browser error beacons, lane C's contract
(reports/c-observability.md "Error beacon contract"). Needs Postgres for the middleware only; no library data.
"""

import json
import time
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from django.urls import Resolver404, resolve

from reader import browser_errors

URL = "/api/reader-errors"
REPORT = {
    "v": 1,
    "kind": "error",
    "message": "Error: induced failure at /search for [email]",
    "stack": "Error: induced failure\n    at http://localhost/assets/main-abc.js:1:2",
    "source": "/assets/main-abc.js:1:2",
    "release": "v7.11.4-prod.2",
    "route": "reader",
    "signedIn": False,
    "path": "/Genesis.1",
    "ua": "chrome-desktop",
    "sampleRate": 1,
    "t": 1234.5,
}
# The rate limit lives in Django's default cache (Redis in the cluster); CI configures a DummyCache, so pin an in-memory one.
LOCMEM = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "reader-errors-test"},
    "shared": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "reader-errors-test-shared"},
}


@override_settings(CACHES=LOCMEM, ROOT_URLCONF="sefaria.urls_library")
class ReaderErrorsApiTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        cache.clear()
        # like a browser's beacon: no CSRF token, no session
        self.client = Client(enforce_csrf_checks=True)
        p = patch.object(browser_errors, "logger")
        self.logger = p.start()
        self.addCleanup(p.stop)

    def post(self, body, content_type="application/json", **extra):
        data = body if isinstance(body, (str, bytes)) else json.dumps(body)
        return self.client.post(URL, data, content_type=content_type, **extra)

    def logged(self):
        self.assertEqual(self.logger.warning.call_count, 1)
        (event,) = self.logger.warning.call_args.args
        self.assertEqual(event, "reader_browser_error")
        return self.logger.warning.call_args.kwargs

    def test_a_beacon_is_204_without_csrf_or_session_and_logs_one_line(self):
        res = self.post(REPORT, HTTP_COOKIE="sessionid=secret-session; csrftoken=abc")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.content, b"")
        fields = self.logged()
        self.assertEqual(
            fields,
            {
                "kind": "error",
                "message": REPORT["message"],
                "path": "/Genesis.1",
                "stack": REPORT["stack"],
                "source": REPORT["source"],
                "release": "v7.11.4-prod.2",
                "route": "reader",
                "ua": "chrome-desktop",
                "signed_in": False,
                "sample_rate": 1,
                "page_ms": 1234,
            },
        )
        self.assertNotIn("secret-session", json.dumps(fields))

    def test_text_plain_beacon_accepted(self):
        self.assertEqual(self.post(json.dumps(REPORT), content_type="text/plain").status_code, 204)

    def test_unknown_fields_dropped_query_strings_and_emails_scrubbed(self):
        report = dict(
            REPORT,
            path="/Genesis.1?lang=bi&with=Rashi#v3",
            message="failed at /search?q=secret-words for reader@example.com",
            stack="at https://www.sefaria.org/x.js?token=abc:1:2",
            cookie="sessionid=leak",
            userId=42,
        )
        self.assertEqual(self.post(report).status_code, 204)
        fields = self.logged()
        self.assertEqual(fields["path"], "/Genesis.1")
        self.assertEqual(fields["message"], "failed at /search for [email]")
        self.assertNotIn("token=abc", fields["stack"])
        self.assertNotIn("cookie", fields)
        self.assertNotIn("userId", fields)
        self.assertNotRegex(json.dumps(fields), r"secret-words|reader@example|lang=bi|leak")

    def test_long_fields_are_capped(self):
        self.assertEqual(self.post(dict(REPORT, message="m" * 2000, stack="s" * 9000)).status_code, 204)
        fields = self.logged()
        self.assertEqual(len(fields["message"]), 500)
        self.assertEqual(len(fields["stack"]), 4000)

    def test_boundary_kind(self):
        self.assertEqual(self.post(dict(REPORT, kind="boundary", boundary="panel")).status_code, 204)
        self.assertEqual(self.logged()["boundary"], "panel")

    def test_schema_violations_are_400_and_not_logged(self):
        bad = [
            "not json",
            [REPORT],
            dict(REPORT, v=2),
            dict(REPORT, kind="console"),
            dict(REPORT, message=None),
            dict(REPORT, path="https://evil.example/"),
            dict(REPORT, boundary="sidebar"),
            dict(REPORT, route="Reader Page!"),
            dict(REPORT, signedIn="yes"),
            dict(REPORT, sampleRate=2),
            dict(REPORT, t=True),
            dict(REPORT, release="<script>"),
            dict(REPORT, stack=["a"]),
        ]
        for body in bad:
            with self.subTest(body=str(body)[:60]):
                self.assertEqual(self.post(body).status_code, 400)
        self.logger.warning.assert_not_called()

    def test_release_left_out_when_null(self):
        self.assertEqual(self.post(dict(REPORT, release=None)).status_code, 204)
        self.assertNotIn("release", self.logged())

    def test_an_address_cut_by_the_cap_is_still_scrubbed(self):
        message = "m" * 490 + " reader@example.com"
        self.assertEqual(self.post(dict(REPORT, message=message)).status_code, 204)
        self.assertNotIn("reader@ex", self.logged()["message"])

    def test_over_16_kb_is_413(self):
        body = json.dumps(dict(REPORT, stack="s" * (17 * 1024)))
        self.assertEqual(self.post(body).status_code, 413)
        self.logger.warning.assert_not_called()

    def test_other_content_types_are_415(self):
        self.assertEqual(self.post("a=b", content_type="application/x-www-form-urlencoded").status_code, 415)

    def test_only_post(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 405)
        self.assertEqual(res["Allow"], "POST")

    def test_rate_limited_per_client_address(self):
        # the address nginx sets (X-Real-IP); which headers count, and the global cap: reader_errors_rate_limit_test.py
        a = {"HTTP_X_REAL_IP": "203.0.113.7"}
        for _ in range(browser_errors.RATE_LIMIT):
            self.assertEqual(self.post(REPORT, **a).status_code, 204)
        self.assertEqual(self.post(REPORT, **a).status_code, 429)
        # another address is not affected
        self.assertEqual(self.post(REPORT, HTTP_X_REAL_IP="203.0.113.8").status_code, 204)
        self.assertEqual(self.logger.warning.call_count, browser_errors.RATE_LIMIT + 1)


def test_library_host_only():
    assert resolve(URL, urlconf="sefaria.urls_library").func is browser_errors.reader_errors_api
    try:
        match = resolve(URL, urlconf="sefaria.urls_sheets")
    except Resolver404:
        return
    assert match.func is not browser_errors.reader_errors_api


ADVERSARIAL = {
    "letters": "a" * 16000,
    "dotted": "a." * 8000,
    "at then dotted": "x@" + "a." * 8000,
    "many ats": "a@" * 8000,
    "address-like runs": "a.b-c@" * 2700,
    "query marks": "?" * 16000,
}


@pytest.mark.parametrize("name", list(ADVERSARIAL))
def test_scrubbing_an_adversarial_16_kb_body_is_fast(name):
    """B1: the scrub patterns are bounded and run on the capped text, so no field of a 16 KB beacon backtracks for seconds."""
    text = ADVERSARIAL[name]
    report = dict(REPORT, message=text, stack=text, source=text, path="/" + text)
    started = time.perf_counter()
    out = browser_errors.validate(report)
    elapsed = time.perf_counter() - started
    assert out is not None
    assert elapsed < 0.05, f"{name}: {elapsed * 1000:.0f} ms"
