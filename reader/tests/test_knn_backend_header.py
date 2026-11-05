"""API routing/header regression tests; requires the normal Sefaria app environment."""
from unittest.mock import patch
import pytest
from django.test import override_settings


class TestKnnBackendHeader:
    @pytest.mark.parametrize("backend", ["new", "legacy"])
    def test_api_reports_backend_that_handled_search(self, backend):
        from django.test import RequestFactory
        from api.views import KnnSearch
        request = RequestFactory().post(
            "/api/knn-search", data={"query": "Sabbath"}, content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test-token",
        )
        with override_settings(SEMANTIC_SEARCH_TABLE_VERSION=backend,
                               SEMANTIC_SEARCH_API_TOKEN="test-token", GEMINI_API_KEY="test-key"), patch(
            "semantic_search.search.get_query_embedding", return_value=[0.1] * 1536
        ), patch("semantic_search.search.Vector") as vector, patch(
            "semantic_search.search.SemanticTextChunk"
        ) as legacy:
            vector.return_value.search_by_embedding.return_value = []
            legacy.return_value.search_by_embedding.return_value = []
            response = KnnSearch.as_view()(request)
            assert response.status_code == 200
            assert response["X-Sefaria-Semantic-Backend"] == backend
            assert response["Cache-Control"] == "no-store"
            selected, unused = (vector, legacy) if backend == "new" else (legacy, vector)
            selected.return_value.search_by_embedding.assert_called_once()
            unused.assert_not_called()
