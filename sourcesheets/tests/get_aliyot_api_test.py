"""
Tests for the public get_aliyot API view (sourcesheets.views.get_aliyot_by_parasha_api).

Regression: a parasha value that matched no document in the `parshiot` collection made
`next(cursor)` raise StopIteration. The exception escaped the view and Django answered
HTTP 500. The view must instead answer HTTP 200 with its empty response body.
"""

import json

import pytest
from django.test import RequestFactory

from sefaria.system.database import db
from sourcesheets import views

# Synthetic parasha name so the fixture never touches a real `parshiot` document.
TEST_PARASHA = "_get_aliyot_api_test_parasha"


@pytest.fixture
def parshiot_doc():
    db.parshiot.delete_many({"parasha": TEST_PARASHA})
    db.parshiot.insert_one(
        {
            "parasha": TEST_PARASHA,
            "date": "2026-01-01",
            "aliyot": ["Genesis 1:1-1:5", "Genesis 1:6-1:10"],
        }
    )
    yield
    db.parshiot.delete_many({"parasha": TEST_PARASHA})


def _call_view(parasha):
    request = RequestFactory().get("/api/sheets/%s/get_aliyot" % parasha)
    return views.get_aliyot_by_parasha_api(request, parasha)


class TestGetAliyotByParashaApi:
    def test_known_parasha_returns_its_aliyot(self, parshiot_doc):
        response = _call_view(TEST_PARASHA)
        assert response.status_code == 200
        assert json.loads(response.content) == {"ref": ["Genesis 1:1-1:5", "Genesis 1:6-1:10"]}

    def test_unknown_parasha_returns_empty_refs(self):
        response = _call_view("NotAParasha")
        assert response.status_code == 200
        assert json.loads(response.content) == {"ref": []}
