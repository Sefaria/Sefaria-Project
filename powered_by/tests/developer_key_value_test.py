"""
A key's value is sent only by the key value endpoint, when its owner asks: never in a state response, the settings
page HTML or a log line.
"""

import json
import logging

from django.conf import settings
from django.core.cache import cache
from django.test import Client, override_settings
from django.utils import timezone

from powered_by import developer
from powered_by.models import ApiKey
from powered_by.tests.developer_api_test import PROFILE, DeveloperApiTestCase, create_test_user, purge_test_profiles
from sefaria.model.user_profile import UserProfile

# The throttle needs a working cache; the one this suite runs against may be a Redis that is not there.
LOCAL_CACHES = {
    alias: {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "key-value-" + alias}
    for alias in settings.CACHES
}


@override_settings(CACHES=LOCAL_CACHES)
class KeyValueTestCase(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.set_up_developer()
        self.project = self.create_project()
        created = self.create_key(self.project["id"])
        self.key_id = created["keyId"]
        self.value = created["keyValue"]

    def tearDown(self):
        cache.clear()
        super().tearDown()

    def url(self, key_id=None):
        return f"/api/developer/keys/{key_id or self.key_id}/value"

    def other_developer_client(self):
        """A client logged in as another account that has set up developer settings."""
        other = create_test_user("devapiother")
        self.addCleanup(purge_test_profiles, other)
        profile = UserProfile(id=other.id)
        profile.settings[developer.ENABLED_SETTING] = True
        profile.settings[developer.PROFILE_SETTING] = PROFILE
        profile.save()
        client = Client()
        client.force_login(other)
        return client

    def reveal(self, key_id=None, client=None):
        return (client or self.client).post(self.url(key_id), "{}", content_type="application/json")


class StateCarriesNoValueTest(KeyValueTestCase):
    def test_the_state_response_has_the_display_prefix_and_no_value(self):
        response = self.client.get("/api/developer/state")

        key = json.loads(response.content)["projects"][0]["keys"][0]
        self.assertEqual(key["prefix"], self.value[:10])
        self.assertNotIn("value", key)
        self.assertNotIn(self.value, response.content.decode())
        self.assertNotIn(self.value[10:], response.content.decode())

    def test_every_state_returning_response_after_creation_has_no_value_in_the_state(self):
        created = self.create_key(self.project["id"], "Second")
        self.assertRegex(created["keyValue"], r"^sfr_")
        self.assertNotIn(created["keyValue"], json.dumps(created["projects"]))
        status, state = self.call("post", "keys/" + self.key_id, {"restrictToWebsite": True})
        self.assertEqual(status, 200)
        self.assertNotIn(self.value, json.dumps(state))
        self.assertNotIn("keyValue", state)

    def test_key_creation_still_returns_the_value_once(self):
        self.assertEqual(self.value, ApiKey.objects.get(id=self.key_id).key)

    def test_the_settings_page_html_has_no_key_value(self):
        for url in ("/settings/developer", "/settings/developer/projects/" + self.project["id"], "/settings/account"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            html = response.content.decode("utf-8")
            self.assertNotIn(self.value[10:], html, url)


class KeyValueEndpointTest(KeyValueTestCase):
    def test_the_owner_gets_the_value_with_no_store_headers(self):
        response = self.reveal()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {"value": self.value})
        directives = {d.strip() for d in response["Cache-Control"].split(",")}
        self.assertTrue({"private", "no-store"} <= directives)
        self.assertIn("Cookie", response["Vary"])

    def test_a_get_is_a_405(self):
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, 405)
        self.assertNotIn(self.value, response.content.decode())

    def test_a_post_without_a_csrf_token_is_a_403(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)

        response = self.reveal(client=client)

        self.assertEqual(response.status_code, 403)
        self.assertNotIn(self.value, response.content.decode())

    def test_a_logged_out_request_is_a_401(self):
        response = self.reveal(client=Client())

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(self.value, response.content.decode())

    def test_another_accounts_key_and_an_unknown_key_are_the_same_404(self):
        other_client = self.other_developer_client()
        unknown = "00000000-0000-4000-8000-000000000000"

        not_yours = self.reveal(client=other_client)
        missing = self.reveal(unknown)
        malformed = self.reveal("not-a-uuid")

        self.assertEqual(not_yours.status_code, 404)
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(malformed.status_code, 404)
        self.assertEqual(not_yours.content, missing.content)
        self.assertEqual(not_yours.content, malformed.content)
        self.assertNotIn(self.value, not_yours.content.decode())

    def test_a_revoked_key_is_a_404(self):
        self.call("delete", "keys/" + self.key_id)

        response = self.reveal()

        self.assertEqual(response.status_code, 404)
        self.assertNotIn(self.value, response.content.decode())

    def test_a_key_of_a_deleted_project_is_a_404(self):
        self.call("delete", "projects/" + self.project["id"])
        ApiKey.objects.filter(id=self.key_id).update(revoked_at=None)

        self.assertEqual(self.reveal().status_code, 404)

    def test_over_the_limit_is_a_429_with_retry_after_and_no_value(self):
        for _ in range(developer.REVEAL_LIMIT):
            self.assertEqual(self.reveal().status_code, 200)

        response = self.reveal()

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response["Retry-After"], str(developer.REVEAL_WINDOW))
        self.assertNotIn(self.value, response.content.decode())

    def test_failed_lookups_count_against_the_limit(self):
        unknown = "00000000-0000-4000-8000-000000000000"
        for _ in range(developer.REVEAL_LIMIT):
            self.assertEqual(self.reveal(unknown).status_code, 404)

        self.assertEqual(self.reveal().status_code, 429)

    def test_the_limit_is_per_account(self):
        other_client = self.other_developer_client()
        for _ in range(developer.REVEAL_LIMIT + 1):
            self.reveal()

        self.assertEqual(self.reveal().status_code, 429)
        self.assertEqual(self.reveal(client=other_client).status_code, 404)

    def test_the_account_must_have_developer_settings_set_up(self):
        purge_test_profiles(self.user)

        self.assertEqual(self.reveal().status_code, 403)

    @override_settings(DEVELOPER_SETTINGS_ENABLED=False)
    def test_with_developer_settings_off_it_is_a_404(self):
        self.assertEqual(self.reveal().status_code, 404)

    @override_settings(DEVELOPER_SETTINGS_STAFF_ONLY=True)
    def test_staff_only_settings_hide_it_from_other_accounts(self):
        self.assertEqual(self.reveal().status_code, 404)


