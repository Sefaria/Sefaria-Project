from unittest import mock

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.helper import library_assistant
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db


@mock.patch("sefaria.helper.library_assistant.notify_crm_of_change")
class EnableLibraryAssistantViewTest(TestCase):
    """
    The promo CTA sends anon users through login/register with this view as the ?next=
    target. Landing here must write settings.library_assistant = True for the now-
    authenticated user and bounce them back to where they were, so the assistant
    appears on that reload with no extra "Join" click.
    """
    databases = "__all__"
    url = "/enable-library-assistant"

    def setUp(self):
        self.user = create_test_user("la-enable")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def assertAssistantOn(self):
        self.assertTrue(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def stored_setting(self):
        profile = db.profiles.find_one({"id": self.user.id}) or {}
        return profile.get("settings", {}).get(SETTING_KEY, "<absent>")

    def test_authenticated_user_is_enabled_and_redirected_back(self, _mock_notify):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1")
        self.assertAssistantOn()

    def test_anonymous_user_is_sent_to_login_and_not_enabled(self, _mock_notify):
        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        # redirect_to_login bounces to LOGIN_URL, preserving this page as ?next=
        self.assertIn("/login", response.url)
        self.assertEqual(self.stored_setting(), "<absent>")

    def test_offsite_next_falls_back_to_home(self, _mock_notify):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "https://evil.example.com/phish"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")
        # Still enabled — only the unsafe redirect target is dropped.
        self.assertAssistantOn()

    def test_welcome_param_forwarded_to_destination(self, _mock_notify):
        # The register flow appends ?welcome=to-sefaria to its redirect target;
        # the hop through this view must forward it so the new-user welcome still shows.
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1", "welcome": "to-sefaria"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1?welcome=to-sefaria")

    def test_missing_next_defaults_to_home(self, _mock_notify):
        self.client.force_login(self.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")

    def test_second_visit_is_idempotent(self, mock_notify):
        self.client.force_login(self.user)
        self.client.get(self.url, {"next": "/Genesis.1"})  # first visit fires webhook
        mock_notify.reset_mock()

        response = self.client.get(self.url, {"next": "/Exodus.1"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Exodus.1")
        self.assertAssistantOn()
        # No state change on the second visit → no duplicate CRM webhook.
        mock_notify.assert_not_called()

    def test_protocol_relative_next_falls_back_to_home(self, _mock_notify):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "//evil.example.com/phish"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")

    def test_welcome_param_appended_to_existing_query_string(self, _mock_notify):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1?ref=promo", "welcome": "to-sefaria"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1?ref=promo&welcome=to-sefaria")

    def test_cross_site_request_is_not_enabled(self, _mock_notify):
        # A cross-site subresource load must not silently opt a logged-in user in.
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1"}, HTTP_SEC_FETCH_SITE="cross-site")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1")
        self.assertEqual(self.stored_setting(), "<absent>")
