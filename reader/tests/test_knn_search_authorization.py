"""The knn-search view leaves access control to the auth service and ignores the Authorization header."""

from unittest.mock import patch

import pytest
from django.test import RequestFactory, override_settings


@pytest.mark.parametrize(
    "authorization",
    [None, "Bearer wrong-token", "Bearer internal-token", "Basic dXNlcjpwYXNz"],
    ids=["no-header", "wrong-bearer", "correct-bearer", "non-bearer"],
)
def test_knn_search_ignores_authorization_header(authorization):
    from api.views import KnnSearch

    headers = {"HTTP_AUTHORIZATION": authorization} if authorization is not None else {}
    request = RequestFactory().post(
        "/api/knn-search",
        data={"query": "Sabbath"},
        content_type="application/json",
        **headers,
    )
    with (
        override_settings(
            SEMANTIC_SEARCH_TABLE_VERSION="new",
            SEMANTIC_SEARCH_API_TOKEN="internal-token",
            GEMINI_API_KEY="test-key",
        ),
        patch("semantic_search.search.get_query_embedding", return_value=[0.1] * 1536),
        patch("semantic_search.search.Vector") as vector,
    ):
        vector.return_value.search_by_embedding.return_value = []
        response = KnnSearch.as_view()(request)

    assert response.status_code == 200
    vector.return_value.search_by_embedding.assert_called_once()
