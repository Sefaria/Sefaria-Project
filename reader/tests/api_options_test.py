"""
A bare OPTIONS request carries no Access-Control-Request-Method header, so the CORS preflight
middleware passes it to the view. These views branch only on the methods they implement, and
Django answers 500 for a view that returns None, so each must answer OPTIONS itself.
"""

import pytest
from django.test import RequestFactory

from reader.views import index_api, shape_api, texts_api


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.mark.parametrize(
    ("view", "args", "allow"),
    [
        (shape_api, ("Genesis",), "OPTIONS, GET"),
        (index_api, ("Genesis",), "OPTIONS, GET, POST, DELETE"),
        (texts_api, ("Genesis 1:1",), "OPTIONS, GET, POST, DELETE"),
    ],
)
def test_options_request_gets_no_content(rf, view, args, allow):
    response = view(rf.options("/api/legacy"), *args)

    assert response.status_code == 204
    assert response["Allow"] == allow
