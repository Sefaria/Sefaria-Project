import sys
import urllib.error
import urllib.parse
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase

sys._called_from_test = True

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.models import SocialLogin
from google.cloud.exceptions import GoogleCloudError

from sso.adapters import SefariaSocialAccountAdapter, SefariaAccountAdapter, import_gravatar


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


class SaveUserTest(TestCase):
    """
    SefariaSocialAccountAdapter.save_user is only reached for brand-new users
    (see the docstring on the method itself — email-collision users reuse their
    existing Django account via pre_social_login and never hit save_user). It
    wires up three side effects after allauth creates the Django User row:
    MongoDB UserProfile creation, Gravatar import, and Salesforce CRM
    registration — the last of which must not be able to roll back the first two.
    """
    def _sociallogin_for(self, user):
        sl = MagicMock(spec=SocialLogin)
        sl.user = user
        return sl

    @patch('sso.adapters.CrmMediator')
    @patch('sso.adapters.import_gravatar')
    @patch('sso.adapters.UserProfile')
    def test_creates_profile_and_registers_crm_user(self, mock_profile_cls, mock_import_gravatar, mock_crm_cls):
        user = User(username='new@test.com', email='new@test.com', first_name='New', last_name='User')
        user.id = 42
        # spec restricts the mock to exactly this attribute, so
        # getattr(request, "LANGUAGE_CODE", "en") genuinely falls back to "en"
        # instead of resolving to an auto-vivified MagicMock attribute.
        request = MagicMock(spec=['interfaceLang'])
        request.interfaceLang = 'english'

        adapter = SefariaSocialAccountAdapter()
        with patch.object(SefariaSocialAccountAdapter.__bases__[0], 'save_user', return_value=user):
            result = adapter.save_user(request, self._sociallogin_for(user))

        self.assertIs(result, user)
        mock_profile_cls.assert_called_once_with(id=user.id, user_registration=True)
        profile = mock_profile_cls.return_value
        profile.assign_slug.assert_called_once()
        profile.join_invited_collections.assert_called_once()
        profile.settings.__setitem__.assert_called_once_with('interface_language', 'english')
        mock_import_gravatar.assert_called_once_with(profile)
        profile.save.assert_called_once()
        mock_crm_cls.return_value.create_crm_user.assert_called_once_with(
            user.email, first_name='New', last_name='User', lang='en', educator=False,
        )

    @patch('sso.adapters.CrmMediator')
    @patch('sso.adapters.import_gravatar')
    @patch('sso.adapters.UserProfile')
    def test_crm_outage_does_not_roll_back_user_or_profile(self, mock_profile_cls, mock_import_gravatar, mock_crm_cls):
        # The try/except around create_crm_user is the whole point of this code
        # path (see save_user's docstring) — assert it directly rather than
        # trusting the comment.
        mock_crm_cls.return_value.create_crm_user.side_effect = Exception('Salesforce is down')
        user = User(username='crmfail@test.com', email='crmfail@test.com')
        user.id = 43
        request = MagicMock(spec=[])  # no `interfaceLang` attribute, like a plain request

        adapter = SefariaSocialAccountAdapter()
        with patch.object(SefariaSocialAccountAdapter.__bases__[0], 'save_user', return_value=user):
            result = adapter.save_user(request, self._sociallogin_for(user))

        # No exception propagated, the user is still returned, and the profile
        # was still created/saved before the CRM call ran.
        self.assertIs(result, user)
        mock_profile_cls.return_value.save.assert_called_once()


class ImportGravatarTest(TestCase):
    """
    import_gravatar (shared by SSO registration here and email registration in
    sefaria/views.py::process_register_form) must never raise — a Gravatar
    outage or a user with no Gravatar (404) must not break registration.
    """
    def _profile(self):
        profile = MagicMock()
        profile.email = 'gravatar@test.com'
        profile.slug = 'gravatar-user'
        return profile

    @patch('sso.adapters.urllib.request.urlopen')
    def test_http_error_is_swallowed(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError('url', 404, 'Not Found', {}, None)
        import_gravatar(self._profile())  # must not raise

    @patch('sso.adapters.urllib.request.urlopen')
    def test_url_error_is_swallowed(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError('DNS lookup failed')
        import_gravatar(self._profile())  # must not raise

    @patch('sso.adapters.GoogleStorageManager')
    @patch('sso.adapters.get_resized_file')
    @patch('sso.adapters.Image')
    @patch('sso.adapters.urllib.request.urlopen')
    def test_google_cloud_error_is_swallowed(self, mock_urlopen, mock_image, mock_get_resized_file, mock_gsm):
        # get_resized_file does real PIL resizing — stub it out so the mocked
        # Image object never reaches actual image-processing code; only
        # GoogleStorageManager.upload_file is under test here.
        mock_urlopen.return_value.__enter__.return_value = MagicMock()
        mock_image.open.return_value.__enter__.return_value = MagicMock()
        mock_get_resized_file.return_value = MagicMock()
        mock_gsm.upload_file.side_effect = GoogleCloudError('bucket unreachable')
        import_gravatar(self._profile())  # must not raise

    @patch('sso.adapters.GoogleStorageManager')
    @patch('sso.adapters.get_resized_file')
    @patch('sso.adapters.Image')
    @patch('sso.adapters.urllib.request.urlopen')
    def test_success_sets_big_and_small_profile_pic_urls(self, mock_urlopen, mock_image, mock_get_resized_file, mock_gsm):
        # The failure-path tests above only prove exceptions are swallowed —
        # this is the actual happy path: a real Gravatar hit must still result
        # in both profile_pic_url and profile_pic_url_small being set from
        # GoogleStorageManager.upload_file's two calls (big then small).
        mock_urlopen.return_value.__enter__.return_value = MagicMock()
        mock_image.open.return_value.__enter__.return_value = MagicMock()
        mock_get_resized_file.return_value = MagicMock()
        mock_gsm.upload_file.side_effect = ['https://storage/big.png', 'https://storage/small.png']

        profile = self._profile()
        import_gravatar(profile)

        self.assertEqual(profile.profile_pic_url, 'https://storage/big.png')
        self.assertEqual(profile.profile_pic_url_small, 'https://storage/small.png')
        self.assertEqual(mock_gsm.upload_file.call_count, 2)
