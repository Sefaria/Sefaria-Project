"""
GET /api/activity/<ref>/<lang>/<version>?type=&page= (reader/views.py segment_history_api): the JSON twin of the revision history
page (segment_history, templates/activity.html), for the new reader.

Runs without library data: Ref, Version and text_history are replaced by stand-ins, the same ones for the page and the API, so the
parity test checks that the API carries what the page was given.
"""

from datetime import datetime
from types import SimpleNamespace
from unittest import mock

from django.http import HttpResponse
from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.system.exceptions import InputError

URL = "/api/activity/Genesis.1.1/en/Test_Version"

_REFS = {
    "Genesis 1:1": ("Genesis 1:1", "בראשית א׳:א׳", "Genesis.1.1"),
    "Genesis.1.1": ("Genesis 1:1", "בראשית א׳:א׳", "Genesis.1.1"),
    "Genesis 1:2": ("Genesis 1:2", "בראשית א׳:ב׳", "Genesis.1.2"),
}


class _Ref:
    def __init__(self, tref):
        if tref not in _REFS:
            raise InputError(f"Could not find title in reference: {tref}")
        self._n = _REFS[tref]
        self.index = SimpleNamespace(title="Genesis")

    def normal(self):
        return self._n[0]

    def he_normal(self):
        return self._n[1]

    def url(self):
        return self._n[2]


class _Version:
    def load(self, query):
        if query.get("versionTitle") == "Test Version":
            return SimpleNamespace(versionTitle="Test Version", versionTitleInHebrew="גרסת בדיקה")
        return None


class SegmentHistoryApiTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("seg-history")
        purge_test_profiles(self.user)
        self.history = [
            {
                "rev_type": "edit text",
                "date": datetime(2026, 1, 2, 3, 4, 5),
                "user": self.user.id,
                "ref": "Genesis 1:1",
                "version": "Test Version",
                "language": "en",
                "diff_html": "<del>old</del><ins>new</ins>",
                "history_url": "/activity/Genesis.1.1/en/Test_Version",
                "method": "API",
            },
            {
                "rev_type": "add link",
                "date": datetime(2026, 1, 1),
                "user": self.user.id,
                "new": {"refs": ["Genesis 1:1", "Genesis 1:2"], "type": "commentary", "_id": object()},
                "old": None,
            },
        ]
        self.calls = []

        def text_history(oref, version, lang, filter_type=None, page=1):
            self.calls.append({"version": version, "lang": lang, "filter_type": filter_type, "page": page})
            return self.history

        self.patches = [
            mock.patch("reader.views.Ref", _Ref),
            mock.patch("reader.views.Version", _Version),
            mock.patch("reader.views.text_history", side_effect=text_history),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        purge_test_profiles(self.user)

    def get(self, url=URL, **params):
        return self.client.get(url, params)

    def test_answers_the_history_with_what_the_template_computed(self):
        res = self.get(type="edit_text", page="2")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(self.calls[-1], {"version": "Test Version", "lang": "en", "filter_type": "edit_text", "page": 2})
        self.assertEqual(
            {k: body[k] for k in ("ref", "heRef", "url", "lang", "version", "versionTitleInHebrew", "filterType", "page")},
            {
                "ref": "Genesis 1:1",
                "heRef": "בראשית א׳:א׳",
                "url": "/Genesis.1.1",
                "lang": "en",
                "version": "Test Version",
                "versionTitleInHebrew": "גרסת בדיקה",
                "filterType": "edit_text",
                "page": 2,
            },
        )
        self.assertFalse(body["hasMore"])
        edit, link = body["items"]
        self.assertEqual(edit["rev_type"], "edit text")
        self.assertEqual(edit["date"], "2026-01-02T03:04:05")
        self.assertEqual(edit["ref"], {"en": "Genesis 1:1", "he": "בראשית א׳:א׳", "url": "/Genesis.1.1"})
        self.assertEqual(edit["diff_html"], "<del>old</del><ins>new</ins>")
        self.assertEqual(edit["method"], "API")
        self.assertEqual(set(edit["user"]), {"name", "profileUrl"})  # nothing beyond what the page links
        self.assertEqual([r["en"] for r in link["linkRefs"]], ["Genesis 1:1", "Genesis 1:2"])
        self.assertEqual(link["new"]["type"], "commentary")
        self.assertIsInstance(link["new"]["_id"], str)  # anything JSON can't carry is passed as text

    def test_has_more_when_a_full_page_came_back(self):
        self.history = self.history * 50
        self.assertTrue(self.get().json()["hasMore"])

    def test_the_same_data_the_revision_history_page_is_given(self):
        self.client.force_login(self.user)
        with mock.patch("reader.views.render_template", return_value=HttpResponse("page")) as render:
            self.assertEqual(self.client.get("/activity/Genesis.1.1/en/Test_Version").status_code, 200)
        page = render.call_args.args[3]
        api = self.get().json()
        self.assertEqual(api["ref"], page["ref"])
        self.assertEqual(api["version"], page["version"])
        self.assertEqual(api["versionTitleInHebrew"], page["versionTitleInHebrew"])
        self.assertEqual(len(api["items"]), len(page["activity"]))
        for item, event in zip(api["items"], page["activity"]):
            self.assertEqual(item["rev_type"], event["rev_type"])
            self.assertEqual(item["date"], event["date"].isoformat())
            self.assertEqual(item["version"], event.get("version"))
            self.assertEqual(item["diff_html"], event.get("diff_html"))
            self.assertEqual(item["history_url"], event.get("history_url"))

    def test_signed_out_and_signed_in_get_the_same_answer(self):
        anonymous = self.get()
        self.client.force_login(self.user)
        signed_in = self.get()
        self.assertEqual(anonymous.json(), signed_in.json())
        self.assertNotIn("Set-Cookie", anonymous)

    def test_an_unknown_ref_or_version_is_a_404(self):
        res = self.get("/api/activity/Nowhere.1.1/en/Test_Version")
        self.assertEqual(res.status_code, 404)
        self.assertIn("error", res.json())
        res = self.get("/api/activity/Genesis.1.1/en/No_Such_Version")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.calls, [])

    def test_page_must_be_in_bounds(self):
        for page in ("0", "-3", "two", "10001", "99999999999999999999999"):
            res = self.get(page=page)
            self.assertEqual(res.status_code, 400, page)
            self.assertIn("error", res.json())
        self.assertEqual(self.calls, [])
        self.assertEqual(self.get(page="10000").status_code, 200)

    def test_only_get(self):
        self.assertEqual(self.client.post(URL).status_code, 405)
