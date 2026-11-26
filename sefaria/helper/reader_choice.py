"""
The choice between the legacy reader and the new one (reader-next), in one place.

With the chart's ``nodejs.mode: optin`` both readers run, and nginx sends a page request to the new
reader exactly when the request carries the cookie ``reader_version=next``
(helm-chart/sefaria/conf/nginx.template.conf.tpl, ``$reader_page``). This module owns that cookie:

- ``available()`` -- whether this deployment offers the choice (``READER_OPTIN``, set by the chart);
- ``next_disabled()`` -- the kill switch, remote config ``feature.reader.next.disabled`` (default false): while true nobody
  is sent to the new reader;
- ``audience()`` -- who may take the new reader while it is offered: remote config
  ``feature.reader.optin.audience``, ``"staff"`` (the default: only ``is_staff`` users) or ``"all"``
  (every signed-in user). Signed-out visitors never opt in;
- the choice is a profile setting, ``profile.settings["reader_version"]`` ("next" or "classic"), set from
  account settings through ``/api/profile`` or from the new reader through ``/api/reader-choice``
  (reader/views.py reader_choice_api) -- both set or clear the cookie on their response;
- ``ReaderChoiceMiddleware`` puts the cookie in line with the profile once per session, so the choice
  follows the reader to every browser they sign in on, and clears a ``next`` cookie held by anyone the
  audience no longer includes.

Social opts people in. Social's pages exist only in the new reader, and its links go to people outside the audience, so:

- nginx sends ``/social`` and ``/social/…`` to the new reader for everyone, and any page request carrying the cookie
  ``reader_social=1``, which the new reader sets on a Social page (reader-next src/features/shell/social-optin.ts) — that keeps a
  signed-out visitor there;
- a signed-in reader on a Social page is opted in for good: ``/api/reader-choice`` POST ``{"reader": "next", "via": "social"}``
  stores ``reader_version: "next"`` and ``reader_version_via: "social"`` in their profile and sets the cookie. A visitor who signs
  in later holding ``reader_social=1`` is opted in the same way by the middleware;
- whoever has ``reader_version_via: "social"`` counts as part of the audience (``in_audience``), so the middleware keeps their
  cookie and account settings offer them the switch, staff or not. Only the kill switch overrides it.

Absent means the legacy reader, as before: nothing changes for anyone who never chose.
"""

from django.conf import settings

SETTING_KEY = "reader_version"
COOKIE_NAME = "reader_version"
NEXT = "next"
CLASSIC = "classic"
COOKIE_MAX_AGE = 365 * 24 * 60 * 60
SESSION_SYNCED_KEY = "reader_version_synced"

# Social's opt-in (see the module docstring)
VIA_KEY = "reader_version_via"
VIA_SOCIAL = "social"
SOCIAL_COOKIE = "reader_social"
SESSION_SOCIAL_KEY = "reader_version_via_social"

AUDIENCE_STAFF = "staff"
AUDIENCE_ALL = "all"


def available():
    return bool(getattr(settings, "READER_OPTIN", False))


def on_library(request):
    """The routing cookie is only ever set or cleared on Library-host responses; the Voices host is left exactly as it was."""
    from sefaria.constants.model import LIBRARY_MODULE

    # The host django_hosts routed the request by (sefaria/hosts.py). Not request.active_module: ModuleMiddleware leaves /api/
    # paths at the default module, so a Voices /api/ request would read as the Library's.
    host = getattr(request, "host", None)
    module = getattr(host, "name", None) or getattr(request, "active_module", None)
    return module == LIBRARY_MODULE


def audience():
    """Who may opt in: "all" only when remote config says exactly that; anything else (unset, a typo) is "staff"."""
    from remote_config import remoteConfigCache
    from remote_config.keys import READER_OPTIN_AUDIENCE

    value = remoteConfigCache.get(READER_OPTIN_AUDIENCE, AUDIENCE_STAFF)
    return AUDIENCE_ALL if str(value).strip().lower() == AUDIENCE_ALL else AUDIENCE_STAFF


def next_disabled():
    """
    The kill switch: remote config ``feature.reader.next.disabled``. True only for a bool true (or the text "true"); missing or
    anything else is False. While it is on, nobody is sent to the new reader: the client clears its cookie and reloads into the
    legacy one, and Django never sets it again (may_use_next is False, the middleware clears it).
    """
    from remote_config import remoteConfigCache
    from remote_config.keys import READER_NEXT_DISABLED

    value = remoteConfigCache.get(READER_NEXT_DISABLED, False)
    return value is True or (isinstance(value, str) and value.strip().lower() == "true")


def in_audience(user, request=None):
    """
    Is this user among those offered the new reader? Signed in, and staff unless the audience is everyone — or opted in through
    Social (their profile says ``reader_version_via: "social"``; cached in the session when ``request`` is given).
    """
    if not available() or user is None or not getattr(user, "is_authenticated", False):
        return False
    if audience() == AUDIENCE_ALL or bool(getattr(user, "is_staff", False)):
        return True
    return via_social(user, request)


