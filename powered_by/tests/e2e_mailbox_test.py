"""
The end-to-end test mailbox: which emails it keeps, and who may read them.
"""

import json
import re

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.http import Http404, HttpResponseNotFound
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import resolve

from powered_by import e2e_mailbox
from powered_by.tests.developer_api_test import DeveloperApiTestCase

TOKEN = "e2e-mailbox-test-token"
TEST_ADDRESS = "playwright+devsettings-1@sefaria-e2e.test"
REAL_ADDRESS = "someone@example.com"
# Only the default cache is swapped: the mailbox lives there, and the rest of the app expects its other aliases.
LOCMEM = {
    **settings.CACHES,
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "e2e-mailbox-test"},
}
ON = {"TEST_MAILBOX_ENABLED": True, "TEST_MAILBOX_TOKEN": TOKEN, "CACHES": LOCMEM}


def fetch(address, token=TOKEN, method="get"):
    """Call the view directly: a 404 from a full request renders the site's 404 page, which needs the library."""
    headers = {"HTTP_X_TEST_MAILBOX_TOKEN": token} if token is not None else {}
    request = getattr(RequestFactory(), method)("/api/test-mailbox/latest", {"to": address}, **headers)
    try:
        return e2e_mailbox.latest_api(request)
    except Http404:
        return HttpResponseNotFound()


@override_settings(**ON)
class MailboxTest(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_keeps_mail_to_a_test_address_with_its_links(self):
        e2e_mailbox.record([TEST_ADDRESS], "Confirm", "Open https://example.org/confirm/abc. Thanks")

        response = fetch(TEST_ADDRESS)

        self.assertEqual(response.status_code, 200)
        message = json.loads(response.content)
        self.assertEqual(message["to"], TEST_ADDRESS)
        self.assertEqual(message["subject"], "Confirm")
        self.assertEqual(message["links"], ["https://example.org/confirm/abc"])
        self.assertIn("sent_at", message)

    def test_returns_the_latest_message(self):
        e2e_mailbox.record([TEST_ADDRESS], "First", "https://example.org/1")
        e2e_mailbox.record([TEST_ADDRESS], "Second", "https://example.org/2")

        message = json.loads(fetch(TEST_ADDRESS).content)

        self.assertEqual(message["subject"], "Second")
        self.assertEqual(message["links"], ["https://example.org/2"])

    def test_address_match_ignores_case(self):
        e2e_mailbox.record([TEST_ADDRESS.upper()], "Confirm", "https://example.org/x")

        self.assertEqual(fetch(TEST_ADDRESS).status_code, 200)

    def test_does_not_keep_mail_to_other_addresses(self):
        e2e_mailbox.record([REAL_ADDRESS], "Confirm", "https://example.org/x")

        self.assertIsNone(cache.get(e2e_mailbox._key(REAL_ADDRESS)))
        self.assertEqual(fetch(REAL_ADDRESS).status_code, 404)

    def test_an_empty_mailbox_is_404(self):
        response = fetch(TEST_ADDRESS)

        self.assertEqual(response.status_code, 404)
        self.assertIn("error", json.loads(response.content))

    def test_a_wrong_or_missing_token_is_404(self):
        e2e_mailbox.record([TEST_ADDRESS], "Confirm", "https://example.org/x")

        self.assertEqual(fetch(TEST_ADDRESS, token="wrong").status_code, 404)
        self.assertEqual(fetch(TEST_ADDRESS, token=None).status_code, 404)
        self.assertEqual(fetch(TEST_ADDRESS, token="").status_code, 404)

    def test_only_get_is_allowed(self):
        self.assertEqual(fetch(TEST_ADDRESS, method="post").status_code, 405)

    def test_the_endpoint_is_routed(self):
        self.assertIs(resolve("/api/test-mailbox/latest", urlconf="sefaria.urls_library").func, e2e_mailbox.latest_api)


@override_settings(TEST_MAILBOX_ENABLED=False, TEST_MAILBOX_TOKEN=TOKEN, CACHES=LOCMEM)
class DisabledMailboxTest(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_nothing_is_kept_and_the_endpoint_is_404(self):
        e2e_mailbox.record([TEST_ADDRESS], "Confirm", "https://example.org/x")

        self.assertIsNone(cache.get(e2e_mailbox._key(TEST_ADDRESS)))
        self.assertEqual(fetch(TEST_ADDRESS).status_code, 404)

    @override_settings(TEST_MAILBOX_ENABLED=True, TEST_MAILBOX_TOKEN=None)
    def test_enabled_without_a_token_is_off(self):
        e2e_mailbox.record([TEST_ADDRESS], "Confirm", "https://example.org/x")

        self.assertIsNone(cache.get(e2e_mailbox._key(TEST_ADDRESS)))
        self.assertEqual(fetch(TEST_ADDRESS, token="").status_code, 404)


@override_settings(DEVELOPER_SETTINGS_ENABLED=True, **ON)
class ConfirmationEmailTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def use_address(self, address):
        self.user.email = address
        self.user.save()

    def test_the_confirmation_link_can_be_read_back_for_a_test_address(self):
        self.use_address(TEST_ADDRESS)

        status, _ = self.call("post", "confirmation")

        self.assertEqual(status, 200)
        sent_link = re.search(r"https?://\S+/settings/developer/confirm-email/\S+", mail.outbox[0].body).group(0)
        message = json.loads(fetch(TEST_ADDRESS).content)
        self.assertIn(sent_link, message["links"])
        self.assertEqual(message["subject"], mail.outbox[0].subject)

    def test_a_real_users_confirmation_email_is_sent_but_not_kept(self):
        status, _ = self.call("post", "confirmation")

        self.assertEqual(status, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(fetch(self.user.email).status_code, 404)
        self.assertIsNone(cache.get(e2e_mailbox._key(self.user.email)))
