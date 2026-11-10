"""
The choice between the legacy reader and the new one (reader-next), in one place.

With the chart's ``nodejs.mode: optin`` both readers run, and nginx sends a page request to the new
reader exactly when the request carries the cookie ``reader_version=next``
(helm-chart/sefaria/conf/nginx.template.conf.tpl, ``$page_upstream``). This module owns that cookie:

- ``available()`` -- whether this deployment offers the choice (``READER_OPTIN``, set by the chart);
- ``audience()`` -- who may take the new reader while it is offered: remote config
  ``feature.reader.optin.audience``, ``"staff"`` (the default: only ``is_staff`` users) or ``"all"``
  (every signed-in user, launch stage L1). Signed-out visitors never opt in (LAUNCH_PLAN D-12);
- the choice is a profile setting, ``profile.settings["reader_version"]`` ("next" or "classic"), set from
  account settings through ``/api/profile`` or from the new reader through ``/api/reader-choice``
  (reader/views.py reader_choice_api) -- both set or clear the cookie on their response;
- ``ReaderChoiceMiddleware`` puts the cookie in line with the profile once per session, so the choice
  follows the reader to every browser they sign in on, and clears a ``next`` cookie held by anyone the
  audience no longer includes.

Absent means the legacy reader, as before: nothing changes for anyone who never chose.
"""

from django.conf import settings

SETTING_KEY = "reader_version"
COOKIE_NAME = "reader_version"
NEXT = "next"
CLASSIC = "classic"
COOKIE_MAX_AGE = 365 * 24 * 60 * 60
SESSION_SYNCED_KEY = "reader_version_synced"

AUDIENCE_STAFF = "staff"
AUDIENCE_ALL = "all"


def available():
    return bool(getattr(settings, "READER_OPTIN", False))


def audience():
    """Who may opt in: "all" only when remote config says exactly that; anything else (unset, a typo) is "staff"."""
    from remote_config import remoteConfigCache
    from remote_config.keys import READER_OPTIN_AUDIENCE

    value = remoteConfigCache.get(READER_OPTIN_AUDIENCE, AUDIENCE_STAFF)
    return AUDIENCE_ALL if str(value).strip().lower() == AUDIENCE_ALL else AUDIENCE_STAFF


def may_use_next(user):
    """May this user be sent to the new reader? Signed in, and staff unless the audience is everyone."""
    if not available() or user is None or not getattr(user, "is_authenticated", False):
        return False
    return audience() == AUDIENCE_ALL or bool(getattr(user, "is_staff", False))


def parse_choice(value):
    """A choice sent by a client, strictly: "next", or "classic" (also spelled "legacy"); None for anything else."""
    v = str(value).strip().lower() if value is not None else ""
    if v == NEXT:
        return NEXT
    if v in (CLASSIC, "legacy"):
        return CLASSIC
    return None


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
        response.set_cookie(
            COOKIE_NAME, NEXT, max_age=COOKIE_MAX_AGE, domain=domain, secure=request.is_secure(), samesite="Lax"
        )
    else:
        response.delete_cookie(COOKIE_NAME, domain=domain, samesite="Lax")
    return response


class ReaderChoiceMiddleware:
    """
    Keeps the routing cookie honest:

    - a ``next`` cookie held by someone the audience does not include (while the audience is "staff": a signed-in user who is
      not staff, or any signed-out visitor) is cleared on the next response Django sends them;
    - once per session of a signed-in reader, the cookie is made to say what their profile says (a choice made on another
      browser takes effect here at sign-in). Readers who never chose are left alone.

    A response whose view already set or cleared the cookie (``/api/profile``, ``/api/reader-choice``) is left as it is.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not available() or COOKIE_NAME in response.cookies:
            return response
        user = getattr(request, "user", None)
        cookie_next = request.COOKIES.get(COOKIE_NAME) == NEXT
        signed_in = bool(user is not None and user.is_authenticated)

        if cookie_next and not signed_in:
            # D-12: the opt-in is for signed-in readers. With the audience "all", a reader who signed out keeps the reader
            # they chose (their next sign-in syncs it again); with "staff" no anonymous visitor can be told apart from staff.
            if audience() != AUDIENCE_ALL:
                apply_cookie(response, request, CLASSIC)
            return response
        if not signed_in:
            return response
        if cookie_next and not may_use_next(user):
            apply_cookie(response, request, CLASSIC)
            return response

        session = getattr(request, "session", None)
        if session is None or session.get(SESSION_SYNCED_KEY):
            return response
        from sefaria.model.user_profile import UserProfile

        profile = UserProfile(id=user.id)
        choice = (profile.settings or {}).get(SETTING_KEY)
        if choice == NEXT and not may_use_next(user):
            choice = None  # chosen while the audience included them; it no longer does (the cookie, if any, was cleared above)
        if choice in (NEXT, CLASSIC) and cookie_next != (choice == NEXT):
            apply_cookie(response, request, choice)
        session[SESSION_SYNCED_KEY] = True
        return response
