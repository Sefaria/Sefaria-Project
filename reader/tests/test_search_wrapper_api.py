"""Tests for the caller-input responses of reader.views.search_wrapper_api."""

import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from reader import views


class _FakeElasticsearchResponse:
    """Stands in for elasticsearch_dsl's Response on the success path."""

    def __init__(self, body):
        self._body = body

    def success(self):
        return True

    def to_dict(self):
        return SimpleNamespace(body=self._body)


class SearchWrapperApiTest(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def post(self, body, es6_compat=False):
        request = self.factory.post("/api/search-wrapper", data=body, content_type="application/json")
        return views.search_wrapper_api(request, es6_compat=es6_compat)

    def error_message(self, response):
        return json.loads(response.content)["error"]

    def test_unparseable_body_answers_400_json(self):
        response = self.post(b'{"query": "Genesis"')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(self.error_message(response), "Invalid JSON body.")

    def test_non_object_body_answers_400_json(self):
        response = self.post(b'["Genesis"]')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.error_message(response), "JSON body must be an object.")

    def test_missing_query_answers_400_json(self):
        response = self.post(json.dumps({"type": "text"}).encode())
        self.assertEqual(response.status_code, 400)
        self.assertIn("query", self.error_message(response))

    def test_non_string_query_answers_400_json(self):
        response = self.post(json.dumps({"query": ["Genesis"]}).encode())
        self.assertEqual(response.status_code, 400)
        self.assertIn("query", self.error_message(response))

    def test_es6_compat_flattens_total_on_success(self):
        body = {"hits": {"total": {"value": 3, "relation": "eq"}, "hits": []}}
        with patch(
            "elasticsearch_dsl.search.Search.execute",
            return_value=_FakeElasticsearchResponse(body),
        ):
            response = self.post(json.dumps({"query": "Genesis"}).encode(), es6_compat=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)["hits"]["total"], 3)
