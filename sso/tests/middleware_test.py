import sys

from django.http import HttpResponse
from django.test import TestCase, RequestFactory

from sefaria.system.middleware import ClearSsoNextCookieMiddleware

sys._called_from_test = True


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


class ClearSsoNextCookieMiddlewareOutcomeTest(TestCase):
    """
    request._sefaria_sso_outcome is set by SefariaAccountAdapter.get_login_redirect_url /
    get_signup_redirect_url, deep inside allauth's real OAuth completion flow — not
    practical to trigger via a full HTTP round trip in a unit test, so process_response
    is exercised directly here (RequestFactory request, no client), mirroring how
    adapters_test.py's SsoNextCookieRedirectTest isolates the adapter methods themselves.
    """
    def _middleware(self):
        return ClearSsoNextCookieMiddleware(get_response=lambda r: HttpResponse())

    def test_sets_outcome_cookie_when_flag_present_on_google_redirect_path(self):
        middleware = self._middleware()
        request = RequestFactory().post('/api/auth/google/redirect')
        request._sefaria_sso_outcome = 'created_new_account'
        response = middleware.process_response(request, HttpResponse())
        self.assertIn('sefaria_sso_outcome', response.cookies)
        self.assertEqual(response.cookies['sefaria_sso_outcome'].value, 'created_new_account')

    def test_sets_outcome_cookie_on_apple_callback_finish_path(self):
        middleware = self._middleware()
        request = RequestFactory().get('/accounts/apple/login/callback/finish/')
        request._sefaria_sso_outcome = 'existing_user_login'
        response = middleware.process_response(request, HttpResponse())
        self.assertIn('sefaria_sso_outcome', response.cookies)
        self.assertEqual(response.cookies['sefaria_sso_outcome'].value, 'existing_user_login')

    def test_no_outcome_cookie_when_flag_absent(self):
        middleware = self._middleware()
        request = RequestFactory().post('/api/auth/google/redirect')
        response = middleware.process_response(request, HttpResponse())
        self.assertNotIn('sefaria_sso_outcome', response.cookies)

    def test_no_outcome_cookie_on_unrelated_path_even_if_flag_present(self):
        middleware = self._middleware()
        request = RequestFactory().get('/api/auth/login')
        request._sefaria_sso_outcome = 'created_new_account'
        response = middleware.process_response(request, HttpResponse())
        self.assertNotIn('sefaria_sso_outcome', response.cookies)
