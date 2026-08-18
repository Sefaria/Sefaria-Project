import socket
import sys
import urllib.error
import urllib.parse
from unittest.mock import MagicMock, call, patch

from django.contrib.auth.models import User
from django.test import TestCase, RequestFactory, override_settings

sys._called_from_test = True

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.context import request_context
from allauth.socialaccount.models import SocialAccount, SocialLogin
from google.cloud.exceptions import GoogleCloudError

from sefaria.helper import library_assistant
from sso.adapters import SefariaSocialAccountAdapter, SefariaAccountAdapter, import_gravatar


class PreSocialLoginTest(TestCase):
    """
    Product decision: SSO always wins on an email collision, even when the
    provider doesn't mark the email verified (covers e.g. someone
    registering with an email they don't own, or a stolen mailbox) -- see
    SefariaSocialAccountAdapter.pre_social_login. is_existing=False here
    means allauth's own provider-verified-email match (lookup()) didn't
    already claim the account, so this hook is what has to take it over;
    is_existing=True means allauth already matched it and drives the
    wipe/connect itself, so this hook must stay out of the way.
    """
    def _make_sociallogin(self, email, is_existing=False):
        user = MagicMock()
        user.email = email
        sl = MagicMock(spec=SocialLogin)
        sl.is_existing = is_existing
        sl.user = user
        return sl

    def test_takes_over_existing_account_on_email_collision(self):
        existing = User.objects.create_user(username='col@test.com', email='col@test.com', password='secret')
        self.assertTrue(existing.has_usable_password())

        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('col@test.com', is_existing=False)
        request = MagicMock()
        adapter.pre_social_login(request, sl)

        existing.refresh_from_db()
        self.assertFalse(existing.has_usable_password())
        sl.connect.assert_called_once_with(request, existing)

    def test_skips_returning_user(self):
        existing = User.objects.create_user(username='ret@test.com', email='ret@test.com', password='secret')
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('ret@test.com', is_existing=True)
        adapter.pre_social_login(MagicMock(), sl)

        existing.refresh_from_db()
        self.assertTrue(existing.has_usable_password())
        sl.connect.assert_not_called()

    def test_no_op_for_new_email(self):
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('brand@new.com', is_existing=False)
        adapter.pre_social_login(MagicMock(), sl)  # must not raise
        sl.connect.assert_not_called()

    def test_no_op_for_missing_email(self):
        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('', is_existing=False)
        adapter.pre_social_login(MagicMock(), sl)  # must not raise
        sl.connect.assert_not_called()

    def test_connects_even_when_existing_account_already_has_no_password(self):
        existing = User.objects.create_user(username='sso@test.com', email='sso@test.com')
        existing.set_unusable_password()
        existing.save()

        adapter = SefariaSocialAccountAdapter()
        sl = self._make_sociallogin('sso@test.com', is_existing=False)
        request = MagicMock()
        adapter.pre_social_login(request, sl)

        sl.connect.assert_called_once_with(request, existing)


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


@override_settings(ALLOWED_HOSTS=['*'])
class IsSafeUrlTest(TestCase):
    """
    Production runs ALLOWED_HOSTS=['*'] for multi-domain routing. DefaultAccountAdapter's
    is_safe_url() has a fallback for that case that degenerates into checking a URL's host
    against itself, i.e. it accepts any external URL (see allauth.account.adapter). We
    override is_safe_url() to scope the check to the current request's host instead, so
    this exercises the real request-scoped context binding rather than mocking it away.
    """
    def _adapter_for(self, host):
        adapter = SefariaAccountAdapter()
        request = RequestFactory().get('/', SERVER_NAME=host)
        return adapter, request

    def test_rejects_external_host(self):
        adapter, request = self._adapter_for('www.sefaria.org')
        with request_context(request):
            self.assertFalse(adapter.is_safe_url('https://evil.example.com/phish'))

    def test_accepts_same_host_absolute_url(self):
        adapter, request = self._adapter_for('www.sefaria.org')
        with request_context(request):
            self.assertTrue(adapter.is_safe_url('http://www.sefaria.org/texts'))

    def test_accepts_relative_url(self):
        adapter, request = self._adapter_for('www.sefaria.org')
        with request_context(request):
            self.assertTrue(adapter.is_safe_url('/texts/Genesis.1.1'))

    def test_rejects_scheme_relative_url_to_other_host(self):
        adapter, request = self._adapter_for('www.sefaria.org')
        with request_context(request):
            self.assertFalse(adapter.is_safe_url('//evil.example.com/phish'))

    def test_rejects_without_bound_request(self):
        adapter = SefariaAccountAdapter()
        self.assertFalse(adapter.is_safe_url('/texts/Genesis.1.1'))


