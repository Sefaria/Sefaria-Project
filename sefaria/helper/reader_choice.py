# -*- coding: utf-8 -*-
"""
The choice between the legacy reader and the new one (reader-next), in one place.

With the chart's ``nodejs.mode: optin`` both readers run, and nginx sends a page request to the new
reader exactly when the request carries the cookie ``reader_version=next``
(helm-chart/sefaria/conf/nginx.template.conf.tpl, ``$page_upstream``). This module owns that cookie:

- ``available()`` -- whether this deployment offers the choice (``READER_OPTIN``, set by the chart);
- the choice is a profile setting, ``profile.settings["reader_version"]`` ("next" or "classic"), set from
  account settings through ``/api/profile`` -- which also sets or clears the cookie on its response;
- ``ReaderChoiceMiddleware`` puts the cookie in line with the profile once per session, so the choice
  follows the reader to every browser they sign in on.

Absent means the legacy reader, as before: nothing changes for anyone who never chose.
"""
from django.conf import settings

SETTING_KEY = "reader_version"
COOKIE_NAME = "reader_version"
NEXT = "next"
CLASSIC = "classic"
COOKIE_MAX_AGE = 365 * 24 * 60 * 60
SESSION_SYNCED_KEY = "reader_version_synced"


def available():
    return bool(getattr(settings, "READER_OPTIN", False))


def normalize(value):
    """The stored value for a posted one: "next" for the new reader, "classic" for anything else."""
    if isinstance(value, bool):
        return NEXT if value else CLASSIC
    return NEXT if str(value).strip().lower() in (NEXT, "true", "1", "on") else CLASSIC


def chose_next(profile):
    settings_ = getattr(profile, "settings", None) or {}
    return settings_.get(SETTING_KEY) == NEXT


def _cookie_domain(request):
    # the same domain the interface-language cookie uses, so library and Voices pages agree
    from sefaria.utils.domains_and_languages import current_domain_lang, get_cookie_domain
    try:
        return get_cookie_domain(current_domain_lang(request))
    except Exception:
        return None


def apply_cookie(response, request, choice):
    """Set (new reader) or clear (legacy reader) the routing cookie on ``response``."""
    domain = _cookie_domain(request)
    if choice == NEXT:
        response.set_cookie(COOKIE_NAME, NEXT, max_age=COOKIE_MAX_AGE, domain=domain, secure=request.is_secure(), samesite="Lax")
    else:
        response.delete_cookie(COOKIE_NAME, domain=domain, samesite="Lax")
    return response


class ReaderChoiceMiddleware:
    """
    Once per session of a signed-in reader, make the routing cookie say what their profile says (a choice
    made on another browser takes effect here at sign-in). Readers who never chose are left alone.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not available() or not getattr(request, "user", None) or not request.user.is_authenticated:
            return response
        session = getattr(request, "session", None)
        if session is None or session.get(SESSION_SYNCED_KEY):
            return response
        from sefaria.model.user_profile import UserProfile
        profile = UserProfile(id=request.user.id)
        choice = (profile.settings or {}).get(SETTING_KEY)
        if choice in (NEXT, CLASSIC) and (request.COOKIES.get(COOKIE_NAME) == NEXT) != (choice == NEXT):
            apply_cookie(response, request, choice)
        session[SESSION_SYNCED_KEY] = True
        return response
