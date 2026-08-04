import sys
import json
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase, Client

sys._called_from_test = True

from allauth.socialaccount.models import SocialAccount


class EmailLoginTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/login'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_valid_login(self):
        User.objects.create_user(username='a@test.com', email='a@test.com', password='pass123')
        res = self._post({'email': 'a@test.com', 'password': 'pass123'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('_auth_user_id', self.client.session)

    def test_wrong_password(self):
        User.objects.create_user(username='b@test.com', email='b@test.com', password='correct')
        res = self._post({'email': 'b@test.com', 'password': 'wrong'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        self.assertIn('error', data)
        self.assertNotIn('_auth', data)

    def test_unknown_email(self):
        res = self._post({'email': 'nobody@test.com', 'password': 'x'})
        self.assertEqual(res.status_code, 401)
        self.assertIn('error', res.json())

    def test_sso_only_account(self):
        user = User.objects.create_user(username='sso@test.com', email='sso@test.com', password='x')
        user.set_unusable_password()
        user.save()
        SocialAccount.objects.create(user=user, provider='google', uid='12345')

        res = self._post({'email': 'sso@test.com', 'password': 'anything'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        self.assertEqual(data['_auth']['code'], 'sso_only_account')
        self.assertIn('google', data['_auth']['providers'])

    def test_invalid_json(self):
        res = self.client.post(self.url, data='not-json', content_type='application/json')
        self.assertEqual(res.status_code, 400)


class AppleCallbackTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/apple/callback'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_missing_id_token(self):
        res = self._post({})
        self.assertEqual(res.status_code, 400)

    def test_invalid_json(self):
        res = self.client.post(self.url, data='bad', content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_invalid_token_returns_400(self):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            provider = MagicMock()
            provider.verify_token.side_effect = Exception('bad token')
            mock_get_adapter.return_value.get_provider.return_value = provider
            res = self._post({'id_token': 'bogus'})
        self.assertEqual(res.status_code, 400)

    @patch('sso.views.complete_social_login')
    def test_success_injects_name(self, mock_complete):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            sl = MagicMock()
            sl.user.first_name = ''
            sl.user.last_name = ''
            provider = MagicMock()
            provider.verify_token.return_value = sl
            mock_get_adapter.return_value.get_provider.return_value = provider

            def set_authenticated(request, sociallogin):
                request.user = MagicMock()
                request.user.is_authenticated = True

            mock_complete.side_effect = set_authenticated

            res = self._post({'id_token': 'valid', 'first_name': 'Alice', 'last_name': 'Smith'})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(sl.user.first_name, 'Alice')
        self.assertEqual(sl.user.last_name, 'Smith')

    @patch('sso.views.complete_social_login')
    def test_does_not_overwrite_existing_name(self, mock_complete):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            sl = MagicMock()
            sl.user.first_name = 'Bob'
            sl.user.last_name = 'Jones'
            provider = MagicMock()
            provider.verify_token.return_value = sl
            mock_get_adapter.return_value.get_provider.return_value = provider
            mock_complete.side_effect = lambda req, s: None

            res = self._post({'id_token': 'valid', 'first_name': 'Other', 'last_name': 'Name'})

        self.assertEqual(sl.user.first_name, 'Bob')
        self.assertEqual(sl.user.last_name, 'Jones')


def _sso_only_user(email):
    """A user as SSO actually creates one: no password set at all (Django's
    create_user(password=None) leaves has_usable_password() == False) — not a
    user with a normal password standing in for one. Mobile-JWT tests assert
    against this so a regression that started issuing tokens for a blank/guess-
    able password would fail here, not just "login worked"."""
    user = User.objects.create_user(username=email, email=email)
    assert not user.has_usable_password()
    return user


class GoogleMobileTest(TestCase):
    """JWT mobile counterpart to AppleCallbackTest's web flow — the native app
    POSTs a Google ID token (no session/cookie CSRF) and expects simplejwt
    tokens back, with the Django session flushed so a JWT-only client never
    picks up a session cookie by accident."""

    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/google/mobile'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_invalid_json(self):
        res = self.client.post(self.url, data='not-json', content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_missing_id_token(self):
        res = self._post({})
        self.assertEqual(res.status_code, 400)

    def test_accepts_credential_alias_for_id_token(self):
        # google_mobile is the only one of the two mobile views that accepts
        # `credential` as an alias for `id_token` (mirrors the web-side
        # GoogleOneTap payload shape) — see the `or data.get("credential")` in
        # sso.views.google_mobile. apple_mobile has no such alias; see
        # AppleMobileTest.test_credential_alias_is_not_accepted below.
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            provider = MagicMock()
            provider.verify_token.side_effect = Exception('bad token')
            mock_get_adapter.return_value.get_provider.return_value = provider
            res = self._post({'credential': 'bogus'})
        self.assertEqual(res.status_code, 400)
        provider.verify_token.assert_called_once()

    def test_invalid_token_returns_400(self):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            provider = MagicMock()
            provider.verify_token.side_effect = Exception('bad token')
            mock_get_adapter.return_value.get_provider.return_value = provider
            res = self._post({'id_token': 'bogus'})
        self.assertEqual(res.status_code, 400)

    @patch('sso.views.complete_social_login')
    def test_success_returns_jwt_for_password_less_sso_user(self, mock_complete):
        user = _sso_only_user('gm@test.com')
        # complete_social_login is mocked below and never touches
        # request.session, so a fresh Client() would never pick up a session
        # cookie regardless of whether request.session.flush() runs — that
        # would make the assertions below pass even if flush() were deleted.
        # force_login first so there is a real, populated session to flush.
        session_owner = User.objects.create_user(username='session-owner@test.com', email='session-owner@test.com')
        self.client.force_login(session_owner)
        self.assertIn('_auth_user_id', self.client.session)

        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            sl = MagicMock()
            sl.user.first_name = 'Existing'
            sl.user.last_name = 'User'
            provider = MagicMock()
            provider.verify_token.return_value = sl
            mock_get_adapter.return_value.get_provider.return_value = provider

            def set_authenticated(request, sociallogin):
                request.user = user

            mock_complete.side_effect = set_authenticated

            res = self._post({'id_token': 'valid'})

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        # The pre-existing session must actually be gone, not just never created.
        self.assertNotIn('_auth_user_id', self.client.session)
        # A flushed session cookie is deleted by resending it empty with Max-Age=0, not omitted.
        self.assertEqual(res.cookies['sessionid'].value, '')
        # The account issued tokens for genuinely has no password to steal.
        self.assertFalse(User.objects.get(pk=user.pk).has_usable_password())


class AppleMobileTest(TestCase):
    """JWT mobile counterpart to AppleCallbackTest — same verification/name-
    injection flow, but returns simplejwt tokens and flushes the session."""

    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/apple/mobile'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_invalid_json(self):
        res = self.client.post(self.url, data='not-json', content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_missing_id_token(self):
        res = self._post({})
        self.assertEqual(res.status_code, 400)

    def test_credential_alias_is_not_accepted(self):
        # Unlike google_mobile, apple_mobile reads only `id_token` — see
        # sso.views.apple_mobile (`data.get("id_token", "")`, no `credential`
        # fallback). A `credential`-only body must be treated as missing, not
        # silently accepted the way GoogleMobileTest's alias case is.
        res = self._post({'credential': 'bogus'})
        self.assertEqual(res.status_code, 400)

    def test_invalid_token_returns_400(self):
        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            provider = MagicMock()
            provider.verify_token.side_effect = Exception('bad token')
            mock_get_adapter.return_value.get_provider.return_value = provider
            res = self._post({'id_token': 'bogus'})
        self.assertEqual(res.status_code, 400)

    @patch('sso.views.complete_social_login')
    def test_success_returns_jwt_for_password_less_sso_user(self, mock_complete):
        user = _sso_only_user('am@test.com')
        # See GoogleMobileTest's identical setup for why force_login is needed
        # here: complete_social_login is mocked and never touches
        # request.session, so without a real pre-existing session the
        # no-session assertions below would pass whether or not
        # request.session.flush() actually runs.
        session_owner = User.objects.create_user(username='session-owner2@test.com', email='session-owner2@test.com')
        self.client.force_login(session_owner)
        self.assertIn('_auth_user_id', self.client.session)

        with patch('sso.views.get_social_adapter') as mock_get_adapter:
            sl = MagicMock()
            sl.user.first_name = ''
            sl.user.last_name = ''
            provider = MagicMock()
            provider.verify_token.return_value = sl
            mock_get_adapter.return_value.get_provider.return_value = provider

            def set_authenticated(request, sociallogin):
                request.user = user

            mock_complete.side_effect = set_authenticated

            res = self._post({'id_token': 'valid', 'first_name': 'Alice', 'last_name': 'Smith'})

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(sl.user.first_name, 'Alice')
        self.assertEqual(sl.user.last_name, 'Smith')
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertEqual(res.cookies['sessionid'].value, '')
        self.assertFalse(User.objects.get(pk=user.pk).has_usable_password())


class MobileLoginTest(TestCase):
    """api/login/ -- the SimpleJWT endpoint the mobile app posts to. Mobile
    sends the email address in the 'username' field (see api.js's
    Sefaria.api.login), matching this project's USERNAME_FIELD='username'
    default-User-model setup."""

    def setUp(self):
        self.client = Client()
        self.url = '/api/login/'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_valid_login_returns_tokens(self):
        User.objects.create_user(username='ml-a@test.com', email='ml-a@test.com', password='pass123')
        res = self._post({'username': 'ml-a@test.com', 'password': 'pass123'})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)

    def test_wrong_password_returns_generic_error_unchanged(self):
        User.objects.create_user(username='ml-b@test.com', email='ml-b@test.com', password='correct')
        res = self._post({'username': 'ml-b@test.com', 'password': 'wrong'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        # Ordinary failures must keep SimpleJWT's stock shape -- no '_auth' key.
        self.assertIn('detail', data)
        self.assertNotIn('_auth', data)

    def test_unknown_username_returns_generic_error_unchanged(self):
        res = self._post({'username': 'ml-nobody@test.com', 'password': 'x'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        self.assertIn('detail', data)
        self.assertNotIn('_auth', data)

    def test_sso_only_account_returns_code_and_providers(self):
        user = User.objects.create_user(username='ml-sso@test.com', email='ml-sso@test.com', password='x')
        user.set_unusable_password()
        user.save()
        SocialAccount.objects.create(user=user, provider='google', uid='mobile-12345')

        res = self._post({'username': 'ml-sso@test.com', 'password': 'anything'})
        self.assertEqual(res.status_code, 401)
        data = res.json()
        self.assertEqual(data['error'], 'auth.generic_error')
        self.assertEqual(data['_auth']['code'], 'sso_only_account')
        self.assertIn('google', data['_auth']['providers'])
        self.assertNotIn('access', data)
        self.assertNotIn('refresh', data)


class PasswordResetApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = '/api/auth/password/reset'

    def _post(self, body):
        return self.client.post(
            self.url,
            data=json.dumps(body),
            content_type='application/json',
        )

    def test_invalid_json(self):
        res = self.client.post(self.url, data='not-json', content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_invalid_email(self):
        res = self._post({'email': 'not-an-email'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'auth.invalid_email')

    def test_valid_email_sends_reset_and_returns_200(self):
        User.objects.create_user(username='reset@test.com', email='reset@test.com', password='x')
        with patch('sso.views.SefariaPasswordResetForm.save') as mock_save:
            res = self._post({'email': 'reset@test.com'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {})
        mock_save.assert_called_once()
        _, kwargs = mock_save.call_args
        self.assertEqual(kwargs['email_template_name'], 'registration/password_reset_email.txt')
        self.assertEqual(kwargs['html_email_template_name'], 'registration/password_reset_email.html')

    def test_unknown_email_still_returns_200(self):
        # Django's PasswordResetForm silently no-ops for unknown emails (prevents
        # account enumeration) — the API must not leak whether the address exists.
        res = self._post({'email': 'nobody@test.com'})
        self.assertEqual(res.status_code, 200)
