import uuid
from unittest import mock

from django.test import TestCase
from emailusernames.utils import create_user

from reader.models import UserExperimentSettings
from sefaria.system.database import db


@mock.patch("reader.models.dispatch_chatbot_opt_in_webhook")
class LoginAutoEnrollTest(TestCase):
    """
    Existing account holders who have never made a Library Assistant choice are
    auto-enrolled when they log in, so the assistant opens for them automatically.
    Users who already hold a preference — enabled or disabled — are left untouched.
    """
    databases = "__all__"
    url = "/login"
    password = "password"

    def setUp(self):
        token = uuid.uuid4().hex
        self.email = f"la-login-{token}@example.com"
        # emailusernames stores a hashed email in the username column; its own
        # create_user is required for the email auth backend to find the user.
        self.user = create_user(self.email, self.password)
        db.profiles.delete_many({"id": self.user.id})

    def tearDown(self):
        db.profiles.delete_many({"id": self.user.id})
        UserExperimentSettings.objects.filter(user=self.user).delete()

    def login(self):
        return self.client.post(self.url, {"email": self.email, "password": self.password})

    def test_never_enrolled_user_is_enrolled_on_login(self, mock_dispatch):
        response = self.login()

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            UserExperimentSettings.objects.filter(user=self.user, experiments=True).exists()
        )
        mock_dispatch.assert_called_once()

    def test_user_who_disabled_assistant_stays_disabled(self, mock_dispatch):
        UserExperimentSettings.objects.create(user=self.user, experiments=False)

        response = self.login()

        self.assertEqual(response.status_code, 302)
        settings = UserExperimentSettings.objects.get(user=self.user)
        self.assertFalse(settings.experiments)
        mock_dispatch.assert_not_called()

    def test_user_who_enabled_assistant_is_unchanged(self, mock_dispatch):
        UserExperimentSettings.objects.create(user=self.user, experiments=True)

        response = self.login()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(UserExperimentSettings.objects.filter(user=self.user).count(), 1)
        self.assertTrue(UserExperimentSettings.objects.get(user=self.user).experiments)
        mock_dispatch.assert_not_called()

    def test_failed_login_enrolls_nothing(self, mock_dispatch):
        response = self.client.post(self.url, {"email": self.email, "password": "wrong"})

        self.assertEqual(response.status_code, 200)  # form re-rendered with errors
        self.assertFalse(UserExperimentSettings.objects.filter(user=self.user).exists())
        mock_dispatch.assert_not_called()
