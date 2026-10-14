from allauth.socialaccount.models import SocialAccount
from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles


class AccountSettingsLoginMethodTest(TestCase):
    """
    The change-email form needs the current password to submit, so it is shown
    exactly when the user has a usable password -- not when they have no linked
    provider. SSO-only users see which provider they signed in with instead.
    """
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("settings-login")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def link(self, provider):
        SocialAccount.objects.create(user=self.user, provider=provider, uid=f"{provider}-{self.user.id}")

    def make_sso_only(self):
        self.user.set_unusable_password()
        self.user.save()

    def render(self):
        self.client.force_login(self.user)
        response = self.client.get("/settings/account")
        self.assertEqual(response.status_code, 200)
        return response.content.decode()

    def test_password_user_sees_change_email(self):
        html = self.render()

        self.assertIn('id="change-email"', html)
        self.assertNotIn("loginMethodText", html)

    def test_password_user_with_linked_provider_keeps_change_email(self):
        self.link("google")

        html = self.render()

        self.assertIn('id="change-email"', html)

    def test_sso_only_user_sees_provider_not_change_email(self):
        self.link("google")
        self.make_sso_only()

        html = self.render()

        self.assertNotIn('id="change-email"', html)
        self.assertIn("Google Sign-In with", html)

    def test_sso_only_user_with_both_providers(self):
        self.link("google")
        self.link("apple")
        self.make_sso_only()

        html = self.render()

        self.assertIn("Google & Apple Sign-In with", html)
