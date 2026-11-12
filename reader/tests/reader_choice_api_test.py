"""
The reader choice from the server's side (sefaria/helper/reader_choice.py), end to end through Django:

- /api/reader-choice (reader/views.py reader_choice_api): the new reader's own switch back to the classic reader, and
  the switch to the new one for whom the remote-config audience includes;
- /api/profile and /settings/account: the Account Settings switch, shown and honoured only for that audience;
- ReaderChoiceMiddleware: a stale `reader_version=next` cookie of someone the audience no longer includes is cleared.

Needs Postgres and the (empty) test Mongo for profiles; no library data.
"""

import json
from urllib.parse import urlparse

from django.conf import settings
from django.test import Client, TestCase, override_settings

from reader.conftest import create_test_user, purge_test_profiles
from remote_config import remoteConfigCache
from remote_config.keys import READER_NEXT_DISABLED, READER_OPTIN_AUDIENCE
from remote_config.models import RemoteConfigEntry, ValueType
from sefaria.model.user_profile import UserProfile

URL = "/api/reader-choice"


def _cleared(response):
    c = response.cookies.get("reader_version")
    return c is not None and c.value == "" and c["max-age"] == 0


@override_settings(READER_OPTIN=True)
class ReaderChoiceTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.staff = create_test_user("rc-staff")
        self.staff.is_staff = True
        self.staff.save()
        self.member = create_test_user("rc-member")
        purge_test_profiles(self.staff, self.member)
        self.set_audience(None)
        self.client = Client(enforce_csrf_checks=True)

    def tearDown(self):
        purge_test_profiles(self.staff, self.member)
        RemoteConfigEntry.objects.filter(key__in=[READER_OPTIN_AUDIENCE, READER_NEXT_DISABLED]).delete()
        remoteConfigCache.reload()

    def set_disabled(self, value):
        """The kill switch, as an admin sets it: a bool entry."""
        RemoteConfigEntry.objects.filter(key=READER_NEXT_DISABLED).delete()
        RemoteConfigEntry.objects.create(
            key=READER_NEXT_DISABLED, raw_value="1" if value else "0", value_type=ValueType.BOOL, is_active=True
        )
        remoteConfigCache.reload()

    def set_audience(self, value):
        RemoteConfigEntry.objects.filter(key=READER_OPTIN_AUDIENCE).delete()
        if value is not None:
            RemoteConfigEntry.objects.create(
                key=READER_OPTIN_AUDIENCE, raw_value=value, value_type=ValueType.STRING, is_active=True
            )
        remoteConfigCache.reload()

    def csrf(self):
        """A CSRF token the way the new reader gets one: GET /api/reader-choice sets the cookie, then X-CSRFToken."""
        self.client.get(URL)
        token = self.client.cookies.get("csrftoken")
        self.assertIsNotNone(token, "no csrftoken cookie to send")
        return token.value

    def post(self, reader, csrf=True, as_json=True):
        headers = {"HTTP_X_CSRFTOKEN": self.csrf()} if csrf else {}
        if as_json:
            return self.client.post(URL, json.dumps({"reader": reader}), content_type="application/json", **headers)
        return self.client.post(URL, {"reader": reader}, **headers)

    def saved(self, user):
        return (UserProfile(id=user.id).settings or {}).get("reader_version")


