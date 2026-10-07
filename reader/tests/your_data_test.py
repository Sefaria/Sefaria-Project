import json

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.constants.model import READING_HISTORY_PAUSED_SETTING_KEY
from sefaria.model.trend import Trend
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db


class YourDataTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("yourdata")
        purge_test_profiles(self.user)
        self.profile = UserProfile(id=self.user.id)
        self.client.force_login(self.user)

    def tearDown(self):
        db.user_history.delete_many({"uid": self.user.id})
        db.trend.delete_many({"uid": self.user.id})
        purge_test_profiles(self.user)

    def read(self, tref, **extra):
        hist = {"ref": tref, "versions": {}, "language": "english"}
        hist.update(extra)
        return UserProfile(id=self.user.id).process_history_item(hist, None)

    def history_refs(self, saved=False):
        return sorted(h["ref"] for h in db.user_history.find({"uid": self.user.id, "saved": saved}))

    def post_history(self, action):
        return json.loads(self.client.post("/settings/your-data/history", {"action": action}).content)

    def add_trait(self):
        Trend({"name": "HebrewAbility", "value": 0.9, "datatype": "float", "period": "alltime",
               "scope": "user", "uid": self.user.id}).save()


class YourDataPageTest(YourDataTestCase):

    def test_page_shows_both_groups(self):
        self.read("Genesis 1:1")
        self.add_trait()
        html = self.client.get("/settings/your-data").content.decode("utf-8")

        self.assertIn("You told us", html)
        self.assertIn("Based on your reading", html)
        self.assertIn("Genesis 1:1", html)
        self.assertIn("Reads Hebrew", html)
        self.assertIn('data-status="on"', html)

    def test_anonymous_user_is_sent_to_login(self):
        self.client.logout()
        response = self.client.get("/settings/your-data")

        self.assertEqual(response.status_code, 302)


class PauseHistoryTest(YourDataTestCase):

    def test_pause_keeps_history_and_stops_recording_reads(self):
        self.read("Genesis 1:1")
        self.post_history("pause")
        self.read("Exodus 1:1")

        self.assertEqual(self.history_refs(), ["Genesis 1:1"])
        self.assertIs(UserProfile(id=self.user.id).settings[READING_HISTORY_PAUSED_SETTING_KEY], True)

    def test_saving_still_works_while_paused(self):
        self.post_history("pause")
        self.read("Exodus 1:1", action="add_saved")

        self.assertEqual(self.history_refs(saved=True), ["Exodus 1:1"])

    def test_resume_records_again(self):
        self.post_history("pause")
        data = self.post_history("resume")
        self.read("Exodus 1:1")

        self.assertFalse(data["history"]["paused"])
        self.assertEqual(self.history_refs(), ["Exodus 1:1"])


class ClearHistoryTest(YourDataTestCase):

    def test_clear_removes_history_and_traits_but_keeps_saved(self):
        self.read("Genesis 1:1")
        self.read("Exodus 1:1", action="add_saved")
        self.add_trait()

        data = self.post_history("clear")

        self.assertEqual(data["history"]["count"], 0)
        self.assertEqual(self.history_refs(), [])
        self.assertEqual(self.history_refs(saved=True), ["Exodus 1:1"])
        self.assertEqual(db.trend.count_documents({"uid": self.user.id}), 0)

    def test_unknown_action_is_rejected(self):
        self.assertIn("error", self.post_history("drop-everything"))


class ExportTest(YourDataTestCase):

    def test_export_is_a_json_download_without_credentials(self):
        self.read("Genesis 1:1")
        profile = UserProfile(id=self.user.id)
        profile.update({"gauth_token": {"secret": "x"}})
        profile.save()

        response = self.client.get("/settings/your-data/export")
        payload = json.loads(response.content)

        self.assertIn("attachment", response["Content-Disposition"])
        self.assertEqual(payload["you_told_us"]["account"]["email"], self.user.email)
        self.assertNotIn("gauth_token", payload["you_told_us"]["profile"])
        self.assertEqual([h["ref"] for h in payload["based_on_your_reading"]["reading_history"]], ["Genesis 1:1"])
