import json
import sys

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import resolve

sys._called_from_test = True

from allauth.socialaccount.models import SocialAccount

import sso.views as sso_views


class DisconnectRefusedTest(TestCase):
    """
    A user with a password and a linked Google account must not be able to
    unlink it by any allauth route. (An SSO-only user's last account is already
    protected by allauth itself, so these use a password user.)
    """
    def setUp(self):
        self.user = User.objects.create_user(username="dc@test.com", email="dc@test.com", password="secret")
        self.account = SocialAccount.objects.create(user=self.user, provider="google", uid="g-1")
        self.client.force_login(self.user)

    def assert_account_kept(self):
        self.assertTrue(SocialAccount.objects.filter(pk=self.account.pk).exists())

    def test_connections_page_post_keeps_account(self):
        res = self.client.post("/accounts/3rdparty/", {"account": self.account.pk})

        self.assertEqual(res.status_code, 200)
        self.assert_account_kept()

    def test_connections_page_ajax_post_is_refused(self):
        res = self.client.post(
            "/accounts/3rdparty/",
            {"account": self.account.pk},
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )

        self.assertEqual(res.status_code, 400)
        self.assert_account_kept()

    def _headless_delete(self, client_type, **headers):
        return self.client.delete(
            f"/_allauth/{client_type}/v1/account/providers",
            data=json.dumps({"provider": "google", "account": "g-1"}),
            content_type="application/json",
            **headers,
        )

    def test_headless_browser_delete_is_refused(self):
        res = self._headless_delete("browser")

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"][0]["code"], "disconnect_disabled")
        self.assert_account_kept()

    def test_headless_app_delete_is_refused(self):
        self.client.logout()
        login = self.client.post(
            "/_allauth/app/v1/auth/login",
            data=json.dumps({"email": "dc@test.com", "password": "secret"}),
            content_type="application/json",
        )
        self.assertEqual(login.status_code, 200)
        token = login.json()["meta"]["session_token"]

        res = self._headless_delete("app", HTTP_X_SESSION_TOKEN=token)

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"][0]["code"], "disconnect_disabled")
        self.assert_account_kept()


class SsoLoginRoutesTest(TestCase):
    URLCONFS = ("sefaria.urls_library", "sefaria.urls_sheets")

    def test_allauth_login_and_callback_routes_resolve(self):
        expected = {
            "/accounts/google/login/": "google_login",
            "/accounts/google/login/callback/": "google_callback",
            "/accounts/apple/login/": "apple_login",
            "/accounts/apple/login/callback/": "apple_callback",
            "/accounts/apple/login/callback/finish/": "apple_finish_callback",
        }
        for urlconf in self.URLCONFS:
            for path, url_name in expected.items():
                with self.subTest(urlconf=urlconf, path=path):
                    self.assertEqual(resolve(path, urlconf=urlconf).url_name, url_name)

    def test_sefaria_sso_routes_resolve(self):
        expected = {
            "/api/auth/google/mobile": sso_views.google_mobile,
            "/api/auth/google/callback": sso_views.google_web,
            "/api/auth/apple/mobile": sso_views.apple_mobile,
            "/api/auth/apple/callback": sso_views.apple_callback,
        }
        for urlconf in self.URLCONFS:
            for path, func in expected.items():
                with self.subTest(urlconf=urlconf, path=path):
                    self.assertEqual(resolve(path, urlconf=urlconf).func, func)

    def test_headless_provider_token_routes_resolve(self):
        for urlconf in self.URLCONFS:
            for client_type in ("browser", "app"):
                path = f"/_allauth/{client_type}/v1/auth/provider/token"
                with self.subTest(urlconf=urlconf, path=path):
                    self.assertEqual(resolve(path, urlconf=urlconf).url_name, "provider_token")
