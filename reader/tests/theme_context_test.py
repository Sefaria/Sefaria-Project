"""
Light/dark theme, server side: cookie validation (sefaria/system/theme.py), the theme_context
context processor, the always-present ``theme`` key in base_props, and what base.html renders.

The tests use RequestFactory and mocks and need no Mongo data. Heavy modules (the context
processors, reader.views) are imported inside the tests that need them.
"""
import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from django.template import Context, Template
from django.template.loader import render_to_string
from django.test import RequestFactory

from sefaria.system.theme import DEFAULT_THEME, THEME_COOKIE, THEMES, get_stored_theme, resolve_theme

REPO = Path(__file__).resolve().parents[2]
COOKIE_CASES = json.loads((REPO / "static/js/sefaria/tests/themeCookieCases.json").read_text())["cases"]
BASE_HTML = (REPO / "templates/base.html").read_text()
PARTIAL = (REPO / "templates/elements/theme_head.html").read_text()

MALICIOUS = [
    '"><script>alert(1)</script>',
    "dark\" onload=\"alert(1)",
    "dark' x='",
    "DARK",
    "system",
    "",
    "dark\x00",
    "dаrk",  # Cyrillic a
]


def _request(cookie=None):
    kwargs = {"HTTP_COOKIE": cookie} if cookie is not None else {}
    return RequestFactory().get("/texts", **kwargs)


def _base_line(pattern):
    """The single line of templates/base.html matching `pattern`, as a standalone template."""
    lines = [l for l in BASE_HTML.splitlines() if re.search(pattern, l)]
    assert len(lines) == 1, lines
    return lines[0].strip()


HTML_TAG = _base_line(r"^<html\b")
THEME_COLOR_META = _base_line(r'<meta name="theme-color"')


def _render_base_lines(context):
    return Template(HTML_TAG + "\n" + THEME_COLOR_META).render(Context(context))


# --- sefaria/system/theme.py --------------------------------------------------------------------

def test_constants():
    assert THEME_COOKIE == "theme"
    assert THEMES == ("light", "dark")
    assert DEFAULT_THEME == "light"


@pytest.mark.parametrize("case", COOKIE_CASES, ids=lambda c: repr(c["cookie"]))
def test_django_parses_the_shared_cookie_cases_like_the_client(case):
    # The same fixture drives parseThemeCookie() and the head script in Jest, so Django's real
    # cookie parser, theme.js and theme_head.html agree on every case (duplicates included).
    assert get_stored_theme(_request(case["cookie"])) == case["expected"]


def test_no_cookie_header():
    assert get_stored_theme(_request()) is None


@pytest.mark.parametrize("value", MALICIOUS)
def test_invalid_values_are_rejected(value):
    request = _request()
    request.COOKIES = {THEME_COOKIE: value}
    assert get_stored_theme(request) is None


@pytest.mark.parametrize("value", [None, 1, ["dark"], ("dark",), {"dark": 1}])
def test_non_string_values_are_rejected(value):
    request = SimpleNamespace(COOKIES={THEME_COOKIE: value})
    assert get_stored_theme(request) is None


def test_request_without_cookies():
    assert get_stored_theme(SimpleNamespace()) is None
    assert get_stored_theme(SimpleNamespace(COOKIES=None)) is None


@pytest.mark.parametrize("stored, expected", [
    ("dark", "dark"), ("light", "light"), (None, "light"), ("", "light"), ("DARK", "light"),
    ("system", "light"), ("garbage", "light"), (["dark"], "light"),
])
def test_resolve_theme(stored, expected):
    assert resolve_theme(stored) == expected


# --- context processor --------------------------------------------------------------------------

@pytest.mark.parametrize("cookie, theme, resolved", [
    (None, None, "light"),
    ("theme=dark", "dark", "dark"),
    ("theme=light", "light", "light"),
    ("theme=garbage", None, "light"),
    ('theme="><script>alert(1)</script>', None, "light"),
    ("theme=dark; theme=light", "light", "light"),
])
def test_theme_context(cookie, theme, resolved):
    from sefaria.system.context_processors import theme_context
    assert theme_context(_request(cookie)) == {"theme": theme, "resolved_theme": resolved}


@pytest.mark.parametrize("path", ["/texts", "/api/texts/Genesis.1", "/data.123.js", "/linker.js", "/login"])
def test_theme_context_runs_on_every_path(path):
    from sefaria.system.context_processors import theme_context
    request = RequestFactory().get(path, HTTP_COOKIE="theme=dark")
    assert theme_context(request)["resolved_theme"] == "dark"


def test_theme_context_is_registered():
    from django.conf import settings
    processors = settings.TEMPLATES[0]["OPTIONS"]["context_processors"]
    assert "sefaria.system.context_processors.theme_context" in processors


# --- base_props ---------------------------------------------------------------------------------

