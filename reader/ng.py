"""
NG Mobile Web reader: the dispatch decision and the props it receives.

The NG reader is a separate React tree (static/js/ng/) that replaces the reader-of-text UI
on mobile web. `text_panels` asks `use_ng_reader` whether to render it instead of ReaderApp,
and `ng_reader_props` trims the props Django would send ReaderApp down to what NG reads.

This module deliberately imports nothing from Django or the model layer, so the decision can
be unit-tested without the full stack (see reader/tests/ng_reader_test.py).
"""
import re

NG_PARAM = "ng"
NG_COOKIE = "ng"
NG_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

NG_FORCE_ON = "1"
NG_FORCE_OFF = "0"
NG_RESET = "auto"   # ?ng=auto clears the sticky cookie and goes back to UA detection

_EXTRA_PANEL_PARAM_RE = re.compile(r"^p\d+$")
CONNECTIONS_PARAM = "with"

# `with=` values that open one of the classic reader's sidebar tools rather than texts
# (reader/views.py get_connections_mode's sidebarModes, plus WebPage: filters). NG's associated
# panel shows books only, so these stay on the classic reader. Every other value (all, a work
# such as Rashi, a category such as Midrash, "X ConnectionsList", "X|Quoting") opens NG's panel.
CLASSIC_ONLY_CONNECTIONS = frozenset((
    "Sheets", "Notes", "About", "AboutSheet", "Navigation", "Translations", "Translation Open", "Version Open",
    "WebPages", "extended notes", "Topics", "Torah Readings", "manuscripts", "Lexicon", "SidebarSearch", "Guide",
    "LinkerAdmin",
))


def ng_supports_connections(value):
    """Can NG's associated panel show this `with=` value? ("Rashi+Ramban": the first one decides.)"""
    first = (value or "").replace("_", " ").split("+")[0].strip()
    if first in CLASSIC_ONLY_CONNECTIONS or first.startswith("WebPage:"):
        return False
    return True


def _requested_ng_override(request):
    """The explicit choice for this request: '1', '0', or None. ?ng beats the cookie."""
    param = request.GET.get(NG_PARAM)
    if param in (NG_FORCE_ON, NG_FORCE_OFF):
        return param
    if param == NG_RESET:
        return None
    cookie = request.COOKIES.get(NG_COOKIE)
    return cookie if cookie in (NG_FORCE_ON, NG_FORCE_OFF) else None


def is_mobile_request(request):
    """The same detector text_panels uses to pick single-panel layout: the UA, or ?mobile."""
    user_agent = getattr(request, "user_agent", None)
    return bool(getattr(user_agent, "is_mobile", False)) or "mobile" in request.GET


def ng_supports_request(request, oref):
    """
    NG renders a single Library text section, optionally with its associated-texts panel open
    (`with=all`, `with=Rashi`, `with=Midrash`, ...). Everything else stays on the classic reader:
    book-level refs (the TOC page), sheets, multi-panel URLs (p2, p3, ...), and `with=` values
    that open a classic sidebar tool (sheets, topics, translations, lexicon, ...).
    """
    if oref is None:
        return False
    if getattr(oref, "book", None) == "Sheet":
        return False
    if oref.is_book_level():
        return False
    if any(_EXTRA_PANEL_PARAM_RE.match(key) for key in request.GET.keys()):
        return False
    if CONNECTIONS_PARAM in request.GET and not ng_supports_connections(request.GET.get(CONNECTIONS_PARAM)):
        return False
    return True


def use_ng_reader(request, oref):
    """
    Should this reader request render the NG tree?

    Precedence: ?ng=0|1, then the sticky `ng` cookie, then mobile detection. A forced `1`
    works on desktop too, for QA. Requests NG cannot render fall back to classic whatever
    was asked for. A rollout flag (remote config) belongs here when one is wanted.
    """
    if not ng_supports_request(request, oref):
        return False
    override = _requested_ng_override(request)
    if override is not None:
        return override == NG_FORCE_ON
    return is_mobile_request(request)


def apply_ng_cookie(request, response):
    """Make ?ng=0 / ?ng=1 sticky, and let ?ng=auto clear it. Returns `response`."""
    param = request.GET.get(NG_PARAM)
    if param in (NG_FORCE_ON, NG_FORCE_OFF):
        response.set_cookie(NG_COOKIE, param, max_age=NG_COOKIE_MAX_AGE, path="/", samesite="Lax")
    elif param == NG_RESET:
        response.delete_cookie(NG_COOKIE, path="/")
    return response


# Top-level props NG reads. Everything else ReaderApp gets (calendars, notifications,
# chatbot, SSO keys, saved items, ...) is dropped. Only fields Django always sends belong
# here, so nothing can linger on the shared Node-side `Sefaria` singleton between renders.
NG_BASE_PROP_KEYS = (
    "_uid",
    "_email",
    "activeModule",
    "last_cached",
    "initialPath",
    "interfaceLang",
    "initialSettings",
    "translationLanguagePreference",
    "versionPrefsByCorpus",
    "domainModules",
    "_siteSettings",
    "_debug",
    "appVersion",
)

# Keys of the panel's `text` (the /api/v3/texts shape built by make_panel_dict) that NG reads.
NG_TEXT_KEYS = (
    "ref", "heRef", "sectionRef", "heSectionRef", "firstAvailableSectionRef",
    "sections", "toSections", "isSpanning", "next", "prev",
    "book", "title", "heTitle", "indexTitle", "heIndexTitle",
    "primary_category", "type", "categories", "collectiveTitle", "heCollectiveTitle",
    "textDepth", "sectionNames", "addressTypes", "index_offsets_by_depth",
    "he", "text",
)

# Per-version keys. `available_versions` (every version of the text, ~50 for Genesis)
# is left out entirely: the config panel will fetch it when it opens.
NG_VERSION_KEYS = (
    "text", "versionTitle", "versionTitleInHebrew", "shortVersionTitle", "shortVersionTitleInHebrew",
    "languageFamilyName", "actualLanguage", "language", "direction",
    "isPrimary", "isSource", "priority", "formatAsPoetry", "license", "versionSource",
)

NG_PANEL_KEYS = ("ref", "refs", "currVersions", "highlightedRefs", "filter", "settings", "connectionsMode")


def _pick(source, keys):
    return {k: source[k] for k in keys if k in source}


def ng_panel(panel):
    """Trim one make_panel_dict panel to the NG shape."""
    out = _pick(panel, NG_PANEL_KEYS)
    text = panel.get("text")
    if text is not None:
        out["text"] = _pick(text, NG_TEXT_KEYS)
        out["text"]["versions"] = [_pick(v, NG_VERSION_KEYS) for v in text.get("versions", [])]
    return out


def ng_reader_props(base_props, panels, remote_config=None):
    """
    The props for NgReaderApp: a whitelist of `base_props` plus the first panel, trimmed.
    `remote_config` is passed through whole: the client reads Sentry sampling rates from it.
    """
    props = _pick(base_props, NG_BASE_PROP_KEYS)
    props["multiPanel"] = False
    props["initialPanel"] = ng_panel(panels[0]) if panels else None
    props["remoteConfig"] = remote_config or {}
    return props
