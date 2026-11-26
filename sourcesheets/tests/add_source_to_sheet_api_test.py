"""
Tests for the public add-source-to-sheet API view
(sourcesheets.views.add_source_to_sheet_api).

Regression: when the posted sheet id matched no document, the view returned a bare
Python dict ({"error": ...}) instead of an HttpResponse. Django then answered HTTP 500
and logged AttributeError("'dict' object has no attribute 'status_code'") while handling
the response, instead of returning the JSON error body that the endpoint's other
branches return.
"""

import json

from django.test import RequestFactory

from sourcesheets import views

MISSING_SHEET_ID = 999999999


def _post_add_source(sheet_id):
    request = RequestFactory().post(
        "/api/sheets/%s/add" % sheet_id,
        {"source": json.dumps({"ref": "Genesis 1:1"})},
    )
    return views.add_source_to_sheet_api(request, sheet_id)


class TestAddSourceToSheetApiMissingSheet:
    def test_returns_json_error_response_not_500(self):
        response = _post_add_source(MISSING_SHEET_ID)
        # The view must answer an HttpResponse, not a bare dict; a dict raises
        # AttributeError('dict' object has no attribute 'status_code') in Django's
        # response handling and becomes HTTP 500.
        assert response.status_code == 200
        assert json.loads(response.content) == {"error": "No sheet with id %s." % MISSING_SHEET_ID}
