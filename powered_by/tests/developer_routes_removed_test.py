"""
The developer test controls and the Powered by proof-of-concept form have no routes left. The
site's catch-all pattern still matches any path, so the check is that no path resolves to a view
in the powered_by package.
"""

import pytest
from django.urls import Resolver404, resolve

URLCONF = "sefaria.urls_library"


def resolved_module(path):
    try:
        return resolve(path, urlconf=URLCONF).func.__module__
    except Resolver404:
        return None


def test_mock_and_poc_routes_not_resolvable():
    for path in ("/api/developer/mock", "/api/developer-poc/powered-by-submissions"):
        module = resolved_module(path)
        assert module is None or not module.startswith("powered_by"), (path, module)


def test_claim_routes_are_gone():
    # A 404 from a live view would not prove the route is gone: the paths must not resolve at all.
    for path in ("/api/developer/listings/1/claim", "/api/developer/listings/1/dismiss"):
        with pytest.raises(Resolver404):
            resolve(path, urlconf=URLCONF)


def test_powered_by_form_path_is_not_the_poc_form():
    # An SPA catch-all may still match this path; it must not be the old form view.
    for path in ("/powered-by/form", "/powered-by/form/"):
        module = resolved_module(path)
        assert module is None or not module.startswith("powered_by"), (path, module)


@pytest.mark.django_db
def test_powered_by_still_redirects_to_the_developer_portal(client):
    # Site behaviour in sites/sefaria/urls.py, unrelated to the removed form.
    response = client.get("/powered-by")
    assert response.status_code == 301
    assert response["Location"] == "https://developers.sefaria.org/docs/powered-by-sefaria"
