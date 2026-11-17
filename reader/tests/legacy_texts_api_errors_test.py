"""
Tests for the legacy v1 /api/texts endpoints: a caller error must return the structured
error response of the endpoint instead of HTTP 500.

- texts_api: a query parameter that is not an integer (?context=, ?multiple=abc) raised
  ValueError out of the view and surfaced as HTTP 500.
- translations_api: a translated title with no vstate record raised IndexError on
  my_index["vstate"][0], so every /api/texts/translations/<lang> request failed.
"""

import json
from unittest.mock import MagicMock, patch

from django.test import RequestFactory

from reader import views


def _texts_api(path, query):
    request = RequestFactory().get(path + "?" + query)
    # The ref layer needs the production library, so stub it: this test covers request handling.
    oref = MagicMock()
    oref.url.return_value = "Genesis_1.1"
    with patch.object(views.Ref, "instantiate_ref_with_legacy_parse_fallback", return_value=oref):
        return views.texts_api(request, "Genesis_1.1")


class TestTextsApiQueryParams:
    def test_empty_context_returns_error_json(self):
        response = _texts_api("/api/texts/Genesis_1.1", "context=")
        assert response.status_code == 200
        assert "Invalid value for the context parameter" in json.loads(response.content)["error"]

    def test_non_integer_multiple_returns_error_json(self):
        response = _texts_api("/api/texts/Genesis_1.1", "multiple=abc")
        assert response.status_code == 200
        assert "Invalid value for the multiple parameter" in json.loads(response.content)["error"]


def _translations(lang="he"):
    text_docs = [
        {
            "title": "Genesis",
            "index": [{"categories": ["Tanakh", "Torah"], "title": "Genesis", "order": [1, 1]}],
            "languageFamilyName": "hebrew",
            "versionTitle": "Miqra according to the Masorah",
            "language": "he",
            "vstate": [{"first_section_ref": "Genesis 1"}],
            "priority": 1,
        },
        {
            "title": "Orphaned",
            "index": [{"categories": ["Tanakh", "Torah"], "title": "Orphaned", "order": [1, 2]}],
            "languageFamilyName": "hebrew",
            "versionTitle": "A version with no version state",
            "language": "he",
            "vstate": [],
            "priority": 1,
        },
    ]
    db = MagicMock()
    db.texts.aggregate.return_value = text_docs
    ref = MagicMock()
    ref.return_value.url.return_value = "Genesis.1"
    request = RequestFactory().get("/api/texts/translations/" + lang)
    with patch.object(views, "db", db), patch.object(views, "Ref", ref):
        return views.translations_api(request, lang)


class TestTranslationsApiMissingVstate:
    def test_title_without_vstate_is_skipped(self):
        response = _translations()
        assert response.status_code == 200
        listed = json.loads(response.content)["Tanakh"]["Torah"]
        assert [entry["title"] for entry in listed] == ["Genesis"]
