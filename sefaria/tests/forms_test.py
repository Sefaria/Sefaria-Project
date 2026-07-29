"""
Tests for sefaria/forms.py::SefariaNewUserForm.clean_email — the SSO branch
replaced a single generic "already exists" ValidationError with provider-
specific messaging (Google/Apple/generic) based on the existing user's
SocialAccount rows, inside the pre-existing User-Seed bypass. Exercised
directly against clean_email() rather than through full form validation,
since is_valid() would also require a real reCAPTCHA response — the
"no existing user" short-circuit above this branching predates the SSO
branch and isn't retested here.
"""
from django.contrib.auth.models import User, Group
from django.core.exceptions import ValidationError
from django.test import TestCase
from allauth.socialaccount.models import SocialAccount

from sefaria.forms import SefariaNewUserForm, SEED_GROUP


class CleanEmailTest(TestCase):
    def _clean(self, email):
        form = SefariaNewUserForm()
        form.cleaned_data = {"email": email}
        return form.clean_email()

    def test_existing_email_with_no_social_account_gets_generic_message(self):
        User.objects.create_user(username="plain@test.com", email="plain@test.com", password="x")
        with self.assertRaisesMessage(ValidationError, "An account with this email address already exists."):
            self._clean("plain@test.com")

    def test_existing_email_linked_to_google_gets_google_message(self):
        user = User.objects.create_user(username="g@test.com", email="g@test.com", password="x")
        SocialAccount.objects.create(user=user, provider="google", uid="123")
        with self.assertRaisesMessage(ValidationError, "This email address is already registered via Google Sign-In."):
            self._clean("g@test.com")

    def test_existing_email_linked_to_apple_gets_apple_message(self):
        user = User.objects.create_user(username="a@test.com", email="a@test.com", password="x")
        SocialAccount.objects.create(user=user, provider="apple", uid="456")
        with self.assertRaisesMessage(ValidationError, "This email address is already registered via Apple Sign-In."):
            self._clean("a@test.com")

    def test_seed_group_member_bypasses_all_existing_email_checks(self):
        # Pre-existing "User Seeds" bypass must still work even for a seeded
        # account that also happens to have a SocialAccount row — the new
        # provider branching sits inside this bypass and must not shadow it.
        group = Group.objects.create(name=SEED_GROUP)
        user = User.objects.create_user(username="seed@test.com", email="seed@test.com", password="x")
        user.groups.add(group)
        SocialAccount.objects.create(user=user, provider="google", uid="789")
        self.assertEqual(self._clean("seed@test.com"), "seed@test.com")
