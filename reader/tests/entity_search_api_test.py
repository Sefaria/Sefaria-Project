"""
Paging contract of /api/entity-search (reader.views.entity_search_api).

Elasticsearch refuses any from/size request reading past its `max_result_window`, so the
endpoint has to cap paging somehow. The cap must shorten the final page, never slide
`start` backward — sliding it re-serves rows the caller already has, and because the
response still looks like a normal page the caller appends them as new results.

`entity_search` is patched out: this is about the argument arithmetic in the view, so no
Elasticsearch (and no index) is involved.
"""
from unittest.mock import patch

from django.test import TestCase

from sefaria.helper.search import ENTITY_MAX_RESULT_WINDOW

WINDOW = ENTITY_MAX_RESULT_WINDOW


class EntitySearchApiPagingTest(TestCase):
    databases = "__all__"
    url = "/api/entity-search"

    def call(self, **params):
        """GET the endpoint and return the (start, size) it asked entity_search for."""
        params.setdefault("q", "rashi")
        params.setdefault("type", "book")
        with patch("sefaria.helper.search.entity_search",
                   return_value={"hits": [], "total": 0}) as mock_search:
            response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(mock_search.called, "view returned before querying")
        kwargs = mock_search.call_args.kwargs
        return kwargs["start"], kwargs["size"]

    def test_ordinary_page_is_passed_through_untouched(self):
        self.assertEqual(self.call(start=40, size=20), (40, 20))

    def test_page_straddling_the_window_keeps_its_start_and_is_shortened(self):
        """The regression: start=9950&size=100 must not become start=9900&size=100.
        That shift would return rows 9900-9949 a second time."""
        start, size = self.call(start=WINDOW - 50, size=100)

        self.assertEqual(start, WINDOW - 50, "start was moved backward")
        self.assertEqual(size, 50, "final page was not shortened to fit the window")
        self.assertEqual(start + size, WINDOW)

    def test_consecutive_pages_never_overlap_over_the_window_edge(self):
        """Walk the paging loop the way a client does, over the last stretch before the
        window — the only place the clamp engages — and assert each page begins exactly
        where the previous one ended, with no row served twice."""
        size = 100
        start = WINDOW - 250  # 2 full pages then a half page, landing on the edge
        pages = []
        while start < WINDOW:
            got_start, got_size = self.call(start=start, size=size)
            self.assertEqual(got_start, start, "start was moved, so rows would repeat")
            self.assertGreaterEqual(got_size, 1)
            self.assertLessEqual(got_start + got_size, WINDOW, "request would exceed the ES window")
            pages.append((got_start, got_size))
            start = got_start + got_size

        self.assertEqual(pages, [(WINDOW - 250, 100), (WINDOW - 150, 100), (WINDOW - 50, 50)])

    def test_start_past_the_window_is_clamped_to_a_valid_final_row(self):
        start, size = self.call(start=WINDOW + 500, size=100)

        self.assertEqual(start, WINDOW - 1)
        self.assertEqual(size, 1, "size must stay >= 1 so the request is still valid")

    def test_size_is_still_capped_and_defaulted(self):
        self.assertEqual(self.call(start=0, size=500)[1], 100)
        self.assertEqual(self.call(start=0)[1], 20)
        self.assertEqual(self.call(start=0, size="banana")[1], 20)

    def test_non_numeric_start_falls_back_to_the_first_page(self):
        self.assertEqual(self.call(start="banana", size=20), (0, 20))
