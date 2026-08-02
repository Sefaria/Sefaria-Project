import uuid
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase

from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.system.database import db


def stored_setting(user_id):
    """The persisted value, or None if the user has never expressed a preference."""
    profile = db.profiles.find_one({"id": user_id}) or {}
    return profile.get("settings", {}).get(SETTING_KEY)


class EnableLibraryAssistantViewTest(TestCase):
    """
    Anon users who arrive via the Library Assistant promo CTA land here once
    login/register completes: the assistant is switched on and they're bounced back to
    where they were — no extra "Join" click.
    """
    databases = "__all__"
    url = "/enable-library-assistant"

    def setUp(self):
        token = uuid.uuid4().hex
        self.user = User.objects.create_user(
            username=f"la-optin-{token}",
            email=f"la-optin-{token}@example.com",
            password="password",
        )
        db.profiles.delete_many({"id": self.user.id})

    def tearDown(self):
        db.profiles.delete_many({"id": self.user.id})

    def _store_preference(self, enabled):
        db.profiles.update_one(
            {"id": self.user.id},
            {"$set": {"id": self.user.id, f"settings.{SETTING_KEY}": enabled}},
            upsert=True,
        )

    def test_authenticated_user_is_enabled_and_redirected_back(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1")
        self.assertTrue(stored_setting(self.user.id))

    def test_re_opt_in_after_opting_out(self):
        # The assistant is on by default, so this view earns its keep for a user who
        # previously turned it off and is now re-joining via the promo.
        self._store_preference(False)
        self.client.force_login(self.user)

        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        self.assertTrue(stored_setting(self.user.id))

    def test_anonymous_user_is_sent_to_login_and_not_enabled(self):
        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        # redirect_to_login bounces to LOGIN_URL, preserving this page as ?next=
        self.assertIn("/login", response.url)
        self.assertIsNone(stored_setting(self.user.id))

    def test_offsite_next_falls_back_to_home(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "https://evil.example.com/phish"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")
        # Still enabled — only the unsafe redirect target is dropped.
        self.assertTrue(stored_setting(self.user.id))

    def test_welcome_param_forwarded_to_destination(self):
        # The register flow appends ?welcome=to-sefaria to its redirect target;
        # the opt-in hop must forward it so the new-user welcome still shows.
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1", "welcome": "to-sefaria"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1?welcome=to-sefaria")

    def test_missing_next_defaults_to_home(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")

    def test_repeat_visit_is_idempotent_and_silent(self):
        self.client.force_login(self.user)
        self.client.get(self.url, {"next": "/Genesis.1"})

        with mock.patch("sefaria.helper.library_assistant.notify_crm_of_change") as notify:
            response = self.client.get(self.url, {"next": "/Exodus.1"})
            # No state change on the second visit → no duplicate CRM webhook.
            notify.assert_not_called()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Exodus.1")
        self.assertTrue(stored_setting(self.user.id))
        self.assertEqual(db.profiles.count_documents({"id": self.user.id}), 1)

    def test_protocol_relative_next_falls_back_to_home(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "//evil.example.com/phish"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")

    def test_welcome_param_appended_to_existing_query_string(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1?ref=promo", "welcome": "to-sefaria"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1?ref=promo&welcome=to-sefaria")

    def test_cross_site_request_does_not_change_the_setting(self):
        # A cross-site subresource load must not silently flip a logged-in user's setting.
        self._store_preference(False)
        self.client.force_login(self.user)

        response = self.client.get(self.url, {"next": "/Genesis.1"}, HTTP_SEC_FETCH_SITE="cross-site")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1")
        self.assertFalse(stored_setting(self.user.id))