class ReaderChoiceApiTest(ReaderChoiceTestCase):
    def test_signed_out_switches_back_with_the_cookie_only(self):
        self.client.cookies["reader_version"] = "next"
        res = self.post("classic")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"reader": "classic", "saved": False})
        self.assertTrue(_cleared(res))
        self.assertIn("no-store", res["Cache-Control"])

    def test_a_browser_with_no_csrf_cookie_gets_one_from_the_get_and_can_switch_back(self):
        self.set_audience("all")  # keep the signed-out cookie, so only the view could clear it
        self.client.cookies["reader_version"] = "next"
        self.assertNotIn("csrftoken", self.client.cookies)
        got = self.client.get(URL)
        self.assertIn("csrftoken", got.cookies)
        res = self.client.post(
            URL,
            json.dumps({"reader": "classic"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(_cleared(res))

    def test_legacy_is_another_name_for_classic_and_a_form_post_works(self):
        res = self.post("legacy", as_json=False)
        self.assertEqual(res.json(), {"reader": "classic", "saved": False})

    def test_a_write_without_the_csrf_token_is_refused(self):
        self.set_audience("all")  # so the middleware keeps a signed-out cookie and only the view could clear it
        self.client.cookies["reader_version"] = "next"
        res = self.post("classic", csrf=False)
        self.assertEqual(res.status_code, 403)
        self.assertNotIn("reader_version", res.cookies)

    def test_signed_in_switch_back_is_saved_on_the_profile(self):
        self.client.force_login(self.member)
        self.client.cookies["reader_version"] = "next"
        res = self.post("classic")
        self.assertEqual(res.json(), {"reader": "classic", "saved": True})
        self.assertTrue(_cleared(res))
        self.assertEqual(self.saved(self.member), "classic")

    def test_staff_opt_in_sets_the_cookie_and_the_profile(self):
        self.client.force_login(self.staff)
        res = self.post("next")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"reader": "next", "saved": True})
        self.assertEqual(res.cookies["reader_version"].value, "next")
        self.assertEqual(self.saved(self.staff), "next")

    def test_a_member_may_opt_in_only_when_the_audience_is_all(self):
        self.client.force_login(self.member)
        res = self.post("next")
        self.assertEqual(res.status_code, 403)
        self.assertNotIn("reader_version", res.cookies)
        self.assertIsNone(self.saved(self.member))
        self.set_audience("all")
        res = self.post("next")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.cookies["reader_version"].value, "next")

    def test_signed_out_never_opts_in(self):
        self.set_audience("all")
        self.assertEqual(self.post("next").status_code, 403)

    def test_an_unknown_value_is_a_400(self):
        res = self.post("newest")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.json())

    @override_settings(READER_OPTIN=False)
    def test_where_the_choice_is_not_offered_only_switching_back_works(self):
        self.client.force_login(self.staff)
        self.assertEqual(self.post("next").status_code, 403)
        self.assertTrue(_cleared(self.post("classic")))

    def test_get_tells_the_client_what_it_can_offer(self):
        res = self.client.get(URL)
        self.assertEqual(
            res.json(),
            {"available": True, "disabled": False, "canChooseNext": False, "reader": "classic", "saved": None},
        )
        self.assertIn("no-store", res["Cache-Control"])
        self.client.force_login(self.staff)
        self.post("next")
        self.assertEqual(
            self.client.get(URL).json(),
            {"available": True, "disabled": False, "canChooseNext": True, "reader": "next", "saved": "next"},
        )

    def test_other_methods_are_refused(self):
        self.assertEqual(self.client.put(URL, HTTP_X_CSRFTOKEN=self.csrf()).status_code, 405)


class ProfileApiReaderChoiceTest(ReaderChoiceTestCase):
    """Account Settings saves through /api/profile; a member under the "staff" audience cannot opt in that way either."""

    def post_profile(self, value):
        return self.client.post(
            "/api/profile",
            {"json": json.dumps({"settings": {"reader_version": value}})},
            HTTP_X_CSRFTOKEN=self.csrf(),
        )

    def test_staff_opt_in_through_the_profile(self):
        self.client.force_login(self.staff)
        res = self.post_profile("next")
        self.assertEqual(res.cookies["reader_version"].value, "next")
        self.assertEqual(self.saved(self.staff), "next")

    def test_member_opt_in_is_ignored_while_the_audience_is_staff(self):
        self.client.force_login(self.member)
        res = self.post_profile("next")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("reader_version", res.cookies)
        self.assertIsNone(self.saved(self.member))

    def test_member_may_always_switch_back_through_the_profile(self):
        self.client.force_login(self.member)
        res = self.post_profile("classic")
        self.assertTrue(_cleared(res))
        self.assertEqual(self.saved(self.member), "classic")


