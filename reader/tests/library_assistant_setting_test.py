import json
import uuid
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase

from sefaria.helper import library_assistant
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db


class LibraryAssistantSettingTest(TestCase):
    """
    The Library Assistant is a plain user setting: on by default, toggled from account
    settings, and independent of the experiments program.
    """
    databases = "__all__"

    def setUp(self):
        token = uuid.uuid4().hex
        self.user = User.objects.create_user(
            username=f"la-setting-{token}",
            email=f"la-setting-{token}@example.com",
            password="password",
        )
        db.profiles.delete_many({"id": self.user.id})

    def tearDown(self):
        db.profiles.delete_many({"id": self.user.id})

    def stored(self):
        profile = db.profiles.find_one({"id": self.user.id}) or {}
        return profile.get("settings", {}).get(SETTING_KEY)

    def post_setting(self, value):
        self.client.force_login(self.user)
        return self.client.post(
            "/api/profile",
            {"json": json.dumps({"settings": {SETTING_KEY: value}})},
        )

    def test_on_by_default_without_any_experiments_enrollment(self):
        # No UserExperimentSettings row exists for this user — the assistant is on anyway.
        self.assertTrue(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_toggle_off_persists_and_disables(self):
        self.post_setting(False)

        self.assertFalse(self.stored())
        self.assertFalse(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_toggle_back_on(self):
        self.post_setting(False)
        self.post_setting(True)

        self.assertTrue(self.stored())
        self.assertTrue(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_posted_string_false_is_not_truthy(self):
        # /api/profile is a public endpoint; a JSON string must not read as "on".
        self.post_setting("false")

        self.assertFalse(self.stored())
        self.assertFalse(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_change_notifies_crm_once(self):
        with mock.patch("sefaria.helper.library_assistant.notify_crm_of_change") as notify:
            self.post_setting(False)
            self.assertEqual(notify.call_count, 1)

            # Re-posting the same value is not a change.
            self.post_setting(False)
            self.assertEqual(notify.call_count, 1)

    def test_other_settings_are_untouched_by_the_toggle(self):
        profile = UserProfile(id=self.user.id)
        profile.update({"settings": {"interface_language": "hebrew"}})
        profile.save()

        self.post_setting(False)

        self.assertEqual(
            UserProfile(id=self.user.id).settings.get("interface_language"), "hebrew"
        )

    def test_anonymous_profile_is_not_enabled(self):
        self.assertFalse(library_assistant.is_enabled(None))
        self.assertFalse(library_assistant.is_enabled_for_user(None))

    def test_normalize(self):
        for truthy in (True, 1, "true", "True", "on"):
            self.assertTrue(library_assistant.normalize(truthy), truthy)
        for falsy in (False, 0, "false", "False", "0", "off", ""):
            self.assertFalse(library_assistant.normalize(falsy), falsy)


class LibraryAssistantScriptLoadingTest(TestCase):
    """
    The assistant bundle is injected by templates/base.html from the chatbot_user_token
    context processor. That gate is now the setting alone — no experiments whitelist.
    """
    databases = "__all__"

    def setUp(self):
        token = uuid.uuid4().hex
        self.user = User.objects.create_user(
            username=f"la-script-{token}",
            email=f"la-script-{token}@example.com",
            password="password",
        )
        db.profiles.delete_many({"id": self.user.id})

    def tearDown(self):
        db.profiles.delete_many({"id": self.user.id})

    def context(self):
        from sefaria.system.context_processors import chatbot_user_token
        request = mock.Mock()
        request.user = self.user
        request.GET = {}
        request.session = {}
        return chatbot_user_token(request)

    def test_script_url_present_by_default(self):
        self.assertIsNotNone(self.context()["chatbot_script_url"])

    def test_script_url_absent_when_toggled_off(self):
        library_assistant.set_enabled(self.user, False, notify_crm=False)

        self.assertIsNone(self.context()["chatbot_script_url"])
