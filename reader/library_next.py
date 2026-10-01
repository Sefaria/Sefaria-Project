"""
Library Next: the dispatch decision for the rebuilt Library experience (static/js/library-next/).

Library page views (home, texts, calendars, topics, search, the ref catch-all) ask `resolve_mode`
whether to render the Library Next shell (templates/library_next/app.html) instead of ReaderApp.
The shell is a client-rendered SPA; this module only decides *whether* to serve it and keeps
the choice sticky.

Precedence: `?library=next|classic|auto`, then the `library_next` cookie (`1`/`0`), then
`settings.LIBRARY_NEXT_DEFAULT`. `?library=auto` clears the cookie.

This module deliberately imports nothing from Django or the model layer, so the decision can be
unit-tested without the full stack (see reader/tests/library_next_test.py). Django-specific
rendering lives in reader.views.render_library_next.
"""
from functools import wraps

LIBRARY_PARAM = "library"
LIBRARY_COOKIE = "library_next"
LIBRARY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

MODE_NEXT = "next"
MODE_CLASSIC = "classic"
MODE_AUTO = "auto"       # ?library=auto clears the sticky cookie and goes back to the default

COOKIE_ON = "1"
COOKIE_OFF = "0"

LIBRARY_MODULE = "library"  # mirrors sefaria.constants.model.LIBRARY_MODULE without importing it


def requested_override(request):
    """The explicit choice for this request: True (next), False (classic) or None. ?library beats the cookie."""
    param = request.GET.get(LIBRARY_PARAM)
    if param == MODE_NEXT:
        return True
    if param == MODE_CLASSIC:
        return False
    if param == MODE_AUTO:
        return None
    cookie = request.COOKIES.get(LIBRARY_COOKIE)
    if cookie == COOKIE_ON:
        return True
    if cookie == COOKIE_OFF:
        return False
    return None


def resolve_mode(request, default):
    """Should this request get Library Next? `default` is settings.LIBRARY_NEXT_DEFAULT."""
    override = requested_override(request)
    return bool(default) if override is None else override


def apply_library_next_cookie(request, response):
    """Make ?library=next / ?library=classic sticky for 30 days; ?library=auto clears it. Returns `response`."""
    param = request.GET.get(LIBRARY_PARAM)
    if param in (MODE_NEXT, MODE_CLASSIC):
        value = COOKIE_ON if param == MODE_NEXT else COOKIE_OFF
        response.set_cookie(LIBRARY_COOKIE, value, max_age=LIBRARY_COOKIE_MAX_AGE, path="/", samesite="Lax")
    elif param == MODE_AUTO:
        response.delete_cookie(LIBRARY_COOKIE, path="/")
    return response


def is_api_path(path):
    return (path or "").startswith("/api/")


def should_render_library_next(request, default):
    """
    The whole decision for a page view: GET only, never /api/, library module only, then mode.
    `request.active_module` is set by middleware; a request without it counts as the library.
    """
    if getattr(request, "method", "GET") != "GET":
        return False
    if is_api_path(getattr(request, "path", "")):
        return False
    if getattr(request, "active_module", LIBRARY_MODULE) != LIBRARY_MODULE:
        return False
    return resolve_mode(request, default)


def library_next_route(route_name, render=None, default=None):
    """
    Decorate a library page view: when Library Next is on for this request, render the shell for
    `route_name` instead of the view. `render(request, route_name)` and `default` are resolved
    lazily from reader.views / django settings when not passed (so this module stays import-free;
    tests pass them in).

        @library_next_route("texts")
        def texts_list(request): ...
    """
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            _default = default
            if _default is None:
                from django.conf import settings
                _default = getattr(settings, "LIBRARY_NEXT_DEFAULT", False)
            if should_render_library_next(request, _default):
                _render = render
                if _render is None:
                    from reader.views import render_library_next
                    _render = render_library_next
                return _render(request, route_name)
            response = view(request, *args, **kwargs)
            if hasattr(response, "set_cookie"):  # keep ?library=classic sticky on the classic path too
                apply_library_next_cookie(request, response)
            return response
        return wrapper
    return decorator


# Top-level props the shell reads. Kept cheap on purpose: no calendars, notifications or
# saved-history lookups (the SPA fetches what it needs through /api/*).
LIBRARY_NEXT_PROP_KEYS = (
    "_uid", "_email", "full_name", "slug", "is_moderator", "profile_pic_url",
    "interfaceLang", "activeModule", "last_cached", "appVersion", "path", "route", "libraryNext",
    "chatbot_user_token", "chatbot_api_base_url", "chatbot_origin",
)


def library_next_props(user, request, route_name, last_cached, app_version, chatbot=None, extra=None):
    """
    Build the shell's props from already-resolved pieces. `user` is a dict with the keys
    reader.views.library_next_props extracts from the Django user/profile (all optional).
    """
    user = user or {}
    props = {
        "_uid": user.get("id"),
        "_email": user.get("email", ""),
        "full_name": user.get("full_name", ""),
        "slug": user.get("slug", ""),
        "is_moderator": bool(user.get("is_moderator", False)),
        "profile_pic_url": user.get("profile_pic_url", ""),
        "interfaceLang": getattr(request, "interfaceLang", "english"),
        "activeModule": getattr(request, "active_module", LIBRARY_MODULE),
        "last_cached": last_cached,
        "appVersion": app_version,
        "path": request.get_full_path(),
        "route": route_name,
        "libraryNext": True,
    }
    props.update(chatbot or {})
    props.update(extra or {})
    return props
