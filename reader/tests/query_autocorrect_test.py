"""
search_autocorrect_api's JSON contract. library.autocorrect_query is patched out; the
algorithm is tested in sefaria/helper/tests/top_n_grams_for_search_autocorrect_test.py.
"""
import json
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from reader.views import search_autocorrect_api
from sefaria.helper.top_n_grams_for_search_autocorrect import AutocorrectResult


def _get(q=None):
    request = RequestFactory().get("/api/search-autocorrect", {} if q is None else {"q": q})
    return json.loads(search_autocorrect_api(request).content)


class SearchAutocorrectApiTest(SimpleTestCase):
    def test_no_correction_available(self):
        with patch("reader.views.library.autocorrect_query", return_value=None):
            self.assertEqual(_get("query"), {"corrected_query": None, "suggested_queries": None})

    def test_confident_correction(self):
        result = AutocorrectResult(original_query="bereshit rabbah", corrected_query="bereishit rabbah")
        with patch("reader.views.library.autocorrect_query", return_value=result):
            self.assertEqual(_get("bereshit rabbah"),
                             {"corrected_query": "bereishit rabbah", "suggested_queries": None})

    def test_ambiguous_result_returns_suggestions_only(self):
        # The "did you mean" case: too ambiguous to pick a winner, so no corrected_query.
        result = AutocorrectResult(original_query="cat", suggested_queries=["cap", "cot"])
        with patch("reader.views.library.autocorrect_query", return_value=result):
            self.assertEqual(_get("cat"), {"corrected_query": None, "suggested_queries": ["cap", "cot"]})

    def test_empty_query_skips_the_check(self):
        with patch("reader.views.library.autocorrect_query") as mock_autocorrect:
            self.assertEqual(_get(""), {"corrected_query": None, "suggested_queries": None})
            self.assertEqual(_get(), {"corrected_query": None, "suggested_queries": None})
        mock_autocorrect.assert_not_called()
