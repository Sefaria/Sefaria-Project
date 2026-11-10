"""
The legacy-or-new reader choice (sefaria/helper/reader_choice.py): the routing cookie nginx reads in the chart's
nodejs.mode "optin", and its sync from the profile.
"""

from unittest import mock

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from sefaria.helper import reader_choice


@pytest.mark.parametrize(
    "posted,stored",
    [
        ("next", "next"),
        (True, "next"),
        ("true", "next"),
        ("classic", "classic"),
        (False, "classic"),
        ("", "classic"),
        ("anything", "classic"),
    ],
)
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
    is_staff = True
    id = 7


class _Member(_User):
    is_staff = False


class _Anonymous:
    is_authenticated = False
    is_staff = False


def _middleware_response(
    profile_choice, cookie=None, synced=False, user=None, audience="staff", view_sets_cookie=False
):
    request = _request({"reader_version": cookie} if cookie else {})
    request.user = user or _User()
    request.session = {reader_choice.SESSION_SYNCED_KEY: True} if synced else {}
    profile = mock.Mock(settings={"reader_version": profile_choice} if profile_choice else {})

    def view(r):
        response = HttpResponse()
        if view_sets_cookie:
            response.set_cookie("reader_version", "next")
        return response

    with (
        override_settings(READER_OPTIN=True),
        mock.patch("sefaria.model.user_profile.UserProfile", return_value=profile),
        mock.patch.object(reader_choice, "_cookie_domain", return_value=None),
        mock.patch.object(reader_choice, "audience", return_value=audience),
    ):
        response = reader_choice.ReaderChoiceMiddleware(view)(request)
    return request, response


def _cleared(response):
    return "reader_version" in response.cookies and response.cookies["reader_version"]["max-age"] == 0


def test_middleware_brings_the_cookie_in_line_with_the_profile_once_per_session():
    request, response = _middleware_response("next")
    assert response.cookies["reader_version"].value == "next"
    assert request.session[reader_choice.SESSION_SYNCED_KEY]
    _, response = _middleware_response("classic", cookie="next")
    assert _cleared(response)
    _, response = _middleware_response("next", synced=True)
    assert "reader_version" not in response.cookies


def test_middleware_leaves_alone_who_never_chose_or_already_matches():
    _, response = _middleware_response(None, cookie="next")
    assert "reader_version" not in response.cookies
    _, response = _middleware_response("next", cookie="next")
    assert "reader_version" not in response.cookies


def test_middleware_clears_a_stale_cookie_of_a_member_while_the_audience_is_staff():
    # even after this session already synced: the audience can shrink at any time
    _, response = _middleware_response("next", cookie="next", user=_Member(), synced=True)
    assert _cleared(response)
    _, response = _middleware_response("next", cookie="next", user=_Member(), audience="all", synced=True)
    assert "reader_version" not in response.cookies


def test_middleware_does_not_hand_a_member_the_cookie_while_the_audience_is_staff():
    request, response = _middleware_response("next", user=_Member())
    assert "reader_version" not in response.cookies
    assert request.session[reader_choice.SESSION_SYNCED_KEY]
    _, response = _middleware_response("next", user=_Member(), audience="all")
    assert response.cookies["reader_version"].value == "next"


def test_middleware_clears_a_signed_out_cookie_only_while_the_audience_is_staff():
    _, response = _middleware_response(None, cookie="next", user=_Anonymous())
    assert _cleared(response)
    _, response = _middleware_response(None, cookie="next", user=_Anonymous(), audience="all")
    assert "reader_version" not in response.cookies
    _, response = _middleware_response(None, user=_Anonymous())
    assert "reader_version" not in response.cookies


def test_middleware_leaves_a_cookie_the_view_set():
    _, response = _middleware_response("classic", cookie="next", user=_Member(), view_sets_cookie=True)
    assert response.cookies["reader_version"].value == "next"


def test_middleware_does_nothing_where_the_choice_is_not_offered():
    request = _request({"reader_version": "next"})
    request.user = _Member()
    request.session = {}
    with override_settings(READER_OPTIN=False):
        response = reader_choice.ReaderChoiceMiddleware(lambda r: HttpResponse())(request)
    assert "reader_version" not in response.cookies


@pytest.mark.parametrize(
    "stored,expected", [(None, "staff"), ("staff", "staff"), ("all", "all"), (" ALL ", "all"), ("everyone", "staff")]
)
def test_audience_reads_remote_config_and_defaults_to_staff(stored, expected):
    from remote_config import remoteConfigCache
    from remote_config.keys import READER_OPTIN_AUDIENCE

    values = {READER_OPTIN_AUDIENCE: stored} if stored is not None else {}
    with mock.patch.object(remoteConfigCache, "get", side_effect=lambda k, d=None: values.get(k, d)):
        assert reader_choice.audience() == expected


@pytest.mark.parametrize(
    "user,audience,optin,expected",
    [
        (_User(), "staff", True, True),
        (_Member(), "staff", True, False),
        (_Member(), "all", True, True),
        (_Anonymous(), "all", True, False),
        (_User(), "all", False, False),
    ],
)
def test_may_use_next(user, audience, optin, expected):
    with override_settings(READER_OPTIN=optin), mock.patch.object(reader_choice, "audience", return_value=audience):
        assert reader_choice.may_use_next(user) is expected


@pytest.mark.parametrize(
    "posted,choice",
    [("next", "next"), ("classic", "classic"), ("legacy", "classic"), (" Next ", "next"), ("on", None), (None, None)],
)
def test_parse_choice_is_strict(posted, choice):
    assert reader_choice.parse_choice(posted) == choice
