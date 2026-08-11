import urllib.error
import uuid
from unittest import mock

from django.test import TestCase
from django_recaptcha.client import RecaptchaResponse

from reader.conftest import SYNTHETIC_USER_ID_FLOOR
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile


class RegistrationTestCase(TestCase):
    """
    Registration is the only place a brand new account is given a value for
    settings.library_assistant, and the key has no default to fall back on — an
    account that never gets the write simply has no value, which reads as off.
    Nothing else in the stack notices, so this is the layer that has to.

    Isolation: registration assigns the Django user id from the auto-increment
    sequence, so a freshly registered account lands in the low ids — exactly the
    range where a developer's `profiles` collection (a restore of the public
    production dump) holds real people, and exactly the range purge_test_profiles
    refuses to delete in. So rather than let the flow persist and then clean up,
    these tests intercept UserProfile.save and assert on the document it was about
    to store. Everything else registration does at those ids is a read.
    """
    databases = "__all__"

    def setUp(self):
        self.saved_profiles = []
        self.token = uuid.uuid4().hex[:12]

        self.patch(mock.patch.object(
            UserProfile, "save", autospec=True, side_effect=self._capture_save,
        ))
        # Real registration verifies a captcha, hands the address to Salesforce and
        # fetches a gravatar. None of that may leave the test process.
        self.patch(mock.patch(
            "django_recaptcha.fields.client.submit",
            return_value=RecaptchaResponse(is_valid=True),
        ))
        self.patch(mock.patch("sefaria.forms.CrmMediator"))
        self.patch(mock.patch(
            "urllib.request.urlopen",
            side_effect=urllib.error.URLError("network disabled in tests"),
        ))

    def patch(self, patcher):
        started = patcher.start()
        self.addCleanup(patcher.stop)
        return started

    def _capture_save(self, profile):
        self.saved_profiles.append(profile)
        return profile

    @property
    def email(self):
        return f"la-register-{self.token}@example.com"

    def registration_payload(self, **overrides):
        return {
            "email": self.email,
            "first_name": "LA",
            # A slug-unique last name: assign_slug walks the profiles collection
            # looking for a free slug, and a common name means a long walk.
            "last_name": f"Registrant{self.token}",
            "password1": "sefaria-test-passphrase-8342",
            "g-recaptcha-response": "stubbed",
            "next": "/",
            **overrides,
        }

    def registered_profile(self):
        self.assertEqual(
            len(self.saved_profiles), 1,
            "registration did not save exactly one profile",
        )
        return self.saved_profiles[0]


class RegisterViewTest(RegistrationTestCase):
    url = "/register"

    def register(self, **overrides):
        return self.client.post(self.url, self.registration_payload(**overrides))

    def test_registration_succeeds(self):
        # Guards the rest of the class: every other assertion here is worthless if
        # the form quietly rejected the submission.
        response = self.register()

        self.assertEqual(response.status_code, 302, getattr(response, "context", None))

    def test_new_account_gets_the_library_assistant_on(self):
        self.register()

        self.assertIs(self.registered_profile().settings.get(SETTING_KEY), True)

    def test_the_setting_is_part_of_the_document_that_gets_stored(self):
        # settings is assembled in memory and serialized on save; assert against the
        # document itself, so the test still speaks to what Mongo would receive.
        self.register()

        stored = self.registered_profile().to_mongo_dict()

        self.assertIs(stored["settings"][SETTING_KEY], True)

    def test_nothing_was_written_to_mongo(self):
        # The interception above is what keeps real profile documents safe; if it ever
        # stops covering the write, this fails rather than corrupting someone's data.
        self.register()

        self.assertIsNone(self.registered_profile()._id)

    def test_the_crm_contact_was_stubbed_out(self):
        # Registration really does try to create a Salesforce contact. Proving the
        # stub absorbed it is the difference between a repeatable test and one that
        # accumulates unreapable contacts in a real CRM.
        crm_mediator = self.patch(mock.patch("sefaria.forms.CrmMediator"))

        self.register()

        crm_mediator.return_value.create_crm_user.assert_called_once()


class SettingDefaultTest(TestCase):
    """
    The premise the registration write rests on: there is no default, so an account
    that misses the write has no value at all.
    """
    databases = "__all__"

    def test_a_fresh_profile_has_no_value_for_the_setting(self):
        profile = UserProfile(id=SYNTHETIC_USER_ID_FLOOR + 1)

        self.assertNotIn(SETTING_KEY, profile.settings)
