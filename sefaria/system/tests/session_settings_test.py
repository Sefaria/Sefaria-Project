"""
Tests for how long a login lasts.

Sefaria left SESSION_COOKIE_AGE unset for years, so Django's own default of two
weeks quietly governed session lifetime: users were signed out roughly a
fortnight after their last visit. These tests pin the replacement value and,
more importantly, pin the invariant that makes a long session safe -- a single
setting drives both the sessionid cookie's Max-Age and the server-side session
record's expiry, so the cookie can never outlive the session it points at.

Note the filename: pytest.ini collects `sefaria/system/tests/*_test.py`, so a
`test_*.py` name here would never run in CI.
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpResponse
from django.test import RequestFactory, override_settings
from django.utils import timezone

EXPECTED_AGE = 399 * 24 * 60 * 60  # 34,473,600 seconds
BROWSER_COOKIE_CAP = 400 * 24 * 60 * 60


def test_session_cookie_age_is_399_days():
    assert settings.SESSION_COOKIE_AGE == EXPECTED_AGE


def test_session_cookie_age_stays_under_the_browser_cap():
    # Chrome, Firefox and Safari all clamp cookie lifetimes to 400 days. A value
    # at or above the cap gets silently truncated by the browser, which would
    # put the cookie and the server-side record back out of sync -- the exact
    # failure mode this setting exists to prevent.
    assert settings.SESSION_COOKIE_AGE < BROWSER_COOKIE_CAP


def test_session_save_every_request_keeps_the_window_rolling():
    # Without this the 399 days would run from login rather than from the user's
    # last visit, and neither the cookie nor the session row would be refreshed.
    assert settings.SESSION_SAVE_EVERY_REQUEST is True


def test_sessions_do_not_expire_at_browser_close():
    assert getattr(settings, "SESSION_EXPIRE_AT_BROWSER_CLOSE", False) is False


@override_settings(SESSION_ENGINE="django.contrib.sessions.backends.signed_cookies")
def test_session_cookie_max_age_comes_from_settings():
    """
    The browser-facing half: the Set-Cookie header carries SESSION_COOKIE_AGE as
    its Max-Age. Uses the signed_cookies engine so the assertion is about cookie
    mechanics and needs no database.
    """
    middleware = SessionMiddleware(lambda request: HttpResponse())
    request = RequestFactory().get("/")
    middleware.process_request(request)
    request.session["uid"] = 1  # non-empty, so the session is actually saved

    response = middleware.process_response(request, HttpResponse())

    cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert int(cookie["max-age"]) == settings.SESSION_COOKIE_AGE
    assert cookie["expires"]  # belt-and-braces for pre-Max-Age browsers


def test_server_side_expiry_is_derived_from_the_same_setting():
    """
    The half that actually keeps a user logged in. get_expiry_age() is what
    Django writes into django_session.expire_date; it derives from the same
    SESSION_COOKIE_AGE that becomes the cookie's Max-Age. If these two ever
    diverge, a valid-looking cookie can point at an already-dead session -- a
    399-day cookie riding on a 14-day server record logs the user out anyway.
    """
    from django.contrib.sessions.backends.db import SessionStore

    assert SessionStore().get_expiry_age() == settings.SESSION_COOKIE_AGE

    expected = timezone.now() + timedelta(seconds=settings.SESSION_COOKIE_AGE)
    drift = abs((SessionStore().get_expiry_date() - expected).total_seconds())
    assert drift < 60
