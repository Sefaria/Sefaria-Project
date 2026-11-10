"""
GET /api/topics-toc (reader/views.py topics_toc_api): the topics table of contents for the new reader, the JSON the old client
reads from data.js (topic_toc_json). The library is replaced by a stand-in, so this runs without library data.
"""

import json
from unittest.mock import patch

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles

TOC = [{"slug": "holidays", "en": "Holidays", "he": "חגים", "children": [{"slug": "purim", "en": "Purim", "he": "פורים"}]}]


class TopicsTocApiTest(TestCase):
    databases = "__all__"

    def get(self, url="/api/topics-toc"):
        with patch("reader.views.library.get_topic_toc_json", return_value=json.dumps(TOC)):
            return self.client.get(url)

    def test_answers_the_libraries_topic_toc_json(self):
        res = self.get()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res["Content-Type"].startswith("application/json"))
        self.assertEqual(res.json(), TOC)

    def test_a_trailing_slash_is_the_same_endpoint(self):
        self.assertEqual(self.get("/api/topics-toc/").json(), TOC)

    def test_the_same_for_every_visitor_and_nothing_personal_in_the_headers(self):
        user = create_test_user("topics-toc")
        try:
            anonymous = self.get()
            self.client.force_login(user)
            signed_in = self.get()
            self.assertEqual(anonymous.content, signed_in.content)
            self.assertNotIn("Set-Cookie", anonymous)
            self.assertNotIn("private", anonymous.get("Cache-Control", ""))
        finally:
            purge_test_profiles(user)

    def test_only_get(self):
        with patch("reader.views.library.get_topic_toc_json", return_value="[]"):
            self.assertEqual(self.client.post("/api/topics-toc").status_code, 405)
