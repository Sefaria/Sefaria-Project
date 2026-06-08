from unittest.mock import patch, MagicMock

from django.contrib.auth.models import User
from django.test import TestCase, RequestFactory, Client

from emailusernames.utils import create_user
from sefaria.forms import SefariaLoginForm
from sso.models import SocialIdentity
from sso.service import SocialAuthService, AlreadyLinkedError, LastLoginMethodError
from sso.utils import make_redirect_state


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
    """Email collision with a password account auto-links the new SocialIdentity to that user."""

    def setUp(self):
        self.password_user = User.objects.create_user(
            username="pwuser", email="collision@example.com", password="secret"
        )

    def test_collision_auto_links_to_existing_password_account(self):
        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google", uid="new-uid", email="collision@example.com",
            first_name="", last_name="", request=_make_request(),
        )
        self.assertFalse(is_new_user)
        self.assertEqual(user.pk, self.password_user.pk)
        self.assertTrue(
            SocialIdentity.objects.filter(user=self.password_user, provider="google", uid="new-uid").exists()
        )
        self.password_user.refresh_from_db()
        self.assertFalse(self.password_user.has_usable_password())

    @patch("sso.service.SocialIdentity.objects.create", side_effect=RuntimeError("write failed"))
    def test_collision_keeps_password_when_identity_creation_fails(self, mock_create):
        with self.assertRaises(RuntimeError):
            SocialAuthService.get_or_create_social_user(
                provider="google", uid="failed-uid", email="collision@example.com",
                first_name="", last_name="", request=_make_request(),
            )

        self.password_user.refresh_from_db()
        self.assertTrue(self.password_user.has_usable_password())

    def test_collision_check_is_case_insensitive(self):
        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google", uid="new-uid-2", email="Collision@Example.COM",
            first_name="", last_name="", request=_make_request(),
        )
        self.assertFalse(is_new_user)
        self.assertEqual(user.pk, self.password_user.pk)

    def test_collision_does_not_create_duplicate_user(self):
        user_count_before = User.objects.count()
        SocialAuthService.get_or_create_social_user(
            provider="google", uid="new-uid-3", email="collision@example.com",
            first_name="", last_name="", request=_make_request(),
        )
        self.assertEqual(User.objects.count(), user_count_before)

    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_existing_user_with_one_provider_can_link_another(self, MockProfile, mock_gravatar):
        MockProfile.return_value = _mock_profile()
        SocialIdentity.objects.create(provider="apple", uid="apple-uid", email="collision@example.com", user=self.password_user)

        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google", uid="google-uid-new", email="collision@example.com",
            first_name="", last_name="", request=_make_request(),
        )
        self.assertFalse(is_new_user)
        self.assertEqual(user.pk, self.password_user.pk)
        self.assertTrue(
            SocialIdentity.objects.filter(user=self.password_user, provider="google", uid="google-uid-new").exists()
        )


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

    def test_unlink_requires_password_even_when_other_social_identity_exists(self):
        SocialIdentity.objects.create(provider="apple", uid="apple-uid", email="unlink@example.com", user=self.user)
        self.user.set_unusable_password()
        self.user.save()

        with self.assertRaises(LastLoginMethodError):
            SocialAuthService.unlink_provider(self.user, "google")
        self.assertTrue(SocialIdentity.objects.filter(user=self.user, provider="google").exists())
        self.assertTrue(SocialIdentity.objects.filter(user=self.user, provider="apple").exists())

    def test_unlink_allowed_when_user_has_password(self):
        SocialAuthService.unlink_provider(self.user, "google")
        self.assertFalse(SocialIdentity.objects.filter(user=self.user, provider="google").exists())


