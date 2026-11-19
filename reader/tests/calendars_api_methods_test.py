"""
HTTP method contract of the public calendars API.

calendars_api (/api/calendars) and parasha_next_read_api
(/api/calendars/next-read/<parasha>) each handle GET only. Every other method
used to fall through the last branch and return None, which Django turns into a
500. A browser CORS preflight (OPTIONS) from a cross-origin client hit exactly
that path, so OPTIONS must answer a 2xx preflight and any other method must
answer 405.
"""

from django.test import RequestFactory, SimpleTestCase

from reader.views import calendars_api, parasha_next_read_api

CALENDARS_URL = "/api/calendars"
NEXT_READ_URL = "/api/calendars/next-read/Bereshit"


class CalendarsApiMethodTest(SimpleTestCase):
    def test_calendars_options_preflight_returns_204(self):
        request = RequestFactory().options(CALENDARS_URL)
        response = calendars_api(request)
        self.assertEqual(response.status_code, 204)

    def test_calendars_unsupported_method_returns_405_with_allow_header(self):
        request = RequestFactory().put(CALENDARS_URL)
        response = calendars_api(request)
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.headers["Allow"], "GET, OPTIONS")

    def test_next_read_options_preflight_returns_204(self):
        request = RequestFactory().options(NEXT_READ_URL)
        response = parasha_next_read_api(request, parasha="Bereshit")
        self.assertEqual(response.status_code, 204)

    def test_next_read_unsupported_method_returns_405_with_allow_header(self):
        request = RequestFactory().put(NEXT_READ_URL)
        response = parasha_next_read_api(request, parasha="Bereshit")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.headers["Allow"], "GET, OPTIONS")
