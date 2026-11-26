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


def _request(cookies=None, module="library"):
    request = RequestFactory().get("/settings/account")
    request.active_module = module
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
    profile_choice,
    cookie=None,
    synced=False,
    user=None,
    audience="staff",
    view_sets_cookie=False,
    module="library",
    disabled=False,
    social_cookie=False,
    via=None,
):
    cookies = {"reader_version": cookie} if cookie else {}
    if social_cookie:
        cookies["reader_social"] = "1"
    request = _request(cookies, module=module)
    request.user = user or _User()
    request.session = {reader_choice.SESSION_SYNCED_KEY: True} if synced else {}
    settings_ = {"reader_version": profile_choice} if profile_choice else {}
    if via:
        settings_["reader_version_via"] = via
    profile = mock.Mock(settings=settings_)
    profile.update.side_effect = lambda d: profile.settings.update(d.get("settings", {}))

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
        mock.patch.object(reader_choice, "next_disabled", return_value=disabled),
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
    with (
        override_settings(READER_OPTIN=optin),
        mock.patch("sefaria.model.user_profile.UserProfile", return_value=mock.Mock(settings={})),
        mock.patch.object(reader_choice, "audience", return_value=audience),
        mock.patch.object(reader_choice, "next_disabled", return_value=False),
    ):
        assert reader_choice.may_use_next(user) is expected


@pytest.mark.parametrize(
    "posted,choice",
    [("next", "next"), ("classic", "classic"), ("legacy", "classic"), (" Next ", "next"), ("on", None), (None, None)],
)
def test_parse_choice_is_strict(posted, choice):
    assert reader_choice.parse_choice(posted) == choice


def test_middleware_never_touches_a_voices_response():
    # owner rule: Voices is untouched; nothing the middleware would do on the Library happens there
    _, response = _middleware_response("next", cookie="next", user=_Member(), module="voices")
    assert "reader_version" not in response.cookies
    _, response = _middleware_response(None, cookie="next", user=_Anonymous(), module="voices")
    assert "reader_version" not in response.cookies
    request, response = _middleware_response("next", user=_User(), module="voices")
    assert "reader_version" not in response.cookies
    assert reader_choice.SESSION_SYNCED_KEY not in request.session


# The kill switch: remote config feature.reader.next.disabled


@pytest.mark.parametrize(
    "stored,expected",
    [(None, False), (False, False), (True, True), ("true", True), (" TRUE ", True), ("yes", False), (1, False)],
)
def test_next_disabled_reads_remote_config_and_defaults_to_false(stored, expected):
    from remote_config import remoteConfigCache
    from remote_config.keys import READER_NEXT_DISABLED

    values = {READER_NEXT_DISABLED: stored} if stored is not None else {}
    with mock.patch.object(remoteConfigCache, "get", side_effect=lambda k, d=None: values.get(k, d)):
        assert reader_choice.next_disabled() is expected


def test_the_kill_switch_closes_the_new_reader_to_everyone():
    with (
        override_settings(READER_OPTIN=True),
        mock.patch("sefaria.model.user_profile.UserProfile", return_value=mock.Mock(settings={})),
        mock.patch.object(reader_choice, "audience", return_value="all"),
        mock.patch.object(reader_choice, "next_disabled", return_value=True),
    ):
        assert reader_choice.in_audience(_User())
        assert not reader_choice.may_use_next(_User())
        assert not reader_choice.may_use_next(_Member())


def test_middleware_under_the_kill_switch_clears_next_and_never_sets_it():
    # staff with a next cookie, even after this session synced
    _, response = _middleware_response("next", cookie="next", synced=True, disabled=True)
    assert _cleared(response)
    # the once-per-session sync does not hand out next
    request, response = _middleware_response("next", disabled=True)
    assert "reader_version" not in response.cookies
    assert request.session[reader_choice.SESSION_SYNCED_KEY]
    # signed out, even with the audience "all"
    _, response = _middleware_response(None, cookie="next", user=_Anonymous(), audience="all", disabled=True)
    assert _cleared(response)
    # Voices: untouched
    _, response = _middleware_response("next", cookie="next", disabled=True, module="voices")
    assert "reader_version" not in response.cookies


# Social: whoever comes through /social is opted in for good


def _social_profile(via=None):
    return mock.Mock(settings={"reader_version": "next", "reader_version_via": via} if via else {})


def test_a_member_opted_in_through_social_is_in_the_audience_while_it_is_staff():
    with (
        override_settings(READER_OPTIN=True),
        mock.patch.object(reader_choice, "audience", return_value="staff"),
        mock.patch.object(reader_choice, "next_disabled", return_value=False),
    ):
        with mock.patch("sefaria.model.user_profile.UserProfile", return_value=_social_profile("social")):
            assert reader_choice.may_use_next(_Member())
        with mock.patch("sefaria.model.user_profile.UserProfile", return_value=_social_profile()):
            assert not reader_choice.may_use_next(_Member())
        assert not reader_choice.in_audience(_Anonymous())


def test_via_social_reads_the_profile_once_per_session():
    request = _request()
    request.session = {}
    with mock.patch("sefaria.model.user_profile.UserProfile", return_value=_social_profile("social")) as P:
        assert reader_choice.via_social(_Member(), request)
        assert reader_choice.via_social(_Member(), request)
    assert P.call_count == 1
    assert request.session[reader_choice.SESSION_SOCIAL_KEY] is True


def test_the_kill_switch_overrides_a_social_opt_in():
    with (
        override_settings(READER_OPTIN=True),
        mock.patch.object(reader_choice, "next_disabled", return_value=True),
        mock.patch("sefaria.model.user_profile.UserProfile", return_value=_social_profile("social")),
    ):
        assert not reader_choice.may_use_next(_Member())


def test_middleware_keeps_the_cookie_of_a_member_who_came_through_social():
    _, response = _middleware_response("next", cookie="next", user=_Member(), synced=True, via="social")
    assert "reader_version" not in response.cookies


def test_middleware_opts_in_at_sign_in_a_member_holding_socials_cookie():
    # opened a Social link signed out (reader_social=1), then signed in: saved for good, and the cookie set
    request, response = _middleware_response(None, user=_Member(), social_cookie=True)
    assert response.cookies["reader_version"].value == "next"
    assert request.session[reader_choice.SESSION_SOCIAL_KEY] is True
    # even someone who had chosen classic before: coming through Social opts them in again
    _, response = _middleware_response("classic", user=_Member(), social_cookie=True)
    assert response.cookies["reader_version"].value == "next"
    # not under the kill switch
    _, response = _middleware_response(None, user=_Member(), social_cookie=True, disabled=True)
    assert "reader_version" not in response.cookies


def test_tidying_a_stale_cookie_leaves_socials_cookie_but_an_explicit_classic_clears_it():
    # signed out with a next cookie while the audience is staff: reader_version goes, reader_social stays
    _, response = _middleware_response(None, cookie="next", user=_Anonymous(), social_cookie=True)
    assert _cleared(response)
    assert "reader_social" not in response.cookies
    # the kill switch clears both
    _, response = _middleware_response(None, cookie="next", user=_Anonymous(), social_cookie=True, disabled=True)
    assert response.cookies["reader_social"]["max-age"] == 0
    # choosing classic clears both
    request = _request({"reader_version": "next", "reader_social": "1"})
    with mock.patch.object(reader_choice, "_cookie_domain", return_value=None):
        off = reader_choice.apply_cookie(HttpResponse(), request, "classic")
    assert off.cookies["reader_social"]["max-age"] == 0
