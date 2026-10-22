"""
Security and abuse edges of developer settings: other ways to authenticate (N-CR1), developer
state written through the generic profile APIs (N-CR2), a per-account project cap (N-CR7),
deleted projects in the public gallery (N-CR14), the test controls outside cauldrons (N-CR18)
and key values in Sentry events (N-CR6).

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""
import json
import time
from unittest.mock import MagicMock, patch

import pytest
import sentry_sdk
from allauth.account.models import EmailAddress
from django.test import Client, override_settings
from sentry_sdk.transport import Transport

from powered_by import developer
from powered_by.models import ApiKey, Project
from powered_by.tests.developer_api_test import DeveloperApiTestCase
from sefaria.model.user_profile import UserProfile
from sefaria.utils.chatbot import build_chatbot_user_token

CHATBOT_SECRET = "developer-security-test-secret"
CSRF_TOKEN = "d8" * 16


@override_settings(CHATBOT_USER_ID_SECRET=CHATBOT_SECRET)
class SessionIdHeaderTest(DeveloperApiTestCase):
    """N-CR1: the developer API accepts a session cookie login only, not the X-Session-ID header."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()
        self.key_id = self.create_key(self.project["id"])["keyId"]
        self.key_value = ApiKey.objects.get(id=self.key_id).key
        self.token = build_chatbot_user_token(self.user.id, CHATBOT_SECRET)

    def header_client(self):
        client = Client(enforce_csrf_checks=True, HTTP_X_SESSION_ID=self.token,
                        HTTP_X_CSRFTOKEN=CSRF_TOKEN, HTTP_REFERER="https://www.example.org/")
        client.cookies["csrftoken"] = CSRF_TOKEN
        return client

    def test_N_CR1_the_state_is_not_served_to_the_session_id_header(self):
        response = Client().get("/api/developer/state", HTTP_X_SESSION_ID=self.token)

        self.assertEqual(response.status_code, 401)
        self.assertFalse(self.key_value in response.content.decode(), "the response carries the key value")

    def test_N_CR1_keys_cannot_be_created_or_revoked_with_the_session_id_header(self):
        client = self.header_client()

        created = client.post("/api/developer/projects/{}/keys".format(self.project["id"]),
                              json.dumps({"label": "Through the header"}), content_type="application/json")
        revoked = client.delete("/api/developer/keys/" + self.key_id)

        self.assertEqual(created.status_code, 401)
        self.assertEqual(revoked.status_code, 401)
        self.assertEqual(ApiKey.objects.filter(project_id=int(self.project["id"])).count(), 1)
        self.assertIsNone(ApiKey.objects.get(id=self.key_id).revoked_at)

    def test_N_CR1_the_settings_page_carries_no_developer_state_for_the_session_id_header(self):
        response = Client().get("/settings/developer", HTTP_X_SESSION_ID=self.token)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.key_value in response.content.decode(), "the page carries the key value")

    def test_N_CR1_a_session_login_with_the_header_still_works(self):
        response = self.client.get("/api/developer/state", HTTP_X_SESSION_ID=self.token)

        self.assertEqual(response.status_code, 200)
        self.assertIn(self.key_value, response.content.decode())


class ProfileApiDeveloperStateTest(DeveloperApiTestCase):
    """N-CR2: developer_* settings sent by clients through the generic profile APIs are ignored."""

    FORGED = {
        developer.CONFIRMATION_SENDS_SETTING: [],
        developer.ENABLED_SETTING: True,
        developer.PROFILE_SETTING: {"developerName": "x" * 5000, "termsAccepted": False},
        developer.DISMISSED_LISTINGS_SETTING: [1, 2, 3],
    }

    def setUp(self):
        super().setUp()
        profile = UserProfile(id=self.user.id)
        profile.settings[developer.CONFIRMATION_SENDS_SETTING] = [developer.iso(developer.timezone.now())] * 5
        profile.save()
        self.before = self.developer_settings()

    def developer_settings(self):
        settings = UserProfile(id=self.user.id).settings
        return {k: settings.get(k) for k in self.FORGED}

    @pytest.mark.failing
    def test_N_CR2_the_profile_api_ignores_developer_settings_known_gap_N_CR2(self):
        response = self.client.post("/api/profile", {"json": json.dumps({"settings": self.FORGED})})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.developer_settings(), self.before)

    @pytest.mark.failing
    def test_N_CR2_profile_sync_ignores_developer_settings_known_gap_N_CR2(self):
        settings = {**self.FORGED, "time_stamp": int(time.time()) + 1000}

        response = self.client.post("/api/profile/sync?no_return=1", {"settings": json.dumps(settings)})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.developer_settings(), self.before)


