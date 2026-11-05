"""
Site appearance (auto / light / dark), server side.

The user's preference is stored only in the ``theme`` cookie (``auto`` | ``light`` | ``dark``),
written by static/js/sefaria/theme.js. No cookie, or any other value, means auto.

For light or dark the server renders ``<html data-theme="...">`` and ``<meta name="theme-color">``
in the first byte of HTML (no flash, no JS needed). For auto it renders no ``data-theme``: only the
browser knows the system setting, so the inline head script (templates/elements/theme_head.html)
sets it before any stylesheet loads, and falls back to light when the browser gives no signal.

Keep PREFERENCES, THEME_COOKIE and the colours in step with static/js/sefaria/theme.js and
templates/elements/theme_head.html; Jest (static/js/sefaria/tests/theme.test.js) compares them.

This module is deliberately dependency-free so it can be imported and tested without Mongo.
"""

THEME_COOKIE = "theme"
PREFERENCES = ("auto", "light", "dark")
THEMES = ("light", "dark")


def get_stored_theme(request):
    """
    The validated ``theme`` cookie ('auto' | 'light' | 'dark'), or None when unset or invalid.

    Only exact whitelist values pass, so the result is always safe to put in HTML attributes and
    in the props sent to Node. Django's cookie parser keeps the last ``theme`` cookie when several
    are sent; the client-side parsers follow the same rule.
    """
    cookies = getattr(request, "COOKIES", None) or {}
    value = cookies.get(THEME_COOKIE)
    return value if isinstance(value, str) and value in PREFERENCES else None


def resolve_theme(stored):
    """
    The theme the server can render for a stored preference: 'light' or 'dark' as stored, else None.
    None (auto, unset or invalid) means the browser decides from the system setting.
    """
    return stored if stored in THEMES else None
