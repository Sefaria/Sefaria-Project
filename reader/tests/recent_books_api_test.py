"""
/api/profile/recent_books and /api/profile/daily_places: the "currently learning" lists and the history
page's Books view.
"""

import json

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.model.user_profile import UserHistorySet, UserLastPlaceSet
from sefaria.utils.util import epoch_time


class RecentBooksApiTest(TestCase):
    def setUp(self):
        self.user = create_test_user("recent-books")

    def tearDown(self):
        UserHistorySet({"uid": self.user.id}).delete(bulk_delete=True)
        UserLastPlaceSet({"uid": self.user.id}).delete(bulk_delete=True)
        purge_test_profiles(self.user)

    def read(self, ref, time_stamp):
        self.client.force_login(self.user)
        hist = {"ref": ref, "versions": {}, "time_stamp": time_stamp}
        self.client.post("/api/profile/sync?no_return=1", {"user_history": json.dumps([hist])})

    def get(self, url):
        return json.loads(self.client.get(url).content)

    def test_logged_out_has_no_recent_books(self):
        self.assertEqual(self.get("/api/profile/recent_books"), [])

    def test_recent_books_at_their_last_place(self):
        now = epoch_time()
        self.read("Exodus 2:1", now - 60)
        self.read("Genesis 1:3", now)
        books = self.get("/api/profile/recent_books?limit=5")
        self.assertEqual([(b["book"], b["ref"]) for b in books], [("Genesis", "Genesis 1:3"), ("Exodus", "Exodus 2:1")])
        self.assertEqual([b["book"] for b in self.get("/api/profile/recent_books?limit=1")], ["Genesis"])

    def test_daily_places(self):
        now = epoch_time()
        self.read("Genesis 1:3", now - 60)
        data = self.get(f"/api/profile/daily_places?before={now + 1}&utc_offset=0")
        self.assertEqual([p["ref"] for p in data["places"]], ["Genesis 1:3"])
        self.assertIsNone(data["older"])

    def test_daily_places_needs_login_and_integer_params(self):
        self.assertIn("error", self.get("/api/profile/daily_places"))
        self.client.force_login(self.user)
        self.assertIn("error", self.get("/api/profile/daily_places?before=soon"))
