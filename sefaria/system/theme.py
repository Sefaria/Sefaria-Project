"""
Light/dark site theme, server side.

The user's choice is stored only in the ``theme`` cookie (``light`` | ``dark``), written by
static/js/sefaria/theme.js. The server reads it here so that ``<html data-theme="...">`` and
``<meta name="theme-color">`` are right in the first byte of HTML (no flash, no JS needed).
No cookie, or any other value, means light.

Keep THEMES, THEME_COOKIE and the colours in step with static/js/sefaria/theme.js and
templates/elements/theme_head.html; Jest (static/js/sefaria/tests/theme.test.js) compares them.

This module is deliberately dependency-free so it can be imported and tested without Mongo.
"""

THEME_COOKIE = "theme"
THEMES = ("light", "dark")
DEFAULT_THEME = "light"


def get_stored_theme(request):
    """
    The validated theme cookie ('light' | 'dark'), or None when unset or invalid.

    Only exact whitelist values pass, so the result is always safe to put in HTML attributes and
    in the props sent to Node. Django's cookie parser keeps the last ``theme`` cookie when several
    are sent; the client-side parsers follow the same rule.
    """
    cookies = getattr(request, "COOKIES", None) or {}
    value = cookies.get(THEME_COOKIE)
    return value if isinstance(value, str) and value in THEMES else None


def resolve_theme(stored):
    """The theme to render for a stored value: the stored choice if valid, else light."""
    return stored if stored in THEMES else DEFAULT_THEME
