"""
Tests for sefaria/views.py::CustomPasswordResetConfirmView — the JSON POST
behavior used by the React AuthPage (ResetView.jsx / ResetExpiredView.jsx),
layered on top of Django's PasswordResetConfirmView.

Only the JSON (POST) branches are covered here. The plain-GET page-load
branch renders the ReaderApp SPA shell via render_template ->
render_react_component, which calls out to the Node render server — that's
infrastructure, not new logic, and is exactly the kind of dependency
password_reset_urls_test.py (in this same directory) already avoids by
testing URL resolution only rather than executing the view. Every case below
is reachable without ever hitting that render path: Django's own dispatch()
routes an invalid link straight to CustomPasswordResetConfirmView's
render_to_response override, which branches on request.method and returns
JSON directly for POST; a valid link's real password-set POST also returns
JSON directly, never GET-ing the sentinel URL that would render the shell.

ROOT_URLCONF override and the "password_reset_confirm" URL name follow the
same setup already proven by password_reset_urls_test.py in this directory —
sefaria.urls_library pulls in urls_shared.shared_patterns, where both
"password_reset_confirm" and "register" are defined.
"""
import json

from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

INTERNAL_RESET_SESSION_TOKEN = "set-password"


@override_settings(ROOT_URLCONF="sefaria.urls_library")
class CustomPasswordResetConfirmViewTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reset-confirm@test.com", email="reset-confirm@test.com", password="OldPassw0rd!",
        )
        self.uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.real_token = default_token_generator.make_token(self.user)

    def _url(self, token):
        return reverse("password_reset_confirm", kwargs={"uidb64": self.uidb64, "token": token})

    def _post_json(self, url, body):
        return self.client.post(url, data=json.dumps(body), content_type="application/json")

    def _reach_validlink_state(self):
        """Mirrors what a real reset-link click does: GET the real-token URL
        (Django's dispatch() redirects it to the uidb64/set-password URL and
        stashes the real token in the session), then operate on that sentinel
        URL — never GET-ing it, since that branch renders the SPA shell."""
        redirect = self.client.get(self._url(self.real_token))
        self.assertEqual(redirect.status_code, 302)
        return self._url(INTERNAL_RESET_SESSION_TOKEN)

    # ---- invalid link -----------------------------------------------------

    def test_invalid_link_post_without_resend_returns_400(self):
        res = self._post_json(self._url("bogus-token"), {})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["_auth"]["code"], "invalid_reset_link")

    def test_invalid_link_resend_with_resolvable_user_sends_new_email_and_returns_200(self):
        mail.outbox = []
        res = self._post_json(self._url("bogus-token"), {"action": "resend"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {})
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)

    def test_invalid_link_resend_with_unresolvable_uid_returns_no_account_code(self):
        bad_uidb64 = urlsafe_base64_encode(force_bytes(999999))
        url = reverse("password_reset_confirm", kwargs={"uidb64": bad_uidb64, "token": "bogus-token"})
        res = self._post_json(url, {"action": "resend"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["_auth"]["code"], "no_account_for_link")

    # ---- valid link ---------------------------------------------------------

    def test_valid_link_sets_new_password_and_clears_session_token(self):
        sentinel_url = self._reach_validlink_state()

        res = self._post_json(sentinel_url, {
            "new_password1": "Xk7mQ9zLp2!",
            "new_password2": "Xk7mQ9zLp2!",
        })

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Xk7mQ9zLp2!"))
        self.assertNotIn(INTERNAL_RESET_SESSION_TOKEN, self.client.session)

    def test_valid_link_mismatched_passwords_returns_field_errors(self):
        sentinel_url = self._reach_validlink_state()

        res = self._post_json(sentinel_url, {
            "new_password1": "Xk7mQ9zLp2!",
            "new_password2": "SomethingElse9!",
        })

        self.assertEqual(res.status_code, 400)
        self.assertIn("new_password2", res.json())
        # The old password must still work — a mismatched confirmation must
        # not have been applied.
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPassw0rd!"))
