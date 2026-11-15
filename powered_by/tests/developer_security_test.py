"""
Security and abuse edges of developer settings: other ways to authenticate (N-CR1), developer
state written through the generic profile APIs (N-CR2), a per-account project cap (N-CR7),
deleted projects in the public gallery (N-CR14), key values in Sentry events (N-CR6) and framing
by another site (N-CR5).

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""

import json
import time
from unittest.mock import MagicMock, patch

import sentry_sdk
from django.contrib.auth.models import Group
from django.test import Client, override_settings
from sentry_sdk.transport import Transport

from powered_by import developer
from powered_by.models import ApiKey, ApiProject, Project
from powered_by.tests.developer_api_test import DeveloperApiTestCase
from sefaria.model.user_profile import UserProfile
from sefaria.settings_utils import scrub_api_keys
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
        client = Client(
            enforce_csrf_checks=True,
            HTTP_X_SESSION_ID=self.token,
            HTTP_X_CSRFTOKEN=CSRF_TOKEN,
            HTTP_REFERER="https://www.example.org/",
        )
        client.cookies["csrftoken"] = CSRF_TOKEN
        return client

    def test_N_CR1_the_state_is_not_served_to_the_session_id_header(self):
        response = Client().get("/api/developer/state", HTTP_X_SESSION_ID=self.token)

        self.assertEqual(response.status_code, 401)
        self.assertFalse(self.key_value in response.content.decode(), "the response carries the key value")

    def test_N_CR1_keys_cannot_be_created_or_revoked_with_the_session_id_header(self):
        client = self.header_client()

        created = client.post(
            "/api/developer/projects/{}/keys".format(self.project["id"]),
            json.dumps({"label": "Through the header"}),
            content_type="application/json",
        )
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
        self.assertIn(self.key_value[:10], response.content.decode())


class ProfileApiDeveloperStateTest(DeveloperApiTestCase):
    """N-CR2: developer_* settings sent by clients through the generic profile APIs are ignored."""

    FORGED = {
        developer.CONFIRMATION_SENDS_SETTING: [],
        developer.ENABLED_SETTING: True,
        developer.PROFILE_SETTING: {"developerName": "x" * 5000, "termsAccepted": False},
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

    def test_N_CR2_the_profile_api_ignores_developer_settings(self):
        response = self.client.post("/api/profile", {"json": json.dumps({"settings": self.FORGED})})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.developer_settings(), self.before)

    def test_N_CR2_profile_sync_ignores_developer_settings(self):
        settings = {**self.FORGED, "time_stamp": int(time.time()) + 1000}

        response = self.client.post("/api/profile/sync?no_return=1", {"settings": json.dumps(settings)})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.developer_settings(), self.before)

    def test_N_CR2_every_developer_setting_is_dropped(self):
        forged = {
            **self.FORGED,
            developer.CONFIRMATION_SENT_SETTING: "x",
            developer.CONFIRMATION_SENT_TO_SETTING: "x",
            "reading_history": False,
        }

        self.client.post("/api/profile", {"json": json.dumps({"settings": forged})})

        settings = UserProfile(id=self.user.id).settings
        self.assertIs(settings.get("reading_history"), False, "other settings still save")
        for key in developer.DEVELOPER_PROFILE_SETTINGS:
            self.assertEqual(settings.get(key), self.before.get(key), key)


class ProjectCapTest(DeveloperApiTestCase):
    """N-CR7: an account can have MAX_PROJECTS_PER_ACCOUNT projects, unless staff raise its limit."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def create(self, n):
        return self.call("post", "projects", {"project": {"name": f"Project {n}", "visibility": "private"}})

    def fill(self):
        for n in range(developer.MAX_PROJECTS_PER_ACCOUNT):
            self.assertEqual(self.create(n)[0], 200)

    def test_N_CR7_creating_projects_is_capped_per_account(self):
        self.fill()

        status, body = self.create("over")

        self.assertEqual(status, 400)
        self.assertIn(f"at most {developer.MAX_PROJECTS_PER_ACCOUNT} projects", body["error"])
        self.assertEqual(ApiProject.objects.filter(owner=self.user).count(), developer.MAX_PROJECTS_PER_ACCOUNT)

    def test_N_CR7_a_deleted_project_frees_a_slot(self):
        self.fill()
        self.call("delete", f"projects/{ApiProject.objects.filter(owner=self.user).first().id}")

        self.assertEqual(self.create("again")[0], 200)

    def test_N_CR7_staff_raise_the_cap_with_the_group(self):
        self.fill()
        self.user.groups.add(Group.objects.get_or_create(name=developer.RAISED_PROJECT_LIMIT_GROUP)[0])

        self.assertEqual(self.create("over")[0], 200)


