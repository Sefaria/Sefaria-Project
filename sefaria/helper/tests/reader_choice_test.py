"""
The legacy-or-new reader choice (sefaria/helper/reader_choice.py): the routing cookie nginx reads in the chart's
nodejs.mode "optin", and its sync from the profile.
"""
from unittest import mock

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from sefaria.helper import reader_choice


@pytest.mark.parametrize("posted,stored", [("next", "next"), (True, "next"), ("true", "next"), ("classic", "classic"), (False, "classic"), ("", "classic"), ("anything", "classic")])
def test_normalize(posted, stored):
    assert reader_choice.normalize(posted) == stored


def test_available_follows_the_setting():
    with override_settings(READER_OPTIN=True):
        assert reader_choice.available()
    with override_settings(READER_OPTIN=False):
        assert not reader_choice.available()


def _request(cookies=None):
    request = RequestFactory().get("/settings/account")
    request.COOKIES.update(cookies or {})
    return request


@mock.patch.object(reader_choice, "_cookie_domain", return_value=None)
def test_apply_cookie_sets_and_clears(_):
    on = reader_choice.apply_cookie(HttpResponse(), _request(), "next")
    assert on.cookies["reader_version"].value == "next"
    assert on.cookies["reader_version"]["max-age"] == reader_choice.COOKIE_MAX_AGE
    off = reader_choice.apply_cookie(HttpResponse(), _request(), "classic")
    assert off.cookies["reader_version"].value == ""
    assert off.cookies["reader_version"]["max-age"] == 0


class _User:
    is_authenticated = True
    id = 7


def _middleware_response(profile_choice, cookie=None, synced=False):
    request = _request({"reader_version": cookie} if cookie else {})
    request.user = _User()
    request.session = {reader_choice.SESSION_SYNCED_KEY: True} if synced else {}
    profile = mock.Mock(settings={"reader_version": profile_choice} if profile_choice else {})
    with override_settings(READER_OPTIN=True), mock.patch("sefaria.model.user_profile.UserProfile", return_value=profile), \
            mock.patch.object(reader_choice, "_cookie_domain", return_value=None):
        response = reader_choice.ReaderChoiceMiddleware(lambda r: HttpResponse())(request)
    return request, response


def test_middleware_brings_the_cookie_in_line_with_the_profile_once_per_session():
    request, response = _middleware_response("next")
    assert response.cookies["reader_version"].value == "next"
    assert request.session[reader_choice.SESSION_SYNCED_KEY]
    _, response = _middleware_response("classic", cookie="next")
    assert response.cookies["reader_version"]["max-age"] == 0
    _, response = _middleware_response("next", synced=True)
    assert "reader_version" not in response.cookies


def test_middleware_leaves_alone_who_never_chose_or_already_matches():
    _, response = _middleware_response(None, cookie="next")
    assert "reader_version" not in response.cookies
    _, response = _middleware_response("next", cookie="next")
    assert "reader_version" not in response.cookies
