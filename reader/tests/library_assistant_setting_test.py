import json
import re
from unittest import mock

from django.contrib.auth.models import AnonymousUser
from django.test import TestCase

from reader.conftest import create_test_user, make_profile_missing_la_setting, purge_test_profiles
from reader.models import UserExperimentSettings, _set_user_experiments
from reader.views import chatbot_access_props
from sefaria.helper import library_assistant
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile
from sefaria.system.context_processors import chatbot_user_token
from sefaria.system.database import db


class LibraryAssistantUserTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("la")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)
        UserExperimentSettings.objects.filter(user=self.user).delete()

    def stored_setting(self):
        profile = db.profiles.find_one({"id": self.user.id}) or {}
        return profile.get("settings", {}).get(SETTING_KEY, "<absent>")

    def enroll_in_experiments(self, experiments):
        """Put the user on the whitelist exactly as the opt-in paths do."""
        with mock.patch("reader.models.dispatch_chatbot_opt_in_webhook"):
            _set_user_experiments(self.user, experiments)

    def post_profile(self, payload):
        self.client.force_login(self.user)
        return self.client.post("/api/profile", {"json": json.dumps(payload)})

    def post_setting(self, value):
        return self.post_profile({"settings": {SETTING_KEY: value}})


class ProfileCreationTest(LibraryAssistantUserTestCase):
    """
    The key is written at the single point every profile-creation path passes
    through: UserProfile.__init__, when no stored doc exists yet.
    """

    def test_new_profile_is_created_with_the_setting_on(self):
        UserProfile(id=self.user.id)

        self.assertIs(self.stored_setting(), True)


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

    def test_saving_unrelated_settings_leaves_a_legacy_user_alone(self):
        # On through the pre-migration rule, with no setting key of their own. Saving
        # something else must not write a value for them.
        self.enroll_in_experiments(True)
        make_profile_missing_la_setting(self.user)

        self.post_profile({"settings": {"interface_language": "hebrew"}})

        self.assertEqual(self.stored_setting(), "<absent>")
        self.assertTrue(library_assistant.is_enabled(UserProfile(id=self.user.id)))


class ProfileSyncApiTest(LibraryAssistantUserTestCase):
    """
    /api/profile/sync is the mobile app's settings write path — also public.
    """

    url = "/api/profile/sync"

    def sync_settings(self, settings, time_stamp=1):
        self.client.force_login(self.user)
        return self.client.post(
            self.url,
            {
                "settings": json.dumps({**settings, "time_stamp": time_stamp}),
            },
        )

    def test_posted_string_false_is_not_truthy(self):
        self.sync_settings({SETTING_KEY: "false"})

        self.assertIs(self.stored_setting(), False)
        self.assertFalse(library_assistant.is_enabled(UserProfile(id=self.user.id)))

    def test_toggle_on_persists(self):
        self.sync_settings({SETTING_KEY: True})

        self.assertIs(self.stored_setting(), True)


class ScriptTagGateTest(LibraryAssistantUserTestCase):
    """
    The assistant bundle is injected by templates/base.html from the chatbot_user_token
    context processor.
    """

    def context(self):
        request = mock.Mock()
        request.user = self.user
        request.path = "/Genesis.1"  # the @user_only decorator skips /api/ and friends
        request.GET = {}
        request.session = {}
        return chatbot_user_token(request)

    def test_absent_setting_keeps_todays_behavior(self):
        # Never enrolled: no script, exactly as before the setting existed.
        make_profile_missing_la_setting(self.user)

        self.assertIsNone(self.context()["chatbot_script_url"])

    def test_legacy_enrolled_user_still_gets_the_script(self):
        self.enroll_in_experiments(True)
        make_profile_missing_la_setting(self.user)

        self.assertIsNotNone(self.context()["chatbot_script_url"])

    def test_legacy_opt_out_still_gets_nothing(self):
        self.enroll_in_experiments(False)
        make_profile_missing_la_setting(self.user)

        self.assertIsNone(self.context()["chatbot_script_url"])

    def test_setting_on_gets_the_script_without_any_enrollment(self):
        library_assistant.set_enabled(self.user, True)

        self.assertIsNotNone(self.context()["chatbot_script_url"])

    def test_setting_off_beats_legacy_enrollment(self):
        self.enroll_in_experiments(True)
        library_assistant.set_enabled(self.user, False)

        self.assertIsNone(self.context()["chatbot_script_url"])


class AccountSettingsPageTest(LibraryAssistantUserTestCase):
    """
    The account page no longer carries the toggle; it moved to the Library Assistant tab.
    """

    url = "/settings/account"

    def get_page(self):
        self.client.force_login(self.user)
        return self.client.get(self.url).content.decode("utf-8")

    def test_toggle_is_no_longer_on_the_account_page(self):
        html = self.get_page()

        self.assertNotIn('id="libraryAssistantSetting"', html)
        self.assertNotIn("library_assistant", html)

    def test_tab_bar_marks_account_settings_as_current(self):
        html = self.get_page()

        self.assertIn('<a href="/settings/account" aria-current="page">', html)
        self.assertIn('<a href="/settings/library-assistant">', html)


