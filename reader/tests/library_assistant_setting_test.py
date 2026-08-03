import json
import re
from unittest import mock

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.helper import library_assistant
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db


class LibraryAssistantUserTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("la")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def stored_setting(self):
        profile = db.profiles.find_one({"id": self.user.id}) or {}
        return profile.get("settings", {}).get(SETTING_KEY, "<absent>")

    def post_profile(self, payload):
        self.client.force_login(self.user)
        return self.client.post("/api/profile", {"json": json.dumps(payload)})

    def post_setting(self, value):
        return self.post_profile({"settings": {SETTING_KEY: value}})


class ProfileApiTest(LibraryAssistantUserTestCase):
    """
    /api/profile is the settings page's write path and a public endpoint.
    """

    def test_toggle_off_persists_and_disables(self):
        self.post_setting(False)

        self.assertIs(self.stored_setting(), False)
        self.assertFalse(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_toggle_back_on(self):
        self.post_setting(False)
        self.post_setting(True)

        self.assertIs(self.stored_setting(), True)
        self.assertTrue(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_posted_string_false_is_not_truthy(self):
        self.post_setting("false")

        self.assertIs(self.stored_setting(), False)
        self.assertFalse(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_other_settings_are_untouched_by_the_toggle(self):
        profile = UserProfile(id=self.user.id)
        profile.update({"settings": {"interface_language": "hebrew"}})
        profile.save()

        self.post_setting(False)

        self.assertEqual(UserProfile(id=self.user.id).settings.get("interface_language"), "hebrew")

    def test_crm_hears_once_per_change(self):
        # A never-enrolled user is already off, so only a real flip counts.
        with mock.patch("sefaria.helper.library_assistant.notify_crm_of_change") as notify:
            self.post_setting(True)
            self.assertEqual(notify.call_count, 1)

            # Re-posting the same value is not a change.
            self.post_setting(True)
            self.assertEqual(notify.call_count, 1)

            self.post_setting(False)
            self.assertEqual(notify.call_count, 2)


class ProfileSyncApiTest(LibraryAssistantUserTestCase):
    """
    /api/profile/sync is the mobile app's settings write path — also public.
    """
    url = "/api/profile/sync"

    def sync_settings(self, settings, time_stamp=1):
        self.client.force_login(self.user)
        return self.client.post(self.url, {
            "settings": json.dumps({**settings, "time_stamp": time_stamp}),
        })

    def test_posted_string_false_is_not_truthy(self):
        self.sync_settings({SETTING_KEY: "false"})

        self.assertIs(self.stored_setting(), False)
        self.assertFalse(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_toggle_on_persists(self):
        self.sync_settings({SETTING_KEY: True})

        self.assertIs(self.stored_setting(), True)

    def test_crm_hears_about_a_change(self):
        with mock.patch("sefaria.helper.library_assistant.notify_crm_of_change") as notify:
            self.sync_settings({SETTING_KEY: True})
            self.assertEqual(notify.call_count, 1)

    def test_crm_stays_quiet_when_the_value_does_not_change(self):
        # The user is already off; syncing "off" is not a change.
        with mock.patch("sefaria.helper.library_assistant.notify_crm_of_change") as notify:
            self.sync_settings({SETTING_KEY: False})
            self.assertEqual(notify.call_count, 0)

    def test_crm_stays_quiet_for_unrelated_settings(self):
        with mock.patch("sefaria.helper.library_assistant.notify_crm_of_change") as notify:
            self.sync_settings({"interface_language": "hebrew"})
            self.assertEqual(notify.call_count, 0)


class ScriptTagGateTest(LibraryAssistantUserTestCase):
    """
    The assistant bundle is injected by templates/base.html from the chatbot_user_token
    context processor.
    """

    def context(self):
        from sefaria.system.context_processors import chatbot_user_token
        request = mock.Mock()
        request.user = self.user
        request.path = "/Genesis.1"  # the @user_only decorator skips /api/ and friends
        request.GET = {}
        request.session = {}
        return chatbot_user_token(request)

    def test_unmigrated_profile_gets_no_script(self):
        self.assertIsNone(self.context()["chatbot_script_url"])

    def test_setting_on_gets_the_script(self):
        library_assistant.set_enabled(self.user, True, notify_crm=False)

        self.assertIsNotNone(self.context()["chatbot_script_url"])


class AccountSettingsPageTest(LibraryAssistantUserTestCase):
    """
    The toggle is available to every logged-in user and renders the stored value.
    """
    url = "/settings/account"

    def get_page(self):
        self.client.force_login(self.user)
        return self.client.get(self.url).content.decode("utf-8")

    def assertToggleShows(self, html, on):
        section = html.split('id="libraryAssistantSetting"', 1)[1]
        checked = re.search(r'data-value=true[^>]*aria-checked="(true|false)"', section)
        self.assertIsNotNone(checked, "Library Assistant toggle not found on the page")
        self.assertEqual(checked.group(1) == "true", on)

    def test_toggle_is_rendered_for_every_logged_in_user(self):
        self.assertIn('id="libraryAssistantSetting"', self.get_page())

    def test_unmigrated_profile_shows_off(self):
        self.assertToggleShows(self.get_page(), on=False)

    def test_setting_on_shows_on(self):
        library_assistant.set_enabled(self.user, True, notify_crm=False)

        self.assertToggleShows(self.get_page(), on=True)

    def test_setting_off_shows_off(self):
        library_assistant.set_enabled(self.user, False, notify_crm=False)

        self.assertToggleShows(self.get_page(), on=False)
