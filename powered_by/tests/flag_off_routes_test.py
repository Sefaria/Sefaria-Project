"""
C9: with DEVELOPER_SETTINGS_ENABLED off, every developer settings route in urls_library is a 404,
logged in or not and for any method, even with the test controls switched on. Every method and
login state is checked by calling the resolved view; each route also gets one full request.
"""
import re

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.backends.db import SessionStore
from django.http import Http404
from django.test import Client, RequestFactory
from django.urls import resolve

from reader.conftest import create_test_user, purge_test_profiles
from sefaria import urls_library

GATED_ROUTE = re.compile(r"api/developer|settings/developer|powered-by/form")


def concrete_urls(pattern):
    """Request paths that the pattern matches, with every captured value filled in."""
    text = str(pattern.pattern)
    if hasattr(pattern.pattern, "_route"):
        return ["/" + re.sub(r"<(?:\w+:)?\w+>", "1", text)]
    text = text.lstrip("^").rstrip("$").replace("/?", "")
    text = re.sub(r"\(\?P<\w+>\\d\+\)", "1", text)
    urls = [text]
    alternation = re.search(r"\(\?P<\w+>([\w|-]+)\)", text)
    if alternation:
        urls = [text.replace(alternation.group(0), choice) for choice in alternation.group(1).split("|")]
    for url in urls:
        assert not re.search(r"[()\\?*+\[\]^$]", url), "cannot build a path from " + str(pattern.pattern)
    return ["/" + url for url in urls]


GATED_URLS = sorted({url for p in urls_library.urlpatterns if GATED_ROUTE.search(str(p.pattern))
                     for url in concrete_urls(p)})


def test_C9_the_route_list_covers_every_developer_surface():
    for expected in ("/settings/developer", "/settings/developer/projects/1", "/settings/developer/confirm-email/1",
                     "/settings/developer/email-confirmed", "/api/developer/state", "/api/developer/mock",
                     "/api/developer/listings/1/claim", "/api/developer/listings/1/dismiss", "/powered-by/form",
                     "/api/developer-poc/powered-by-submissions"):
        assert expected in GATED_URLS


@pytest.fixture(autouse=True)
def developer_settings_off(settings):
    settings.DEVELOPER_SETTINGS_ENABLED = False
    settings.DEVELOPER_SETTINGS_MOCKS = True


@pytest.fixture
def user():
    user = create_test_user("flagoff")
    purge_test_profiles(user)
    yield user
    purge_test_profiles(user)


def view_status(url, method, user):
    request = RequestFactory().generic(method.upper(), url, "{}", content_type="application/json")
    request.user = user
    request.session = SessionStore()
    match = resolve(url, urlconf="sefaria.urls_library")
    try:
        return match.func(request, *match.args, **match.kwargs).status_code
    except Http404:
        return 404


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post", "delete"])
@pytest.mark.parametrize("url", GATED_URLS)
def test_C9_the_view_is_not_found_logged_out(url, method):
    assert view_status(url, method, AnonymousUser()) == 404, (method, url)


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post", "delete"])
@pytest.mark.parametrize("url", GATED_URLS)
def test_C9_the_view_is_not_found_logged_in(user, url, method):
    assert view_status(url, method, user) == 404, (method, url)


@pytest.mark.django_db
@pytest.mark.parametrize("url", GATED_URLS)
def test_C9_a_full_request_is_not_found(url):
    assert Client().get(url).status_code == 404, url
