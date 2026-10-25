"""
N-M12: developer email confirmation writes allauth EmailAddress rows. Email login and password
reset must treat such an account exactly like one that never confirmed, before and after the
account email changes.
"""
import json
import re

from django.core import mail
from django.test import Client, TestCase, override_settings

from reader.conftest import create_test_user, purge_test_profiles

PASSWORD = "password"


@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
class EmailAddressSideEffectsTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.confirmed = create_test_user("allauthconfirmed")
        self.plain = create_test_user("allauthplain")
        purge_test_profiles(self.confirmed, self.plain)
        self.confirm_through_developer_settings(self.confirmed)

    def tearDown(self):
        purge_test_profiles(self.confirmed, self.plain)

    def confirm_through_developer_settings(self, user):
        client = Client()
        client.force_login(user)
        client.post("/api/developer/confirmation", "", content_type="application/json")
        link = re.search(r"https?://\S+/settings/developer/confirm-email/\S+", mail.outbox[-1].body).group(0)
        assert Client().get(link).status_code == 302
        mail.outbox.clear()
        return client

    def change_email(self, user):
        old = user.email
        user.email = "new-" + old
        user.username = user.email
        user.save()
        return old

    def login(self, email):
        response = Client().post("/api/auth/login", json.dumps({"email": email, "password": PASSWORD}),
                                 content_type="application/json")
        return response.status_code

    def reset_link_sent(self, email):
        mail.outbox.clear()
        response = Client().post("/api/auth/password/reset", json.dumps({"email": email}),
                                 content_type="application/json")
        sent = any("/password/reset/confirm/" in m.body for m in mail.outbox)
        mail.outbox.clear()
        return response.status_code, sent

    def outcomes(self, user, old_email=None):
        result = {"login": self.login(user.email), "reset": self.reset_link_sent(user.email)}
        if old_email:
            result["login with the old email"] = self.login(old_email)
            result["reset with the old email"] = self.reset_link_sent(old_email)
        return result

    def test_N_M12_a_confirmed_account_logs_in_and_resets_its_password_like_any_other(self):
        plain = self.outcomes(self.plain)

        self.assertEqual(plain, {"login": 200, "reset": (200, True)})
        self.assertEqual(self.outcomes(self.confirmed), plain)

    def test_N_M12_after_an_email_change_the_old_address_no_longer_logs_in(self):
        plain = self.outcomes(self.plain, self.change_email(self.plain))
        confirmed_old = self.change_email(self.confirmed)
        client = Client()
        client.force_login(self.confirmed)
        client.post("/api/developer/confirmation", "", content_type="application/json")

        confirmed = self.outcomes(self.confirmed, confirmed_old)

        self.assertEqual(plain["login with the old email"], 401)
        self.assertEqual(plain["reset with the old email"], (200, False))
        self.assertEqual(confirmed, plain)
