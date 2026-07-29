import sys
import json
import urllib.parse
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase, Client

sys._called_from_test = True

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.models import SocialAccount, SocialLogin

from sso.adapters import SefariaSocialAccountAdapter, SefariaAccountAdapter


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


class PreSocialLoginTest(TestCase):
    def _make_sociallogin(self, email, is_existing=False):
        user = MagicMock()
        user.email = email
        sl = MagicMock(spec=SocialLogin)
        sl.is_existing = is_existing
        sl.user = user
        return sl

    def test_disables_password_on_email_collision(self):
        existing = User.objects.create_user(username='col@test.com', email='col@test.com', password='secret')
        self.assertTrue(existing.has_usable_password())

        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('col@test.com', is_existing=False)
        adapter.pre_social_login(MagicMock(), sl)

        existing.refresh_from_db()
        self.assertFalse(existing.has_usable_password())

    def test_skips_returning_user(self):
        existing = User.objects.create_user(username='ret@test.com', email='ret@test.com', password='secret')
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('ret@test.com', is_existing=True)
        adapter.pre_social_login(MagicMock(), sl)

        existing.refresh_from_db()
        self.assertTrue(existing.has_usable_password())

    def test_no_op_for_new_email(self):
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('brand@new.com', is_existing=False)
        adapter.pre_social_login(MagicMock(), sl)  # must not raise


class PopulateUsernameTest(TestCase):
    def test_sets_username_to_email(self):
        user = MagicMock()
        user.email = 'u@test.com'
        adapter = SefariaAccountAdapter()
        adapter.populate_username(MagicMock(), user)
        self.assertEqual(user.username, 'u@test.com')


class SsoNextCookieRedirectTest(TestCase):
    """
    Google's redirect-mode SSO can't carry `next` on login_uri (Google requires an
    exact-match registered redirect URI, no query string), so the client stashes it in
    a cookie instead (see static/js/auth/useSsoSignIn.jsx) and SefariaAccountAdapter
    reads it back here. is_safe_url() depends on allauth's own request-scoped context
    binding, which a bare mock request doesn't satisfy — so we stub it directly to
    isolate exactly the new logic (cookie present + safe -> use it; otherwise -> the
    existing default), rather than re-testing allauth's own safe-url validation.
    """
    def _adapter(self, cookie_value=None, safe=True):
        adapter = SefariaAccountAdapter()
        adapter.is_safe_url = MagicMock(return_value=safe)
        request = MagicMock()
        request.COOKIES = {adapter.SSO_NEXT_COOKIE: cookie_value} if cookie_value is not None else {}
        return adapter, request

    def test_login_redirect_uses_cookie_when_safe(self):
        adapter, request = self._adapter('/some/next/path', safe=True)
        self.assertEqual(adapter.get_login_redirect_url(request), '/some/next/path')

    def test_login_redirect_decodes_percent_encoded_cookie(self):
        # Mirrors the real client write (encodeURIComponent in useSsoSignIn.jsx) — Python's
        # cookie parser never percent-decodes values, so the raw cookie value arrives still
        # encoded (e.g. "%2Fsheets%2F123") and must be decoded before use, not passed
        # through as-is (that mangled string previously still passed is_safe_url and became
        # a broken redirect target).
        encoded = urllib.parse.quote('/sheets/123?query=a b', safe='')
        adapter, request = self._adapter(encoded, safe=True)
        self.assertEqual(adapter.get_login_redirect_url(request), '/sheets/123?query=a b')
        adapter.is_safe_url.assert_called_once_with('/sheets/123?query=a b')

    def test_login_redirect_falls_back_when_no_cookie(self):
        adapter, request = self._adapter(None)
        with patch.object(DefaultAccountAdapter, 'get_login_redirect_url', return_value='/home-fallback'):
            self.assertEqual(adapter.get_login_redirect_url(request), '/home-fallback')

    def test_login_redirect_falls_back_when_cookie_unsafe(self):
        adapter, request = self._adapter('https://evil.example.com/', safe=False)
        with patch.object(DefaultAccountAdapter, 'get_login_redirect_url', return_value='/home-fallback'):
            self.assertEqual(adapter.get_login_redirect_url(request), '/home-fallback')

    def test_signup_redirect_uses_cookie_when_safe(self):
        adapter, request = self._adapter('/welcome', safe=True)
        self.assertEqual(adapter.get_signup_redirect_url(request), '/welcome')

    def test_signup_redirect_falls_back_when_no_cookie(self):
        adapter, request = self._adapter(None)
        with patch.object(DefaultAccountAdapter, 'get_signup_redirect_url', return_value='/signup-fallback'):
            self.assertEqual(adapter.get_signup_redirect_url(request), '/signup-fallback')


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


class ClearSsoNextCookieMiddlewareTest(TestCase):
    """
    sso.adapters.SefariaAccountAdapter.get_login_redirect_url / get_signup_redirect_url
    are the only two call sites in the codebase that read the sefaria_sso_next cookie
    (email login/register/password-reset are all fully custom views that never touch
    that adapter machinery) — so clearing it whenever these two specific endpoints
    respond, regardless of outcome, is sufficient; see ClearSsoNextCookieMiddleware.
    """
    def test_clears_cookie_on_google_redirect_path(self):
        self.client.cookies['sefaria_sso_next'] = '/some/path'
        res = self.client.post('/api/auth/google/redirect', data={})
        self.assertIn('sefaria_sso_next', res.cookies)
        self.assertEqual(res.cookies['sefaria_sso_next'].value, '')

    def test_clears_cookie_on_apple_callback_finish_path(self):
        self.client.cookies['sefaria_sso_next'] = '/some/path'
        res = self.client.get('/accounts/apple/login/callback/finish/')
        self.assertIn('sefaria_sso_next', res.cookies)
        self.assertEqual(res.cookies['sefaria_sso_next'].value, '')

    def test_does_not_touch_cookie_on_unrelated_path(self):
        self.client.cookies['sefaria_sso_next'] = '/some/path'
        res = self.client.get('/api/auth/login')
        self.assertNotIn('sefaria_sso_next', res.cookies)