@pytest.fixture
def base_props_request(monkeypatch):
    """An anonymous request that base_props() can run on without Mongo or Postgres."""
    import reader.views as reader_views
    monkeypatch.setattr(reader_views, "get_todays_calendar_items", lambda **kwargs: [])
    monkeypatch.setattr(reader_views, "get_num_library_topics", lambda: 0)
    monkeypatch.setattr(reader_views.library, "get_last_cached_time", lambda: 0)
    monkeypatch.setattr(reader_views.remoteConfigCache, "get", lambda key, default=None: default)

    def make(cookie=None):
        request = _request(cookie)
        request.user = AnonymousUser()
        request.session = {}
        request.active_module = "library"
        request.interfaceLang = "english"
        request.LANGUAGE_CODE = "en"
        request.contentLang = "english"
        request.country_code = None
        request.diaspora = True
        request.translation_language_preference = None
        request.translation_language_preference_suggestion = None
        request.version_preferences_by_corpus = {}
        request.user_agent = SimpleNamespace(is_mobile=False)
        return request
    return make


@pytest.mark.parametrize("cookie, expected", [
    (None, None),
    ("theme=dark", "dark"),
    ("theme=light", "light"),
    ("theme=garbage", None),
    ('theme="><script>alert(1)</script>', None),
])
def test_base_props_always_has_theme(base_props_request, cookie, expected):
    from reader.views import base_props
    props = base_props(base_props_request(cookie))
    # The key must be present even when unset, or Node's shared Sefaria object keeps the previous
    # visitor's theme (static/js/sefaria/tests/unpackBaseProps.theme.test.js covers the JS side).
    assert "theme" in props
    assert props["theme"] == expected
    assert json.loads(json.dumps(props))["theme"] == expected


# --- templates ----------------------------------------------------------------------------------

@pytest.mark.parametrize("cookie, attr, meta", [
    (None, 'data-theme="light"', "#18345D"),
    ("theme=light", 'data-theme="light"', "#18345D"),
    ("theme=dark", 'data-theme="dark"', "#181818"),
    ("theme=garbage", 'data-theme="light"', "#18345D"),
    ('theme="><script>alert(1)</script>', 'data-theme="light"', "#18345D"),
])
def test_base_html_renders_the_theme(cookie, attr, meta):
    from sefaria.system.context_processors import theme_context
    context = {"request": SimpleNamespace(LANGUAGE_CODE="en"), "active_module": "library"}
    context.update(theme_context(_request(cookie)))
    out = _render_base_lines(context)
    assert out.splitlines()[0] == '<html lang="en" %s>' % attr
    assert 'content="%s"' % meta in out
    assert "<script" not in out


@pytest.mark.parametrize("resolved, meta", [("light", "#518159"), ("dark", "#181818")])
def test_base_html_theme_color_on_voices(resolved, meta):
    out = _render_base_lines({"resolved_theme": resolved, "active_module": "voices"})
    assert '<meta name="theme-color" content="%s">' % meta in out


def test_base_html_omits_data_theme_without_the_context_processor():
    # The head script then applies the cookie itself; see elements/theme_head.html.
    out = _render_base_lines({"request": SimpleNamespace(LANGUAGE_CODE="en"), "active_module": "library"})
    assert out.splitlines()[0] == '<html lang="en">'
    assert 'content="#18345D"' in out


def test_base_html_escapes_the_attribute():
    # Defence in depth: the value is whitelisted before it gets here, and autoescaping still holds.
    out = _render_base_lines({"resolved_theme": '"><script>alert(1)</script>', "active_module": "library"})
    assert "<script" not in out
    assert 'data-theme="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"' in out


def test_base_html_includes_the_head_script_before_any_stylesheet():
    head = BASE_HTML[:BASE_HTML.index("</head>")]
    include = head.index('{% include "elements/theme_head.html" %}')
    assert head.index('name="theme-color"') < include
    assert 'rel="stylesheet"' not in head[:include]
    assert "<script" not in head[:include]


def test_head_partial_renders_to_exactly_its_script():
    # Django must emit the script byte for byte (the Jest suite evaluates the raw file).
    script = re.search(r"<script>.*?</script>", PARTIAL, re.S).group(0)
    assert render_to_string("elements/theme_head.html").strip() == script


def _webpack_stats_missing():
    from django.conf import settings
    return not Path(settings.WEBPACK_LOADER["DEFAULT"]["STATS_FILE"]).exists()


@pytest.mark.parametrize("cookie, attr, meta", [
    (None, 'data-theme="light"', "#18345D"),
    ("theme=dark", 'data-theme="dark"', "#181818"),
    ('theme="><b>x</b>', 'data-theme="light"', "#18345D"),
])
def test_full_base_html_render(cookie, attr, meta):
    """The whole of base.html through every registered context processor (needs the built bundle stats)."""
    if _webpack_stats_missing():
        pytest.skip("webpack stats not built; the snippet tests above cover the same lines")
    request = _request(cookie)
    request.user = AnonymousUser()
    request.session = {}
    request.active_module = "library"
    request.interfaceLang = "english"
    request.LANGUAGE_CODE = "en"
    out = render_to_string("base.html", {"html": "", "propsJSON": "null"}, request=request)
    head = out[:out.index("</head>")]
    assert re.search(r"<html[^>]*>", out).group(0) == '<html lang="en" %s>' % attr
    assert '<meta name="theme-color" content="%s">' % meta in head
    script_at = head.index("<script>(function(){try{var d=document.documentElement")
    assert script_at == head.index("<script")
    assert script_at < head.index('rel="stylesheet"')
    assert "<b>x</b>" not in out
