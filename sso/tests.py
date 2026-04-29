from unittest.mock import patch, MagicMock

from django.contrib.auth.models import User
from django.test import TestCase, RequestFactory

from sso.models import SocialIdentity
from sso.service import SocialAuthService, EmailCollisionError, AlreadyLinkedError, LastLoginMethodError


GOOGLE_PAYLOAD = {
    "sub": "google-uid-123",
    "email": "user@example.com",
    "given_name": "Test",
    "family_name": "User",
}

APPLE_PAYLOAD = {
    "sub": "apple-uid-456",
    "email": "user@example.com",
}


def _make_request():
    return RequestFactory().post("/")


def _mock_profile():
    p = MagicMock()
    p.email = "user@example.com"
    p.slug = "test-user"
    return p


class SocialAuthServiceNewUserTest(TestCase):
    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_creates_user_social_identity_and_profile(self, MockProfile, mock_gravatar):
        profile_instance = _mock_profile()
        MockProfile.return_value = profile_instance

        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google",
            uid=GOOGLE_PAYLOAD["sub"],
            email=GOOGLE_PAYLOAD["email"],
            first_name=GOOGLE_PAYLOAD["given_name"],
            last_name=GOOGLE_PAYLOAD["family_name"],
            request=_make_request(),
        )

        self.assertTrue(is_new_user)
        self.assertEqual(user.email, "user@example.com")
        self.assertEqual(user.first_name, "Test")
        self.assertTrue(SocialIdentity.objects.filter(provider="google", uid="google-uid-123").exists())
        profile_instance.assign_slug.assert_called_once()
        profile_instance.join_invited_collections.assert_called_once()
        profile_instance.save.assert_called_once()
        mock_gravatar.assert_called_once_with(profile_instance)

    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_applies_interface_language_when_present(self, MockProfile, mock_gravatar):
        profile_instance = _mock_profile()
        MockProfile.return_value = profile_instance
        profile_instance.settings = {}

        request = _make_request()
        request.interfaceLang = "hebrew"

        SocialAuthService.get_or_create_social_user(
            provider="google", uid="uid-lang", email="lang@example.com",
            first_name="", last_name="", request=request,
        )

        self.assertEqual(profile_instance.settings["interface_language"], "hebrew")


class SocialAuthServiceReturningUserTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="existing", email="existing@example.com")
        SocialIdentity.objects.create(provider="google", uid="returning-uid", email="existing@example.com", user=self.user)

    def test_returns_existing_user_without_creating_records(self):
        user_count_before = User.objects.count()
        identity_count_before = SocialIdentity.objects.count()

        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google", uid="returning-uid", email="existing@example.com",
            first_name="", last_name="", request=_make_request(),
        )

        self.assertFalse(is_new_user)
        self.assertEqual(user.pk, self.user.pk)
        self.assertEqual(User.objects.count(), user_count_before)
        self.assertEqual(SocialIdentity.objects.count(), identity_count_before)


class SocialAuthServiceCollisionTest(TestCase):
    def setUp(self):
        self.password_user = User.objects.create_user(
            username="pwuser", email="collision@example.com", password="secret"
        )

    def test_raises_on_email_collision_with_password_account(self):
        with self.assertRaises(EmailCollisionError):
            SocialAuthService.get_or_create_social_user(
                provider="google", uid="new-uid", email="collision@example.com",
                first_name="", last_name="", request=_make_request(),
            )

    def test_collision_check_is_case_insensitive(self):
        with self.assertRaises(EmailCollisionError):
            SocialAuthService.get_or_create_social_user(
                provider="google", uid="new-uid-2", email="Collision@Example.COM",
                first_name="", last_name="", request=_make_request(),
            )

    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_no_collision_when_existing_user_has_social_identity(self, MockProfile, mock_gravatar):
        MockProfile.return_value = _mock_profile()
        SocialIdentity.objects.create(provider="apple", uid="apple-uid", email="collision@example.com", user=self.password_user)

        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google", uid="google-uid-new", email="collision@example.com",
            first_name="", last_name="", request=_make_request(),
        )
        self.assertTrue(is_new_user)


class SocialAuthServiceLinkTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="linkuser", email="link@example.com")

    def test_link_adds_social_identity(self):
        SocialAuthService.link_provider(self.user, "google", "link-uid", "link@example.com")
        self.assertTrue(SocialIdentity.objects.filter(user=self.user, provider="google", uid="link-uid").exists())

    def test_link_idempotent(self):
        SocialAuthService.link_provider(self.user, "google", "link-uid", "link@example.com")
        SocialAuthService.link_provider(self.user, "google", "link-uid", "link@example.com")
        self.assertEqual(SocialIdentity.objects.filter(user=self.user, provider="google").count(), 1)

    def test_link_raises_when_uid_belongs_to_another_user(self):
        other = User.objects.create_user(username="other", email="other@example.com")
        SocialIdentity.objects.create(provider="google", uid="taken-uid", email="other@example.com", user=other)

        with self.assertRaises(AlreadyLinkedError):
            SocialAuthService.link_provider(self.user, "google", "taken-uid", "link@example.com")


class SocialAuthServiceUnlinkTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="unlinkuser", email="unlink@example.com", password="secret")
        SocialIdentity.objects.create(provider="google", uid="unlink-uid", email="unlink@example.com", user=self.user)

    def test_unlink_removes_social_identity(self):
        SocialAuthService.unlink_provider(self.user, "google")
        self.assertFalse(SocialIdentity.objects.filter(user=self.user, provider="google").exists())

    def test_unlink_raises_when_last_login_method(self):
        self.user.set_unusable_password()
        self.user.save()

        with self.assertRaises(LastLoginMethodError):
            SocialAuthService.unlink_provider(self.user, "google")

    def test_unlink_allowed_when_other_social_identity_exists(self):
        SocialIdentity.objects.create(provider="apple", uid="apple-uid", email="unlink@example.com", user=self.user)
        self.user.set_unusable_password()
        self.user.save()

        SocialAuthService.unlink_provider(self.user, "google")
        self.assertFalse(SocialIdentity.objects.filter(user=self.user, provider="google").exists())
        self.assertTrue(SocialIdentity.objects.filter(user=self.user, provider="apple").exists())

    def test_unlink_allowed_when_user_has_password(self):
        SocialAuthService.unlink_provider(self.user, "google")
        self.assertFalse(SocialIdentity.objects.filter(user=self.user, provider="google").exists())


class CaseInsensitiveCollisionIntegrationTest(TestCase):
    """User registers with mixed-case email; SSO returns lowercase — must hit the collision path."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="caseuser", email="CaseSensitive@Gmail.com", password="secret"
        )

    def test_lowercase_sso_email_collides_with_mixed_case_account(self):
        with self.assertRaises(EmailCollisionError):
            SocialAuthService.get_or_create_social_user(
                provider="google", uid="case-uid", email="casesensitive@gmail.com",
                first_name="", last_name="", request=_make_request(),
            )

    def test_no_duplicate_user_created_on_collision(self):
        user_count_before = User.objects.count()
        try:
            SocialAuthService.get_or_create_social_user(
                provider="google", uid="case-uid-2", email="casesensitive@gmail.com",
                first_name="", last_name="", request=_make_request(),
            )
        except EmailCollisionError:
            pass
        self.assertEqual(User.objects.count(), user_count_before)


class CallbackViewTest(TestCase):
    @patch("sso.providers.google.verify_token", return_value=GOOGLE_PAYLOAD)
    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_google_callback_new_user(self, MockProfile, mock_gravatar, mock_verify):
        MockProfile.return_value = _mock_profile()
        response = self.client.post(
            "/api/auth/google/callback",
            data={"credential": "fake-jwt"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["is_new_user"], True)

    @patch("sso.providers.google.verify_token", side_effect=ValueError("bad token"))
    def test_google_callback_invalid_token_returns_401(self, mock_verify):
        response = self.client.post(
            "/api/auth/google/callback",
            data={"credential": "bad"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    @patch("sso.providers.google.verify_token", return_value=GOOGLE_PAYLOAD)
    def test_google_callback_collision_returns_409(self, mock_verify):
        User.objects.create_user(username="coll", email="user@example.com", password="secret")
        response = self.client.post(
            "/api/auth/google/callback",
            data={"credential": "fake-jwt"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    @patch("sso.providers.apple.verify_token", return_value=APPLE_PAYLOAD)
    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_apple_callback_new_user(self, MockProfile, mock_gravatar, mock_verify):
        MockProfile.return_value = _mock_profile()
        response = self.client.post(
            "/api/auth/apple/callback",
            data={"id_token": "fake-apple-jwt", "first_name": "Test", "last_name": "User"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["is_new_user"], True)
        self.assertTrue(SocialIdentity.objects.filter(provider="apple", uid="apple-uid-456").exists())