class SaveUserTest(TestCase):
    """
    SefariaSocialAccountAdapter.save_user is only reached for brand-new users
    (see the docstring on the method itself — email-collision users reuse their
    existing Django account via pre_social_login and never hit save_user). It
    wires up three side effects after allauth creates the Django User row:
    MongoDB UserProfile creation, Gravatar import, and Salesforce CRM
    registration — the last of which must not be able to roll back the first two.

    UserProfile is saved twice, mirroring process_register_form in
    sefaria/views.py: once inside the atomic block (with assign_slug/
    join_invited_collections/interface_language already set) so a failure
    there rolls back the Django User too, and again after import_gravatar,
    which runs outside the transaction since it's a slow network call.
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
        profile.settings.__setitem__.assert_has_calls([
            call('interface_language', 'english'),
            call(library_assistant.SETTING_KEY, True),
        ])
        self.assertEqual(profile.settings.__setitem__.call_count, 2)
        mock_import_gravatar.assert_called_once_with(profile)
        self.assertEqual(profile.save.call_count, 2)
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
        # was still created/saved (twice — atomic block, then post-gravatar)
        # before the CRM call ran.
        self.assertIs(result, user)
        self.assertEqual(mock_profile_cls.return_value.save.call_count, 2)


class SaveUserAtomicityTest(TestCase):
    """
    Real (unmocked) database writes -- not just mock call assertions --
    proving transaction.atomic() actually rolls back rows created inside it
    when UserProfile creation fails afterward, rather than trusting that it
    does what it says. super().save_user() is stubbed with a side_effect
    that performs real User/SocialAccount writes (mirroring what it does
    for real), so this stays a targeted test of the atomic wrap itself
    without dragging in allauth's unrelated internal request/session needs.
    """
    def _real_super_save_user(self, request, sociallogin, form=None):
        user = User.objects.create_user(username='atomic@test.com', email='atomic@test.com')
        SocialAccount.objects.create(user=user, provider='google', uid='uid-atomic-1')
        return user

    def test_profile_failure_rolls_back_the_django_user(self):
        adapter = SefariaSocialAccountAdapter()
        with patch.object(SefariaSocialAccountAdapter.__bases__[0], 'save_user', side_effect=self._real_super_save_user):
            with patch('sso.adapters.UserProfile') as mock_profile_cls:
                mock_profile_cls.return_value.assign_slug.side_effect = Exception('mongo is down')
                with self.assertRaisesMessage(Exception, 'mongo is down'):
                    adapter.save_user(MagicMock(), MagicMock(spec=SocialLogin))

        self.assertFalse(User.objects.filter(email='atomic@test.com').exists())
        self.assertFalse(SocialAccount.objects.filter(uid='uid-atomic-1').exists())


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

    @patch('sso.adapters.urllib.request.urlopen')
    def test_hanging_gravatar_is_bounded_and_swallowed(self, mock_urlopen):
        # Reproduces the actual failure mode a missing timeout= caused: a
        # gravatar.com that accepts the connection but never responds. A real
        # hang can't be reproduced in a fast/non-flaky unit test (the URL is
        # hardcoded to the real host), so this simulates what urlopen(...,
        # timeout=N) actually raises once N elapses -- socket.timeout wrapped
        # in URLError -- and asserts both that we're the ones enforcing a
        # bound (timeout= is actually passed) and that hitting it doesn't
        # propagate into the registration request.
        mock_urlopen.side_effect = urllib.error.URLError(socket.timeout('timed out'))
        import_gravatar(self._profile())  # must not raise
        self.assertEqual(mock_urlopen.call_args.kwargs.get('timeout'), 5)

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