class CaseInsensitiveCollisionIntegrationTest(TestCase):
    """User registers with mixed-case email; SSO returns lowercase — must auto-link to the existing user."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="caseuser", email="CaseSensitive@Gmail.com", password="secret"
        )

    def test_lowercase_sso_email_auto_links_to_mixed_case_account(self):
        user, is_new_user = SocialAuthService.get_or_create_social_user(
            provider="google", uid="case-uid", email="casesensitive@gmail.com",
            first_name="", last_name="", request=_make_request(),
        )
        self.assertFalse(is_new_user)
        self.assertEqual(user.pk, self.user.pk)

    def test_no_duplicate_user_created_on_collision(self):
        user_count_before = User.objects.count()
        SocialAuthService.get_or_create_social_user(
            provider="google", uid="case-uid-2", email="casesensitive@gmail.com",
            first_name="", last_name="", request=_make_request(),
        )
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
    def test_google_callback_auto_links_existing_password_account(self, mock_verify):
        existing = User.objects.create_user(username="coll", email="user@example.com", password="secret")
        response = self.client.post(
            "/api/auth/google/callback",
            data={"credential": "fake-jwt"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["is_new_user"], False)
        self.assertTrue(
            SocialIdentity.objects.filter(user=existing, provider="google", uid=GOOGLE_PAYLOAD["sub"]).exists()
        )
        existing.refresh_from_db()
        self.assertFalse(existing.has_usable_password())

    @patch("sso.providers.google.verify_token", return_value=GOOGLE_PAYLOAD)
    @patch("sso.service.SocialAuthService._import_gravatar")
    @patch("sso.service.UserProfile")
    def test_google_callback_second_login_with_session_cookie_does_not_require_csrf(self, MockProfile, mock_gravatar, mock_verify):
        MockProfile.return_value = _mock_profile()
        client = Client(enforce_csrf_checks=True)

        first_response = client.post(
            "/api/auth/google/callback",
            data={"credential": "fake-jwt"},
            content_type="application/json",
        )
        self.assertEqual(first_response.status_code, 200)

        second_response = client.post(
            "/api/auth/google/callback",
            data={"credential": "fake-jwt"},
            content_type="application/json",
        )
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["is_new_user"], False)

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


class ProviderVerificationTest(TestCase):
    @patch("sso.providers.google.id_token.verify_oauth2_token")
    def test_google_rejects_unverified_email(self, mock_verify):
        from sso.providers.google import verify_token

        mock_verify.return_value = {
            "sub": "google-uid",
            "email": "user@example.com",
            "email_verified": False,
        }
        with self.assertRaises(ValueError):
            verify_token("credential")

    @patch("sso.providers.google.id_token.verify_oauth2_token")
    def test_google_rejects_missing_email(self, mock_verify):
        from sso.providers.google import verify_token

        mock_verify.return_value = {"sub": "google-uid", "email_verified": True}
        with self.assertRaises(ValueError):
            verify_token("credential")

    @patch("sso.providers.apple.jose_jwt.decode")
    @patch("sso.providers.apple.JsonWebKey.import_key_set")
    @patch("sso.providers.apple.http_requests.get")
    def test_apple_accepts_string_true_verified_claim(self, mock_get, mock_import, mock_decode):
        from sso.providers.apple import verify_token

        claims = MagicMock()
        claims.get.side_effect = {
            "iss": "https://appleid.apple.com",
            "aud": "org.sefaria.web.signin",
            "email": "user@example.com",
            "email_verified": "true",
        }.get
        claims.__getitem__.side_effect = {"sub": "apple-uid"}.__getitem__
        mock_decode.return_value = claims
        mock_get.return_value.json.return_value = {"keys": []}

        with patch("sso.providers.apple.settings.APPLE_SSO_CLIENT_ID", "org.sefaria.web.signin"):
            payload = verify_token("credential")

        self.assertEqual(payload["email"], "user@example.com")


class SSOOnlyFormTest(TestCase):
    def setUp(self):
        self.user = create_user("social@example.com", password=None)
        SocialIdentity.objects.create(
            provider="google", uid="social-google", email=self.user.email, user=self.user,
        )

    def test_login_form_returns_typed_social_error(self):
        form = SefariaLoginForm(data={"email": self.user.email, "password": "wrong"})
        self.assertFalse(form.is_valid())
        self.assertEqual(form.non_field_errors().as_data()[0].code, "sso_only_account")
        self.assertEqual(form.sso_only_providers, ["Google"])

    def test_login_page_renders_social_action_and_suppresses_one_tap(self):
        response = self.client.post("/login", {"email": self.user.email, "password": "wrong"})
        self.assertContains(response, 'id="sso-only-login-error"')
        self.assertNotContains(response, "<!-- Google One Tap -->")

    def test_registration_ajax_returns_structured_social_error(self):
        response = self.client.post("/register", {
            "email": self.user.email,
            "first_name": "Social",
            "last_name": "User",
            "password1": "irrelevant-password",
            "captcha": "test",
            "noredirect": "1",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["_auth"], {
            "code": "sso_only_account",
            "providers": ["Google"],
        })


class SocialRedirectViewTest(TestCase):
    def setUp(self):
        self.user = create_user("redirect@example.com", password=None)
        SocialIdentity.objects.create(
            provider="google", uid="redirect-google", email=self.user.email, user=self.user,
        )

    def _state(self, next_url="/texts"):
        request = RequestFactory().get("/", HTTP_HOST="testserver")
        return make_redirect_state(request, next_url)

    @patch("sso.providers.google.verify_token")
    def test_google_redirect_logs_in_and_preserves_safe_next(self, mock_verify):
        mock_verify.return_value = {
            "sub": "redirect-google",
            "email": self.user.email,
            "given_name": "",
            "family_name": "",
        }
        response = self.client.post(
            "/auth/google/redirect",
            {"credential": "credential"},
            HTTP_COOKIE=f"sso_redirect_state={self._state()}",
        )
        self.assertRedirects(response, "/texts", fetch_redirect_response=False)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    @patch("sso.providers.google.verify_token")
    def test_google_redirect_rejects_external_next(self, mock_verify):
        mock_verify.return_value = {
            "sub": "redirect-google",
            "email": self.user.email,
            "given_name": "",
            "family_name": "",
        }
        response = self.client.post(
            "/auth/google/redirect",
            {"credential": "credential"},
            HTTP_COOKIE=f"sso_redirect_state={self._state('https://example.net/phish')}",
        )
        self.assertRedirects(response, "/", fetch_redirect_response=False)

    @patch("sso.providers.apple.verify_token")
    def test_apple_redirect_logs_in_and_preserves_safe_next(self, mock_verify):
        SocialIdentity.objects.create(
            provider="apple", uid="redirect-apple", email=self.user.email, user=self.user,
        )
        mock_verify.return_value = {
            "sub": "redirect-apple",
            "email": self.user.email,
        }
        response = self.client.post(
            "/auth/apple/redirect",
            {
                "id_token": "credential",
                "state": self._state("/topics"),
                "user": '{"name":{"firstName":"Redirect","lastName":"User"}}',
            },
        )
        self.assertRedirects(response, "/topics", fetch_redirect_response=False)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)
