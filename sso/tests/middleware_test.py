import sys

from django.test import TestCase

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
