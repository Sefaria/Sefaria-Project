import uuid
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase

from reader.models import UserExperimentSettings
from sefaria.system.database import db


@mock.patch("reader.models.dispatch_chatbot_opt_in_webhook")
class EnableLibraryAssistantViewTest(TestCase):
    """
    Anon users who arrive via the Library Assistant promo CTA should be auto-enrolled
    in the experiments whitelist once login/register completes, then bounced back to
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
        UserExperimentSettings.objects.filter(user=self.user).delete()

    def test_authenticated_user_is_enrolled_and_redirected_back(self, _mock_dispatch):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1")
        self.assertTrue(
            UserExperimentSettings.objects.filter(user=self.user, experiments=True).exists()
        )

    def test_anonymous_user_is_sent_to_login_and_not_enrolled(self, _mock_dispatch):
        response = self.client.get(self.url, {"next": "/Genesis.1"})

        self.assertEqual(response.status_code, 302)
        # redirect_to_login bounces to LOGIN_URL, preserving this page as ?next=
        self.assertIn("/login", response.url)
        self.assertEqual(UserExperimentSettings.objects.count(), 0)

    def test_offsite_next_falls_back_to_home(self, _mock_dispatch):
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "https://evil.example.com/phish"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")
        # Still enrolled — only the unsafe redirect target is dropped.
        self.assertTrue(
            UserExperimentSettings.objects.filter(user=self.user, experiments=True).exists()
        )

    def test_welcome_param_forwarded_to_destination(self, _mock_dispatch):
        # The register flow appends ?welcome=to-sefaria to its redirect target;
        # the opt-in hop must forward it so the new-user welcome still shows.
        self.client.force_login(self.user)
        response = self.client.get(self.url, {"next": "/Genesis.1", "welcome": "to-sefaria"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Genesis.1?welcome=to-sefaria")

    def test_missing_next_defaults_to_home(self, _mock_dispatch):
        self.client.force_login(self.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/")

    def test_already_enrolled_is_idempotent(self, mock_dispatch):
        self.client.force_login(self.user)
        self.client.get(self.url, {"next": "/Genesis.1"})  # first enroll fires webhook
        mock_dispatch.reset_mock()

        response = self.client.get(self.url, {"next": "/Exodus.1"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/Exodus.1")
        self.assertTrue(
            UserExperimentSettings.objects.filter(user=self.user, experiments=True).exists()
        )
        # No state change on the second visit → no duplicate CRM webhook.
        mock_dispatch.assert_not_called()
