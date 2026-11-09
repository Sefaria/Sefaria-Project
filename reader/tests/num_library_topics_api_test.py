"""
GET /api/topics/library-count (reader/views.py num_library_topics_api): the new reader's source for the topics landing page's
"Search N Topics A-Z" (the old pages read numLibraryTopics from base_props). Placed before api/topics/<slug>, which would
otherwise read "library-count" as a topic.
"""

from unittest.mock import patch

from django.test import TestCase


class NumLibraryTopicsApiTest(TestCase):
    databases = "__all__"

    def test_answers_the_count_of_the_library_pool(self):
        with patch("reader.views.get_num_library_topics", return_value=5768):
            res = self.client.get("/api/topics/library-count")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"count": 5768})

    def test_a_trailing_slash_is_the_same_endpoint(self):
        with patch("reader.views.get_num_library_topics", return_value=12):
            self.assertEqual(self.client.get("/api/topics/library-count/").json(), {"count": 12})
