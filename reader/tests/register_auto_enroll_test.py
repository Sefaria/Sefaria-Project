import urllib.error
import uuid
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django_recaptcha.client import RecaptchaResponse

from reader.models import UserExperimentSettings
from sefaria.settings import MOBILE_APP_KEY
from sefaria.system.database import db


@mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("no gravatar in tests"))
@mock.patch("django_recaptcha.fields.client.submit", return_value=RecaptchaResponse(is_valid=True))
@mock.patch("reader.models.dispatch_chatbot_opt_in_webhook")
class RegisterAutoEnrollTest(TestCase):
    """
    Every newly registered user is automatically enrolled in the Library Assistant
    experiment, no matter which registration flow they came through. Enrollment at
    registration is what makes the assistant open on first load: the widget mounts
    with default-open once the user is enabled, and a brand-new user has no stored
    widget state to override that.
    """
    databases = "__all__"

    def setUp(self):
        token = uuid.uuid4().hex
        self.email = f"la-register-{token}@example.com"
        self.form_data = {
            "email": self.email,
            "first_name": "Test",
            "last_name": "User",
            "password1": f"pw-{token}",
            "g-recaptcha-response": "PASSED",
        }

    def tearDown(self):
        user = User.objects.filter(email=self.email).first()
        if user:
            db.profiles.delete_many({"id": user.id})
            UserExperimentSettings.objects.filter(user=user).delete()

    def _assert_enrolled(self):
        user = User.objects.get(email=self.email)
        self.assertTrue(
            UserExperimentSettings.objects.filter(user=user, experiments=True).exists()
        )
        profile = db.profiles.find_one({"id": user.id})
        self.assertIsNotNone(profile)
        self.assertTrue(profile.get("experiments"))
        return user

    def test_web_form_registration_enrolls_user(self, mock_dispatch, _mock_captcha, _mock_urlopen):
        response = self.client.post("/register/", self.form_data)

        self.assertEqual(response.status_code, 302)
        user = self._assert_enrolled()
        mock_dispatch.assert_called_once()
        self.assertEqual(mock_dispatch.call_args[0][0], user.email)
        self.assertTrue(mock_dispatch.call_args[0][1])

    def test_web_form_registration_logs_user_in(self, _mock_dispatch, _mock_captcha, _mock_urlopen):
        self.client.post("/register/", self.form_data)

        user = User.objects.get(email=self.email)
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.id)

    def test_api_registration_enrolls_user(self, mock_dispatch, _mock_captcha, _mock_urlopen):
        # The API form keeps Django's password confirmation field.
        api_data = dict(
            self.form_data,
            password2=self.form_data["password1"],
            mobile_app_key=MOBILE_APP_KEY,
        )
        response = self.client.post("/api/register/", api_data)

        self.assertEqual(response.status_code, 200)
        self._assert_enrolled()
        mock_dispatch.assert_called_once()

    def test_invalid_registration_does_not_enroll(self, mock_dispatch, _mock_captcha, _mock_urlopen):
        bad_data = dict(self.form_data, password1="")
        response = self.client.post("/register/", bad_data)

        self.assertFalse(User.objects.filter(email=self.email).exists())
        self.assertEqual(UserExperimentSettings.objects.count(), 0)
        mock_dispatch.assert_not_called()