class StaleCookieTest(ReaderChoiceTestCase):
    """The audience shrinks to staff: a member's old cookie goes on their next request to Django (here, any API call)."""

    def test_a_members_stale_cookie_is_cleared(self):
        self.client.force_login(self.member)
        self.client.cookies["reader_version"] = "next"
        self.assertTrue(_cleared(self.client.get("/api/library-assistant")))

    def test_staff_keep_theirs(self):
        self.client.force_login(self.staff)
        profile = UserProfile(id=self.staff.id)
        profile.update({"settings": {"reader_version": "next"}})
        profile.save()
        self.client.cookies["reader_version"] = "next"
        self.assertNotIn("reader_version", self.client.get("/api/library-assistant").cookies)

    def test_a_signed_out_cookie_is_cleared_unless_the_audience_is_all(self):
        self.client.cookies["reader_version"] = "next"
        self.assertTrue(_cleared(self.client.get("/api/library-assistant")))
        self.set_audience("all")
        self.client.cookies["reader_version"] = "next"
        self.assertNotIn("reader_version", self.client.get("/api/library-assistant").cookies)


class AccountSettingsSwitchTest(ReaderChoiceTestCase):
    """
    The switch on /settings/account is shown only to whom the audience includes. The page itself needs the webpack build (CI has
    it), so this reads the context the view hands the template, and the template's guard.
    """

    def context(self, user):
        from unittest import mock

        from django.http import HttpResponse

        self.client.force_login(user)
        with mock.patch("reader.views.render_template", return_value=HttpResponse("page")) as render:
            self.assertEqual(self.client.get("/settings/account").status_code, 200)
        return render.call_args.args[3]

    def test_staff_see_the_switch_and_members_do_not(self):
        self.assertTrue(self.context(self.staff)["reader_choice_available"])
        self.assertFalse(self.context(self.member)["reader_choice_available"])

    def test_members_see_it_when_the_audience_is_all(self):
        self.set_audience("all")
        self.assertTrue(self.context(self.member)["reader_choice_available"])

    @override_settings(READER_OPTIN=False)
    def test_nobody_sees_it_where_the_choice_is_not_offered(self):
        self.assertFalse(self.context(self.staff)["reader_choice_available"])

    def test_the_template_renders_the_switch_only_under_that_flag(self):
        from django.conf import settings

        with open(f"{settings.BASE_DIR}/templates/account_settings.html") as f:
            html = f.read()
        guarded = html.split("{% if reader_choice_available %}", 1)[1].split("{% endif %}", 1)[0]
        self.assertIn('id="newReaderSetting"', guarded)


# The Voices host is whatever this deployment's DOMAIN_MODULES says it is (sefaria/hosts.py routes on it at import).
VOICES = {"HTTP_HOST": urlparse(settings.DOMAIN_MODULES["en"]["voices"]).netloc}


