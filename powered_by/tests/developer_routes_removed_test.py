"""
The developer test controls and the Powered by proof-of-concept form have no routes left. The
site's catch-all pattern still matches any path, so the check is that no path resolves to a view
in the powered_by package.
"""
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


def test_powered_by_form_path_is_not_the_poc_form():
    # An SPA catch-all may still match this path; it must not be the old form view.
    for path in ("/powered-by/form", "/powered-by/form/"):
        module = resolved_module(path)
        assert module is None or not module.startswith("powered_by"), (path, module)