def may_use_next(user, request=None):
    """May this user be sent to the new reader now? In the audience, and the kill switch is off."""
    return in_audience(user, request) and not next_disabled()


def _profile_via_social(profile):
    return (getattr(profile, "settings", None) or {}).get(VIA_KEY) == VIA_SOCIAL


def via_social(user, request=None):
    """Did this signed-in user opt in through Social? Read from the profile once per session (cached under SESSION_SOCIAL_KEY)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    session = getattr(request, "session", None) if request is not None else None
    if session is not None and SESSION_SOCIAL_KEY in session:
        return bool(session[SESSION_SOCIAL_KEY])
    from sefaria.model.user_profile import UserProfile

    result = _profile_via_social(UserProfile(id=user.id))
    if session is not None:
        session[SESSION_SOCIAL_KEY] = result
    return result


def opt_in_via_social(user, request=None, profile=None):
    """
    Opt a signed-in user in to the new reader through Social, for good: the profile records ``next`` and ``via: social`` (so the
    audience includes them from now on). Returns the saved profile. The caller sets the cookie (apply_cookie).
    """
    from sefaria.model.user_profile import UserProfile

    profile = profile or UserProfile(id=user.id)
    profile.update({"settings": {SETTING_KEY: NEXT, VIA_KEY: VIA_SOCIAL}})
    profile.save()
    session = getattr(request, "session", None) if request is not None else None
    if session is not None:
        session[SESSION_SOCIAL_KEY] = True
    return profile


def has_social_cookie(request):
    return request.COOKIES.get(SOCIAL_COOKIE) == "1"


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


def apply_cookie(response, request, choice, clear_social=True):
    """
    Set (new reader) or clear (legacy reader) the routing cookie on ``response``. Clearing also clears Social's routing cookie
    unless ``clear_social`` is false (the middleware tidying a stale ``reader_version`` must not undo a Social opt-in).
    """
    domain = _cookie_domain(request)
    if choice == NEXT:
        response.set_cookie(
            COOKIE_NAME, NEXT, max_age=COOKIE_MAX_AGE, domain=domain, secure=request.is_secure(), samesite="Lax"
        )
    else:
        response.delete_cookie(COOKIE_NAME, domain=domain, samesite="Lax")
        # Social's routing cookie too, or nginx would keep sending this browser to the new reader (host-only: no domain)
        if clear_social and request.COOKIES.get(SOCIAL_COOKIE) is not None:
            response.delete_cookie(SOCIAL_COOKIE, samesite="Lax")
    return response


class ReaderChoiceMiddleware:
    """
    Keeps the routing cookie honest:

    - a ``next`` cookie held by someone the audience does not include (while the audience is "staff": a signed-in user who is
      not staff, or any signed-out visitor), or by anyone at all while the kill switch (``feature.reader.next.disabled``) is
      on, is cleared on the next response Django sends them;
    - once per session of a signed-in reader, the cookie is made to say what their profile says (a choice made on another
      browser takes effect here at sign-in). Readers who never chose are left alone — unless this browser came through Social
      (``reader_social=1``): then they are opted in for good (``opt_in_via_social``).

    A response whose view already set or cleared the cookie (``/api/profile``, ``/api/reader-choice``) is left as it is, and
    Voices-host responses are never touched.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not available() or not on_library(request) or COOKIE_NAME in response.cookies:
            return response
        user = getattr(request, "user", None)
        cookie_next = request.COOKIES.get(COOKIE_NAME) == NEXT
        signed_in = bool(user is not None and user.is_authenticated)

        if cookie_next and not signed_in:
            # The opt-in is for signed-in readers. With the audience "all", a reader who signed out keeps the reader
            # they chose (their next sign-in syncs it again); with "staff" no anonymous visitor can be told apart from staff.
            # The kill switch sends everyone back.
            if audience() != AUDIENCE_ALL or next_disabled():
                apply_cookie(response, request, CLASSIC, clear_social=next_disabled())
            return response
        if not signed_in:
            return response
        if cookie_next and not may_use_next(user, request):
            apply_cookie(response, request, CLASSIC, clear_social=next_disabled())
            return response

        session = getattr(request, "session", None)
        if session is None or session.get(SESSION_SYNCED_KEY):
            return response
        from sefaria.model.user_profile import UserProfile

        profile = UserProfile(id=user.id)
        if has_social_cookie(request) and available() and not next_disabled() and not (
            (profile.settings or {}).get(SETTING_KEY) == NEXT and _profile_via_social(profile)
        ):
            # signed in holding Social's routing cookie (a Social link opened while signed out, or on another account's page):
            # Social opts them in, for good
            profile = opt_in_via_social(user, request, profile)
        session[SESSION_SOCIAL_KEY] = _profile_via_social(profile)
        choice = (profile.settings or {}).get(SETTING_KEY)
        if choice == NEXT and not may_use_next(user, request):
            choice = None  # chosen while the audience included them; it no longer does (the cookie, if any, was cleared above)
        if choice in (NEXT, CLASSIC) and cookie_next != (choice == NEXT):
            apply_cookie(response, request, choice)
        session[SESSION_SYNCED_KEY] = True
        return response
