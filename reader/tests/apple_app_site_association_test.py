"""
Tests for the apple_app_site_association (AASA) view.

Covers the two exclusion mechanisms: the static AASA_EXCLUDED_PATHS entries
(allauth OAuth callbacks, always excluded), and the dynamic no_applink query
marker (WebSessionRedirectMiddleware) -- see sefaria/utils/views_utils.py.
"""
import json

from django.test import RequestFactory

from reader import views
from sefaria.utils.views_utils import AASA_EXCLUDED_PATHS, NO_APPLINK_PARAM


def _components():
    response = views.apple_app_site_association(RequestFactory().get('/'))
    body = json.loads(response.content)
    return body["applinks"]["details"][0]["components"]


class TestAppleAppSiteAssociation:
    def test_static_paths_excluded_before_catch_all(self):
        components = _components()

        for path in AASA_EXCLUDED_PATHS:
            assert {"/": path, "exclude": True} in components

        catch_all_index = components.index({"/": "*"})
        for path in AASA_EXCLUDED_PATHS:
            assert components.index({"/": path, "exclude": True}) < catch_all_index

    def test_no_applink_query_excluded_before_catch_all(self):
        components = _components()

        no_applink_rule = {"/": "*", "?": {NO_APPLINK_PARAM: "*"}, "exclude": True}
        assert no_applink_rule in components
        assert components.index(no_applink_rule) < components.index({"/": "*"})
