"""A transport failure on /api/search-wrapper must answer like an unsuccessful response.

`Search.execute()` raises `elastic_transport.ConnectionTimeout` (and its sibling
`elastic_transport.ConnectionError`) when the Elasticsearch connection times out or drops.
It does not return a response. The view already answers an unsuccessful response with a
JSON error body, so a transport failure is the same condition and must reach that branch
instead of escaping as an unhandled exception and an HTTP 500.

`get_elasticsearch_client_for_online_search` and `get_query_obj` are patched out: this is
about how the view reacts to `execute()`, so no Elasticsearch and no index is involved.
"""

import json
from unittest.mock import MagicMock, patch

from django.test import RequestFactory, SimpleTestCase
from elastic_transport import ConnectionError as ESConnectionError
from elastic_transport import ConnectionTimeout

from reader.views import search_wrapper_api


class SearchWrapperApiTransportFailureTest(SimpleTestCase):
    url = "/api/search-wrapper"

    def call(self, exception):
        """POST to the view with an Elasticsearch client whose execute() raises."""
        request = RequestFactory().post(
            self.url,
            data=json.dumps({"type": "text", "query": "shabbat"}),
            content_type="application/json",
        )
        search_obj = MagicMock()
        search_obj.execute.side_effect = exception
        with (
            patch("sefaria.helper.search.get_elasticsearch_client_for_online_search"),
            patch("reader.views.Search", return_value=MagicMock()),
            patch("reader.views.get_query_obj", return_value=search_obj),
        ):
            return search_wrapper_api(request)

    def test_connection_timeout_returns_the_json_error_body(self):
        response = self.call(ConnectionTimeout("Connection timed out"))

        self.assertEqual(response.status_code, 200)
        body = json.loads(response.content)
        self.assertIn("error", body)
        self.assertIn("Elasticsearch", body["error"])

    def test_connection_error_returns_the_json_error_body(self):
        response = self.call(ESConnectionError("Connection refused"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("error", json.loads(response.content))