class VoicesUntouchedTest(ReaderChoiceTestCase):
    """Owner rule: the Voices host is untouched by the reader choice."""

    def test_the_voices_host_has_no_reader_choice_endpoint(self):
        # (asked through the resolver: Voices' 404 page needs the webpack build)
        from django.urls import Resolver404, resolve

        from reader.views import reader_choice_api

        self.assertEqual(resolve(URL, urlconf="sefaria.urls_library").func, reader_choice_api)
        try:
            match = resolve(URL, urlconf="sefaria.urls_sheets")
        except Resolver404:
            return
        self.assertNotEqual(match.func, reader_choice_api)

    def test_a_stale_cookie_is_left_alone_on_voices(self):
        self.client.force_login(self.member)
        self.client.cookies["reader_version"] = "next"
        res = self.client.get("/api/library-assistant", **VOICES)
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("reader_version", res.cookies)
        # the same request on the Library clears it (so the test above is not vacuous)
        self.assertTrue(_cleared(self.client.get("/api/library-assistant")))

    def test_the_profile_api_on_voices_sets_no_cookie(self):
        self.client.force_login(self.staff)
        res = self.client.post(
            "/api/profile",
            {"json": json.dumps({"settings": {"reader_version": "next"}})},
            HTTP_X_CSRFTOKEN=self.csrf(),
            **VOICES,
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("reader_version", res.cookies)


class KillSwitchTest(ReaderChoiceTestCase):
    """feature.reader.next.disabled: Django never undoes the client's switch back to the classic reader."""

    def test_off_by_default(self):
        self.client.force_login(self.staff)
        self.assertFalse(self.client.get(URL).json()["disabled"])
        self.assertEqual(self.post("next").status_code, 200)

    def test_the_switch_to_next_is_refused_and_back_to_classic_still_works(self):
        self.set_disabled(True)
        self.client.force_login(self.staff)
        res = self.post("next")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(res.json()["disabled"])
        self.assertIn("switched off", res.json()["error"])
        self.assertNotEqual(self.saved(self.staff), "next")
        state = self.client.get(URL).json()
        self.assertTrue(state["disabled"])
        self.assertFalse(state["canChooseNext"])
        self.assertTrue(_cleared(self.post("classic")))

    def test_the_middleware_clears_next_for_staff_and_does_not_sync_it_back(self):
        profile = UserProfile(id=self.staff.id)
        profile.update({"settings": {"reader_version": "next"}})
        profile.save()
        self.set_disabled(True)
        self.client.force_login(self.staff)
        self.client.cookies["reader_version"] = "next"
        self.assertTrue(_cleared(self.client.get("/api/library-assistant")))
        del self.client.cookies["reader_version"]
        self.assertNotIn(
            "reader_version", self.client.get("/api/library-assistant").cookies
        )  # the sync hands out nothing

    def test_a_signed_out_next_cookie_is_cleared_even_with_the_audience_all(self):
        self.set_audience("all")
        self.set_disabled(True)
        self.client.cookies["reader_version"] = "next"
        self.assertTrue(_cleared(self.client.get("/api/library-assistant")))

    def test_voices_responses_are_untouched(self):
        self.set_disabled(True)
        self.client.force_login(self.staff)
        self.client.cookies["reader_version"] = "next"
        self.assertNotIn("reader_version", self.client.get("/api/library-assistant", **VOICES).cookies)

    def test_the_profile_api_drops_an_opt_in(self):
        self.set_disabled(True)
        self.client.force_login(self.staff)
        res = self.client.post(
            "/api/profile",
            {"json": json.dumps({"settings": {"reader_version": "next"}})},
            HTTP_X_CSRFTOKEN=self.csrf(),
        )
        self.assertNotIn("reader_version", res.cookies)
        self.assertNotEqual(self.saved(self.staff), "next")


class AccountSettingsKillSwitchTest(AccountSettingsSwitchTest):
    """While the kill switch is on, the switch is replaced by a short explanation, for those who would have seen it."""

    def test_the_switch_is_hidden_and_explained(self):
        self.set_disabled(True)
        ctx = self.context(self.staff)
        self.assertFalse(ctx["reader_choice_available"])
        self.assertTrue(ctx["new_reader_paused"])
        self.assertFalse(self.context(self.member)["new_reader_paused"])  # never offered it: nothing to explain

    def test_no_explanation_while_it_is_off(self):
        self.assertFalse(self.context(self.staff)["new_reader_paused"])

    def test_the_template_explains_without_a_toggle(self):
        from django.conf import settings

        with open(f"{settings.BASE_DIR}/templates/account_settings.html") as f:
            html = f.read()
        paused = html.split("{% elif new_reader_paused %}", 1)[1].split("{% endif %}", 1)[0]
        self.assertIn("switched off for now", paused)
        self.assertNotIn("toggleOption", paused)
