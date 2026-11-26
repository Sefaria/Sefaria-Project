"""
The developer test controls and the Powered by proof-of-concept form have no routes left. The
site's catch-all pattern still matches any path, so the check is that no path resolves to a view
in the powered_by package.

The library host's redirects to the developer portal (sites/sefaria/urls.py, PLAN.md Phase 8):
`/wiki` and `/developers` go to the developers host of DOMAIN_MODULES (production's portal when none
is configured), and `/powered-by` goes to the portal's gallery once DEVPORTAL_CUTOVER_DONE is set and
to today's powered-by.sefaria.org until then. The views are called directly, so the check needs no
middleware (and no MongoDB beyond what importing the URLconf loads).
"""

import pytest
from django.test import RequestFactory, override_settings
from django.urls import Resolver404, resolve

URLCONF = "sefaria.urls_library"

PRODUCTION = {
    "en": {
        "library": "https://www.sefaria.org",
        "voices": "https://voices.sefaria.org",
        "developers": "https://developers.sefaria.org",
    },
    "he": {"library": "https://www.sefaria.org.il", "voices": "https://chiburim.sefaria.org.il"},
}
CAULDRON = {
    "en": {
        "library": "https://www.review.cauldron.sefaria.org",
        "voices": "https://voices.review.cauldron.sefaria.org",
        "developers": "https://developers.review.cauldron.sefaria.org",
    },
}
NO_DEVELOPERS = {"en": {"library": "http://localhost:8000", "voices": "http://voices.localhost:8000"}}


def resolved_module(path):
    try:
        return resolve(path, urlconf=URLCONF).func.__module__
    except Resolver404:
        return None


def redirect_for(path):
    request = RequestFactory().get(path)
    request.interfaceLang = "english"
    response = resolve(path, urlconf=URLCONF).func(request)
    return response.status_code, response["Location"]


def test_mock_and_poc_routes_not_resolvable():
    for path in ("/api/developer/mock", "/api/developer-poc/powered-by-submissions"):
        module = resolved_module(path)
        assert module is None or not module.startswith("powered_by"), (path, module)


def test_claim_routes_are_gone():
    # A 404 from a live view would not prove the route is gone. A catch-all may still match the path, so the check is
    # that no powered_by view resolves for it.
    for path in ("/api/developer/listings/1/claim", "/api/developer/listings/1/dismiss"):
        module = resolved_module(path)
        assert module is None or not module.startswith("powered_by"), (path, module)


def test_powered_by_form_path_is_not_the_poc_form():
    # An SPA catch-all may still match this path; it must not be the old form view.
    for path in ("/powered-by/form", "/powered-by/form/"):
        module = resolved_module(path)
        assert module is None or not module.startswith("powered_by"), (path, module)


@pytest.mark.parametrize("path", ["/powered-by", "/powered-by/"])
@override_settings(DOMAIN_MODULES=PRODUCTION, DEVPORTAL_CUTOVER_DONE=False)
def test_powered_by_goes_to_the_standalone_gallery_before_cutover(path):
    assert redirect_for(path) == (301, "https://powered-by.sefaria.org")


@pytest.mark.parametrize("path", ["/powered-by", "/powered-by/"])
@override_settings(DOMAIN_MODULES=PRODUCTION, DEVPORTAL_CUTOVER_DONE=True)
def test_powered_by_goes_to_the_portal_gallery_after_cutover(path):
    assert redirect_for(path) == (301, "https://developers.sefaria.org/powered-by")


@pytest.mark.parametrize("cutover", [False, True])
def test_powered_by_follows_the_configured_developers_host(cutover):
    # An environment with its own portal (a cauldron) sends /powered-by to its gallery, before the cutover too.
    with override_settings(DOMAIN_MODULES=CAULDRON, DEVPORTAL_CUTOVER_DONE=cutover):
        assert redirect_for("/powered-by") == (301, "https://developers.review.cauldron.sefaria.org/powered-by")


@pytest.mark.parametrize("cutover", [False, True])
@pytest.mark.parametrize(
    ("domain_modules", "developers"),
    [
        (PRODUCTION, "https://developers.sefaria.org"),
        (CAULDRON, "https://developers.review.cauldron.sefaria.org"),
        (NO_DEVELOPERS, "https://developers.sefaria.org"),
    ],
)
def test_wiki_and_developers_go_to_the_developers_host(domain_modules, developers, cutover):
    with override_settings(DOMAIN_MODULES=domain_modules, DEVPORTAL_CUTOVER_DONE=cutover):
        for path in ("/wiki", "/wiki/"):
            assert redirect_for(path) == (302, f"{developers}/docs/welcome"), path
        for path in ("/developers", "/developers/"):
            assert redirect_for(path) == (302, developers), path