class DeletedProjectGalleryTest(DeveloperApiTestCase):
    """N-CR14: a deleted developer project is never in the public gallery, whatever staff set."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_N_CR14_a_deleted_project_marked_published_is_not_public(self):
        project_id = self.create_project(visibility="public")["id"]
        self.assertEqual(self.call("delete", "projects/" + project_id)[0], 200)
        Project.objects.filter(api_projects__id=int(project_id)).update(is_published=True, request_not_to_publish=False)
        profile_id = ApiProject.objects.get(id=int(project_id)).profile_id

        response = Client().get("/api/powered-by")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(profile_id, [p["id"] for p in json.loads(response.content)["projects"]])


class FrameProtectionTest(DeveloperApiTestCase):
    """N-CR5: settings and login pages refuse to be framed by another site."""

    def assert_not_frameable(self, response):
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get("X-Frame-Options"), "DENY")

    def test_N_CR5_the_settings_pages_cannot_be_framed(self):
        self.assert_not_frameable(self.client.get("/settings/account"))
        self.assert_not_frameable(self.client.get("/settings/developer"))

    def test_N_CR5_the_login_and_register_pages_cannot_be_framed(self):
        self.assert_not_frameable(Client().get("/login"))
        self.assert_not_frameable(Client().get("/register"))

    def test_N_CR5_the_confirmation_link_pages_cannot_be_framed(self):
        self.verify_email()
        self.assert_not_frameable(
            Client().get("/settings/developer/confirm-email/" + developer.confirmation_for(self.user).key)
        )
        self.assert_not_frameable(Client().get("/settings/developer/email-confirmed"))

    def test_N_CR5_the_password_reset_request_endpoint_is_a_json_api_and_is_not_decorated(self):
        # The confirm page renders HTML a site could frame, so it sends DENY. The request endpoint
        # (sso.views.password_reset_api) is deliberately undecorated: it answers JSON only, with no page to frame.
        response = Client().post("/api/auth/password/reset", "not json", content_type="application/json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertIsNone(response.get("X-Frame-Options"))

    def test_N_CR5_a_normal_reader_page_can_still_be_framed(self):
        response = Client().get("/texts")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get("X-Frame-Options"))


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
        with (
            patch("sefaria.settings_utils.remoteConfigCache", remote_config),
            patch("sefaria.settings_utils.sentry_sdk.init", side_effect=init_with_capture),
        ):
            from sefaria.settings_utils import init_sentry

            init_sentry("https://public@sentry.example.invalid/1", "test", "test")

    def tearDown(self):
        client = sentry_sdk.get_client()
        client.close()
        sentry_sdk.get_global_scope().set_client(None)
        super().tearDown()

    def test_N_CR6_a_sentry_event_from_a_developer_view_carries_no_key_value(self):
        def failing_json_response(data, callback=None, status=200):
            raise RuntimeError("could not serialise the developer state")

        with (
            patch("powered_by.developer_views.jsonResponse", side_effect=failing_json_response),
            self.assertRaises(RuntimeError),
        ):
            self.client.get("/api/developer/state")
        sentry_sdk.flush()

        events = "\n".join(self.transport.payloads)
        self.assertIn("could not serialise the developer state", events)
        self.assertFalse(self.key_value[:12] in events, "the Sentry event carries the key value")


def test_N_CR6_scrub_api_keys_replaces_key_values_at_any_depth():
    key = "sfr_" + "Ab1" * 10 + "Cd"
    event = {"message": "bad key " + key, "frames": [{"vars": {"value": f"'{key}'", "n": 3}}], "extra": ("x", key)}

    scrubbed = scrub_api_keys(event)

    assert key[:8] not in json.dumps(scrubbed)
    assert scrubbed["message"] == "bad key sfr_[Filtered]"
    assert scrubbed["frames"][0]["vars"]["n"] == 3


def _sentry_hooks():
    remote_config = MagicMock()
    remote_config.get.return_value = {}
    with (
        patch("sefaria.settings_utils.remoteConfigCache", remote_config),
        patch("sefaria.settings_utils.sentry_sdk.init") as init,
    ):
        from sefaria.settings_utils import init_sentry

        init_sentry("https://public@sentry.example.invalid/1", "test", "test")
    return init.call_args.kwargs


def test_scrub_api_keys_also_replaces_a_key_with_a_percent_encoded_prefix():
    assert scrub_api_keys("/x?q=sfr%5FAb1Cd2Ef3") == "/x?q=sfr_[Filtered]"
    assert scrub_api_keys("/x?q=%73fr_Ab1Cd2Ef3") == "/x?q=sfr_[Filtered]"


def test_a_sentry_transaction_event_carries_no_key_value():
    key = "sfr_" + "Ab1" * 10 + "Cd"
    event = {
        "type": "transaction",
        "request": {"url": f"https://www.sefaria.org/api/texts?x={key}", "headers": {"x-api-key": key}},
        "transaction": "/api/texts",
    }

    scrubbed = _sentry_hooks()["before_send_transaction"](event, {})

    assert key[:8] not in json.dumps(scrubbed)
    assert scrubbed["request"]["headers"]["x-api-key"] == "sfr_[Filtered]"


def test_scrub_api_keys_replaces_a_key_whose_body_is_percent_encoded():
    cases = {
        "/?q=sfr_%41" + "A" * 31: "/?q=sfr_[Filtered]",
        "/?q=sfr_Ab%31Cd2Ef3Gh4Ij5": "/?q=sfr_[Filtered]",
        "/?q=sfr_" + "%41" * 32 + "&x=1": "/?q=sfr_[Filtered]&x=1",
        "/?q=sfr_%2541b12Cd34Ef56Gh78": "/?q=sfr_[Filtered]",
        "/?q=%73fr%5f%41b12Cd34": "/?q=sfr_[Filtered]",
    }
    for raw, want in cases.items():
        assert scrub_api_keys(raw) == want, raw
    assert scrub_api_keys({"url": "/?q=sfr_%41" + "A" * 31}) == {"url": "/?q=sfr_[Filtered]"}
    # Sentry keeps its any-length threshold (it over-redacts rather than risk a leak); a bare prefix has no body to redact.
    assert scrub_api_keys("sfr_ alone and transfr") == "sfr_ alone and transfr"


class NoStoreTest(DeveloperApiTestCase):
    """Responses that carry full key values are never kept by an HTTP cache."""

    def assert_no_store(self, response):
        directives = {d.strip() for d in response["Cache-Control"].split(",")}
        self.assertIn("no-store", directives)
        self.assertIn("private", directives)

    def test_a_developer_state_response_is_private_and_no_store(self):
        self.set_up_developer()
        response = self.client.get("/api/developer/state")

        self.assertEqual(response.status_code, 200)
        self.assert_no_store(response)

    def test_a_key_creation_response_and_an_error_response_are_private_and_no_store(self):
        self.set_up_developer()
        project = self.create_project()
        created = self.client.post(
            "/api/developer/projects/{}/keys".format(project["id"]),
            json.dumps({"label": "Cache check"}),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 200)
        self.assert_no_store(created)
        self.assert_no_store(Client().get("/api/developer/state"))

    def test_the_settings_page_of_a_developer_is_private_and_no_store(self):
        self.set_up_developer()
        response = self.client.get("/settings/developer")

        self.assertEqual(response.status_code, 200)
        self.assert_no_store(response)

    def test_the_account_settings_page_embeds_the_developer_state_and_is_no_store_too(self):
        response = self.client.get("/settings/account")

        self.assertEqual(response.status_code, 200)
        self.assert_no_store(response)

    def test_a_reader_page_is_unchanged(self):
        response = Client().get("/texts")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("no-store", response.get("Cache-Control", ""))

    @override_settings(DEVELOPER_SETTINGS_ENABLED=False)
    def test_the_account_settings_page_with_developer_settings_off_carries_no_developer_state_and_is_unchanged(self):
        response = self.client.get("/settings/account")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("no-store", response.get("Cache-Control", ""))


def test_scrub_api_keys_handles_a_double_encoded_prefix_and_a_left_boundary():
    body = "Ab1Cd2Ef3Gh4"
    for raw, want in {
        "/?q=%2573%2566%2572%255f" + body: "/?q=sfr_[Filtered]",
        "/?q=sfr%255F" + body: "/?q=sfr_[Filtered]",
        "sfr_" + body: "sfr_[Filtered]",
        "bad key sfr_" + body: "bad key sfr_[Filtered]",
        "/?q=x%3Dsfr_" + body: "/?q=x%3Dsfr_[Filtered]",
        "/a/sfr_" + body + "/b": "/a/sfr_[Filtered]/b",
    }.items():
        assert scrub_api_keys(raw) == want, raw
    for untouched in ("/?q=newsfr_campaign2024", "my_sfr_campaign2024", "/?q=2sfr_campaign2024"):
        assert scrub_api_keys(untouched) == untouched, untouched
