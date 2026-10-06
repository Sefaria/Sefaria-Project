"""
_apply_query_autocorrect's three-way contract (reader.views): a confident correction, an
ambiguous "did you mean" result, or no correction at all.

library.autocorrect_query is patched out: this is about how reader.views turns an
AutocorrectResult into the (effective_query, corrected_query, suggested_queries) tuple its
two callers (search_wrapper_api, entity_search_api) attach to their JSON responses -- not
about the auto-correction algorithm itself (see
sefaria/helper/tests/top_n_grams_for_search_autocorrect_test.py for that).
"""
from unittest.mock import patch

from django.test import TestCase

from reader.views import _apply_query_autocorrect
from sefaria.helper.top_n_grams_for_search_autocorrect import AutocorrectResult


class ApplyQueryAutocorrectTest(TestCase):
    def test_no_correction_available(self):
        with patch("reader.views.library.autocorrect_query", return_value=None):
            self.assertEqual(_apply_query_autocorrect("query", False), ("query", None, None))

    def test_confident_correction_becomes_the_effective_query(self):
        result = AutocorrectResult(original_query="bereshit rabbah", corrected_query="bereishit rabbah")
        with patch("reader.views.library.autocorrect_query", return_value=result):
            effective, corrected, suggested = _apply_query_autocorrect("bereshit rabbah", False)
        self.assertEqual(effective, "bereishit rabbah")
        self.assertEqual(corrected, "bereishit rabbah")
        self.assertIsNone(suggested)

    def test_ambiguous_result_leaves_the_query_uncorrected_but_returns_suggestions(self):
        # The "did you mean" case this module exists for: too ambiguous to pick a winner, so
        # the original query is still what runs -- only suggested_queries comes back set.
        result = AutocorrectResult(original_query="cat", suggested_queries=["cap", "cot"])
        with patch("reader.views.library.autocorrect_query", return_value=result):
            effective, corrected, suggested = _apply_query_autocorrect("cat", False)
        self.assertEqual(effective, "cat")
        self.assertIsNone(corrected)
        self.assertEqual(suggested, ["cap", "cot"])

    def test_disable_autocorrect_skips_the_check_entirely(self):
        with patch("reader.views.library.autocorrect_query") as mock_autocorrect:
            effective, corrected, suggested = _apply_query_autocorrect("cat", True)
        mock_autocorrect.assert_not_called()
        self.assertEqual(effective, "cat")
        self.assertIsNone(corrected)
        self.assertIsNone(suggested)

    def test_empty_query_skips_the_check(self):
        with patch("reader.views.library.autocorrect_query") as mock_autocorrect:
            effective, corrected, suggested = _apply_query_autocorrect("", False)
        mock_autocorrect.assert_not_called()
        self.assertEqual(effective, "")
        self.assertIsNone(corrected)
        self.assertIsNone(suggested)