class KeyValueLoggingTest(KeyValueTestCase):
    def test_the_audit_line_has_the_user_and_the_prefix_but_not_the_value(self):
        with self.assertLogs("powered_by.key_reveal", level=logging.INFO) as logs:
            self.assertEqual(self.reveal().status_code, 200)

        self.assertEqual(len(logs.output), 1)
        line = logs.output[0]
        self.assertIn(self.value[:10], line)
        self.assertIn(str(self.user.id), line)
        self.assertNotIn(self.value[10:], line)

    def test_no_log_record_of_any_logger_holds_the_value(self):
        with self.assertLogs(level=logging.DEBUG) as logs:
            logging.getLogger("test").debug("marker")
            self.assertEqual(self.reveal().status_code, 200)
            self.reveal("00000000-0000-4000-8000-000000000000")

        self.assertGreater(len(logs.records), 1)
        for record in logs.records:
            self.assertNotIn(self.value[10:], record.getMessage())

    def test_a_refused_reveal_is_not_audited_as_a_reveal(self):
        with self.assertLogs("powered_by.key_reveal", level=logging.INFO) as logs:
            logging.getLogger("powered_by.key_reveal").info("marker")
            self.reveal("00000000-0000-4000-8000-000000000000")

        self.assertEqual(logs.output, ["INFO:powered_by.key_reveal:marker"])