class ProjectCapTest(DeveloperApiTestCase):
    """N-CR7: one account cannot create projects without limit."""

    ATTEMPTS = 25

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    @pytest.mark.failing
    def test_N_CR7_creating_projects_is_capped_per_account_known_gap_N_CR7(self):
        statuses = [self.call("post", "projects", {"project": {"name": "Project {}".format(n), "visibility": "private"}})[0]
                    for n in range(self.ATTEMPTS)]

        self.assertTrue(set(statuses) - {200}, "all {} projects were created".format(self.ATTEMPTS))
        self.assertLess(Project.objects.filter(owner=self.user).count(), self.ATTEMPTS)


class DeletedProjectGalleryTest(DeveloperApiTestCase):
    """N-CR14: a deleted developer project is never in the public gallery, whatever staff set."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    @pytest.mark.failing
    def test_N_CR14_a_deleted_project_marked_published_is_not_public_known_gap_N_CR14(self):
        project_id = self.create_project(visibility="public")["id"]
        self.assertEqual(self.call("delete", "projects/" + project_id)[0], 200)
        Project.objects.filter(id=int(project_id)).update(is_published=True)

        response = Client().get("/api/powered-by")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(int(project_id), [p["id"] for p in json.loads(response.content)["projects"]])


@override_settings(DEVELOPER_SETTINGS_MOCKS=True, ALLOWED_HOSTS=["*"])
class MocksOutsideCauldronsTest(DeveloperApiTestCase):
    """N-CR18: the test controls refuse on a production host even if the mocks flag is on."""

    @pytest.mark.failing
    def test_N_CR18_the_test_controls_refuse_on_a_production_host_known_gap_N_CR18(self):
        response = self.client.post("/api/developer/mock", json.dumps({"action": "email-verified", "emailVerified": True}),
                                    content_type="application/json", HTTP_HOST="www.sefaria.org")

        self.assertEqual(response.status_code, 404)
        self.assertFalse(EmailAddress.objects.filter(user=self.user, verified=True).exists())


class CapturingTransport(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.payloads = []

    def capture_envelope(self, envelope):
        self.payloads.append(envelope.serialize().decode("utf-8", "replace"))


class SentryKeyValueTest(DeveloperApiTestCase):
    """N-CR6: an error in a developer view after the state is built sends no key value to Sentry."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.create_key(self.create_project()["id"])
        self.key_value = ApiKey.objects.get(project__owner=self.user).key
        self.transport = CapturingTransport()
        real_init = sentry_sdk.init

        def init_with_capture(*args, **kwargs):
            return real_init(*args, **{**kwargs, "transport": self.transport, "sample_rate": 1.0})

        remote_config = MagicMock()
        remote_config.get.return_value = {}
        with patch("sefaria.settings_utils.remoteConfigCache", remote_config), \
                patch("sefaria.settings_utils.sentry_sdk.init", side_effect=init_with_capture):
            from sefaria.settings_utils import init_sentry
            init_sentry("https://public@sentry.example.invalid/1", "test", "test")

    def tearDown(self):
        client = sentry_sdk.get_client()
        client.close()
        sentry_sdk.get_global_scope().set_client(None)
        super().tearDown()

    @pytest.mark.failing
    def test_N_CR6_a_sentry_event_from_a_developer_view_carries_no_key_value_known_gap_N_CR6(self):
        def failing_json_response(data, callback=None, status=200):
            raise RuntimeError("could not serialise the developer state")

        with patch("powered_by.developer_views.jsonResponse", side_effect=failing_json_response):
            with self.assertRaises(RuntimeError):
                self.client.get("/api/developer/state")
        sentry_sdk.flush()

        events = "\n".join(self.transport.payloads)
        self.assertIn("could not serialise the developer state", events)
        self.assertFalse(self.key_value[:12] in events, "the Sentry event carries the key value")
