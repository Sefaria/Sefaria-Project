"""
search_path_filter's response contract for book titles it cannot resolve.

The Ref lookup is patched out: this test covers the view boundary's handling of
caller input, not the library data.
"""

import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from reader.views import search_path_filter
from sefaria.system.exceptions import BookNameError


def _get(book_title):
    request = RequestFactory().get(f"/api/search-path-filter/{book_title}")
    return search_path_filter(request, book_title)


class SearchPathFilterTest(SimpleTestCase):
    def test_unresolvable_title_returns_json_error_instead_of_500(self):
        with patch(
            "reader.views.Ref",
            side_effect=BookNameError("Could not find title in reference: Jerusalem Talmud"),
        ):
            response = _get("Jerusalem Talmud")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            json.loads(response.content),
            {"error": "Could not find title in reference: Jerusalem Talmud"},
        )

    def test_resolvable_title_returns_search_path(self):
        oref = SimpleNamespace(index=SimpleNamespace(categories=["Halakhah", "Shulchan Arukh"]))
        with (
            patch("reader.views.Ref", return_value=oref),
            patch(
                "reader.views.get_search_categories",
                return_value=["Halakhah", "Shulchan Arukh"],
            ),
        ):
            response = _get("Shulchan Arukh, Orach Chayim")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            json.loads(response.content),
            "Halakhah/Shulchan Arukh/Shulchan Arukh, Orach Chayim",
        )
