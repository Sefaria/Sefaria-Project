"""
HTTP method contract of topics_api (/api/topics/<slug> and /api/v2/topics/<slug>).

The view handles GET and POST. Every other method used to fall through the last
branch and return None, which Django turns into a 500. A browser CORS preflight
(OPTIONS) from a cross-origin client hit exactly that path, so OPTIONS must
answer a 2xx preflight and any other method must answer 405.
"""

from django.test import RequestFactory, SimpleTestCase

from reader.views import topics_api

URL = "/api/topics/meat"


class TopicsApiMethodTest(SimpleTestCase):
    def test_options_preflight_returns_204(self):
        request = RequestFactory().options(URL)
        response = topics_api(request, topic="meat")
        self.assertEqual(response.status_code, 204)

    def test_v2_options_preflight_returns_204(self):
        request = RequestFactory().options(URL)
        response = topics_api(request, topic="meat", v2=True)
        self.assertEqual(response.status_code, 204)

    def test_unsupported_method_returns_405_with_allow_header(self):
        request = RequestFactory().put(URL)
        response = topics_api(request, topic="meat")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.headers["Allow"], "GET, POST, OPTIONS")