class LibraryAssistantSettingsPageTest(LibraryAssistantUserTestCase):
    """
    The Library Assistant tab mounts the React panel and hands it the *effective* on/off value.
    """

    url = "/settings/library-assistant"

    def get_page(self):
        self.client.force_login(self.user)
        return self.client.get(self.url).content.decode("utf-8")

    def assertMountShows(self, html, on):
        found = re.search(r'id="libraryAssistantSettings"\s+data-library-assistant-enabled="(true|false)"', html)
        self.assertIsNotNone(found, "Library Assistant mount point not found on the page")
        self.assertEqual(found.group(1) == "true", on)

    def test_requires_login(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 302)
        self.assertIn("login", response["Location"])

    def test_mounts_the_react_component(self):
        html = self.get_page()

        self.assertIn("DJANGO_VARS.reactComponentName = 'LibraryAssistantSettings'", html)
        self.assertIn("DJANGO_VARS.containerId = 'libraryAssistantSettings'", html)

    def test_tab_bar_marks_library_assistant_as_current(self):
        html = self.get_page()

        self.assertIn('<a href="/settings/library-assistant" aria-current="page">', html)
        self.assertIn('<a href="/settings/account">', html)

    def test_never_enrolled_user_sees_off(self):
        make_profile_missing_la_setting(self.user)

        self.assertMountShows(self.get_page(), on=False)

    def test_legacy_enrolled_user_sees_on(self):
        self.enroll_in_experiments(True)
        make_profile_missing_la_setting(self.user)

        self.assertMountShows(self.get_page(), on=True)

    def test_setting_beats_legacy_enrollment_in_the_rendered_value(self):
        self.enroll_in_experiments(True)
        library_assistant.set_enabled(self.user, False)

        self.assertMountShows(self.get_page(), on=False)


class ChatbotVersionPropTest(LibraryAssistantUserTestCase):
    """
    ?chatbot_version=N points the widget and the settings panel at a preview deployment. The request that
    carries it must already expose it in the page props, not only the next one.
    """

    url = "/settings/library-assistant"

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def props_version(self, query):
        html = self.client.get(self.url + query).content.decode("utf-8")
        found = re.search(r'"chatbot_version":\s*(null|"[^"]*"|-?\d+)', html)
        self.assertIsNotNone(found, "chatbot_version not found in the page props")
        return json.loads(found.group(1))

    def test_version_is_in_the_props_of_the_request_that_carries_it(self):
        self.assertEqual(str(self.props_version("?chatbot_version=9298")), "9298")
        self.assertEqual(self.client.session["chatbot_version"], "9298")

    def test_version_persists_to_the_next_request(self):
        self.props_version("?chatbot_version=9298")

        self.assertEqual(str(self.props_version("")), "9298")

    def test_no_parameter_means_no_version(self):
        self.assertIsNone(self.props_version(""))

    def test_clear_removes_the_version_on_that_request(self):
        self.props_version("?chatbot_version=9298")

        self.assertIsNone(self.props_version("?chatbot_version=clear"))
        self.assertNotIn("chatbot_version", self.client.session)

    def test_non_integer_is_not_exposed(self):
        self.assertIsNone(self.props_version("?chatbot_version=abc"))


class LoggedOutVisitorTest(TestCase):
    """
    Logged-out visitors get the assistant unless the remote config switch
    feature.chatbot.anonymous_enabled is set to false.
    """

    def request(self):
        request = mock.Mock()
        request.user = AnonymousUser()
        request.path = "/Genesis.1"  # the @user_only decorator skips /api/ and friends
        request.GET = {}
        request.session = {}
        return request

    def switch(self, **values):
        cache = mock.Mock()
        cache.get.side_effect = lambda key, default=None: values.get(key, default)
        return mock.patch("sefaria.helper.library_assistant.remoteConfigCache", cache)

    def test_gets_the_script_and_the_assistant_without_a_token(self):
        with self.switch():
            self.assertIsNotNone(chatbot_user_token(self.request())["chatbot_script_url"])
            props = chatbot_access_props(self.request(), None)
        self.assertTrue(props["chatbot_enabled"])
        self.assertIsNone(props["chatbot_user_token"])

    def test_switch_off_gets_nothing(self):
        with self.switch(**{library_assistant.CHATBOT_ANONYMOUS_ENABLED: False}):
            self.assertIsNone(chatbot_user_token(self.request())["chatbot_script_url"])
            props = chatbot_access_props(self.request(), None)
        self.assertFalse(props["chatbot_enabled"])
        self.assertIsNone(props["chatbot_user_token"])

    def test_gets_the_free_answer_limit_for_analytics(self):
        with self.switch(**{library_assistant.CHATBOT_ANONYMOUS_FREE_ANSWERS: 2}):
            props = chatbot_access_props(self.request(), None)
        self.assertEqual(props["chatbot_anon_free_answers"], 2)

    def test_no_limit_set_means_none_passed(self):
        with self.switch():
            props = chatbot_access_props(self.request(), None)
        self.assertIsNone(props["chatbot_anon_free_answers"])


class LoggedInFreeAnswerLimitTest(LibraryAssistantUserTestCase):
    def test_a_logged_in_user_gets_no_free_answer_limit(self):
        request = mock.Mock()
        request.user = self.user
        cache = mock.Mock()
        cache.get.side_effect = lambda key, default=None: (
            2 if key == library_assistant.CHATBOT_ANONYMOUS_FREE_ANSWERS else default
        )
        with mock.patch("sefaria.helper.library_assistant.remoteConfigCache", cache):
            props = chatbot_access_props(request, UserProfile(id=self.user.id))
        self.assertNotIn("chatbot_anon_free_answers", props)
