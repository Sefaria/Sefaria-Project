"""
Tests for reader/ng.py: which reader requests get the NG mobile reader, the sticky `ng`
cookie, and the props NG receives.

reader/ng.py imports nothing from the model layer, so these tests need Django's request and
response classes and nothing else (no Mongo, no Ref): refs are stand-ins with the two
attributes the dispatch reads.
"""
import itertools

import pytest
from django.http import HttpResponse
from django.test import RequestFactory
from user_agents import parse as parse_user_agent

from reader.ng import (
    CLASSIC_ONLY_CONNECTIONS, NG_BASE_PROP_KEYS, NG_COOKIE, NG_COOKIE_MAX_AGE, apply_ng_cookie, is_mobile_request,
    ng_panel, ng_reader_props, ng_supports_connections, ng_supports_request, use_ng_reader,
)

UAS = {
    "iphone": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "pixel": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "ipad": "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "desktop": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}
MOBILE_UAS = {"iphone", "pixel"}


class FakeRef:
    """The two things use_ng_reader asks of a Ref."""
    def __init__(self, book="Genesis", book_level=False):
        self.book = book
        self._book_level = book_level

    def is_book_level(self):
        return self._book_level


REFS = {
    "section": FakeRef(),                       # /Genesis.1
    "segment": FakeRef(),                       # /Genesis.1.3 (same shape to the dispatch)
    "talmud": FakeRef(book="Berakhot"),         # /Berakhot.2a
    "book": FakeRef(book_level=True),           # /Genesis -> the book's table of contents
    "sheet": FakeRef(book="Sheet"),             # /sheets/123 routed through text_panels
}

# Associated texts opened front and center from NG's panel land on these: commentaries (the
# depth-3 "X on Y" texts, and on the Talmud), codes, the Mishnah. They are Library text refs
# like any other, so the phone gets NG for them too; only a book-level ref (the TOC) stays classic.
OTHER_CORPORA = {
    "commentary-segment": FakeRef(book="Rashi on Genesis"),             # /Rashi_on_Genesis.1.1.1
    "commentary-range": FakeRef(book="Rashi on Genesis"),               # /Rashi_on_Genesis.1.1.1-3
    "commentary-section": FakeRef(book="Rashi on Genesis"),             # /Rashi_on_Genesis.1.1
    "talmud-commentary": FakeRef(book="Tosafot on Berakhot"),           # /Tosafot_on_Berakhot.2a.1.1
    "halakhah": FakeRef(book="Shulchan Arukh, Orach Chayim"),           # /Shulchan_Arukh,_Orach_Chayim.1.1
    "mishnah": FakeRef(book="Mishnah Berakhot"),                        # /Mishnah_Berakhot.1.1
}
REFS.update(OTHER_CORPORA)
REFS["commentary-book"] = FakeRef(book="Rashi on Genesis", book_level=True)  # /Rashi_on_Genesis: its TOC


def make_request(ua="iphone", params=None, cookie=None, path="/Genesis.1"):
    request = RequestFactory().get(path, params or {}, HTTP_USER_AGENT=UAS[ua])
    # django_user_agents' middleware sets this attribute from the same library.
    request.user_agent = parse_user_agent(UAS[ua])
    if cookie is not None:
        request.COOKIES[NG_COOKIE] = cookie
    return request


# --------------------------------------------------------------------------- detection

@pytest.mark.parametrize("ua,expected", [("iphone", True), ("pixel", True), ("ipad", False), ("desktop", False)])
def test_mobile_detection_is_the_user_agent(ua, expected):
    assert is_mobile_request(make_request(ua)) is expected


def test_mobile_param_forces_mobile_like_text_panels():
    assert is_mobile_request(make_request("desktop", {"mobile": ""})) is True


# --------------------------------------------------------------------------- explicit cases

@pytest.mark.parametrize("ua,params,cookie,ref,expected", [
    # Default: the phone gets NG, everything else classic.
    ("iphone", {}, None, "section", True),
    ("pixel", {}, None, "talmud", True),
    ("iphone", {}, None, "segment", True),
    ("ipad", {}, None, "section", False),
    ("desktop", {}, None, "section", False),
    ("desktop", {"mobile": ""}, None, "section", True),
    # ?ng forces either way, desktop included (QA).
    ("desktop", {"ng": "1"}, None, "section", True),
    ("iphone", {"ng": "0"}, None, "section", False),
    # The sticky cookie decides when there is no ?ng.
    ("desktop", {}, "1", "section", True),
    ("iphone", {}, "0", "section", False),
    # ?ng beats the cookie.
    ("iphone", {"ng": "1"}, "0", "section", True),
    ("desktop", {"ng": "0"}, "1", "section", False),
    # ?ng=auto ignores the cookie (and clears it, see below); garbage values are ignored.
    ("iphone", {"ng": "auto"}, "0", "section", True),
    ("desktop", {"ng": "auto"}, "1", "section", False),
    ("iphone", {"ng": "yes"}, None, "section", True),
    ("iphone", {}, "banana", "section", True),
    # Refs NG cannot render stay classic, whatever was asked for.
    ("iphone", {}, None, "book", False),
    ("iphone", {"ng": "1"}, None, "book", False),
    ("iphone", {}, None, "sheet", False),
    ("desktop", {"ng": "1"}, "1", "sheet", False),
    ("iphone", {"p2": "Rashi on Genesis 1"}, None, "section", False),
    ("iphone", {"ng": "1", "p3": "Exodus 1"}, None, "section", False),
    # with= opens NG's associated-texts panel: all, a work, a category, a quoted work.
    ("iphone", {"with": "Rashi"}, None, "section", True),
    ("iphone", {"with": "all"}, None, "segment", True),
    ("desktop", {"with": "all", "ng": "1"}, None, "section", True),
    ("pixel", {"with": "Steinsaltz"}, None, "talmud", True),
    ("iphone", {"with": "Midrash"}, None, "section", True),
    ("iphone", {"with": "Rashi|Quoting"}, None, "section", True),
    # ...but not a classic sidebar tool (NG shows books only), and never on desktop by default.
    ("iphone", {"with": "Sheets"}, None, "section", False),
    ("iphone", {"with": "Topics", "ng": "1"}, None, "section", False),
    ("desktop", {"with": "Rashi"}, None, "section", False),
    # A with= page NG can't render (a book) stays classic.
    ("iphone", {"with": "Rashi"}, None, "book", False),
])
def test_use_ng_reader(ua, params, cookie, ref, expected):
    assert use_ng_reader(make_request(ua, params, cookie), REFS[ref]) is expected


@pytest.mark.parametrize("name", sorted(OTHER_CORPORA))
@pytest.mark.parametrize("ua,params,cookie,expected", [
    ("iphone", {}, None, True),
    ("pixel", {"lang": "bi"}, None, True),
    ("iphone", {"with": "all"}, None, True),                 # opened with its own associated texts
    ("iphone", {"with": "Siftei Chakhamim"}, None, True),
    ("desktop", {}, None, False),
    ("desktop", {"ng": "1"}, None, True),
    ("iphone", {"ng": "0"}, None, False),
    ("iphone", {}, "0", False),
    ("iphone", {"p2": "Genesis 1"}, None, False),
])
def test_associated_texts_opened_front_and_center_get_ng(name, ua, params, cookie, expected):
    assert use_ng_reader(make_request(ua, params, cookie, path="/Rashi_on_Genesis.1.1.1"), REFS[name]) is expected


def test_a_commentary_book_page_stays_classic():
    assert use_ng_reader(make_request("iphone", path="/Rashi_on_Genesis"), REFS["commentary-book"]) is False
    assert use_ng_reader(make_request("desktop", {"ng": "1"}, path="/Rashi_on_Genesis"), REFS["commentary-book"]) is False


def test_no_ref_means_classic():
    assert use_ng_reader(make_request(), None) is False


@pytest.mark.parametrize("value,expected", [
    ("all", True), ("Rashi", True), ("Ibn_Ezra", True), ("Rashi+Ramban", True), ("Commentary ConnectionsList", True),
    ("Quoting Commentary", True), ("Rashi|Quoting", True), ("", True),
    ("Sheets", False), ("Topics", False), ("Translations", False), ("Version_Open", False), ("Lexicon", False),
    ("Sheets+Rashi", False), ("WebPage:example.com", False),
])
def test_which_with_values_ng_shows(value, expected):
    assert ng_supports_connections(value) is expected


def test_every_classic_sidebar_mode_stays_classic():
    # The same list as reader/views.py get_connections_mode's sidebarModes.
    for mode in CLASSIC_ONLY_CONNECTIONS:
        assert use_ng_reader(make_request("iphone", {"with": mode.replace(" ", "_")}), REFS["section"]) is False


def test_the_panel_keeps_the_connections_filter():
    panel = text_panel()
    panel.update({"mode": "TextAndConnections", "filter": ["Rashi"], "connectionsMode": "TextList", "showHighlight": True})
    trimmed = ng_panel(panel)
    assert trimmed["filter"] == ["Rashi"]
    assert trimmed["highlightedRefs"] == ["Genesis 1:3"]
    assert "showHighlight" not in trimmed and "mode" not in trimmed


def test_ordinary_params_do_not_block_ng():
    request = make_request("iphone", {"lang": "he", "ven": "english|The_JPS_Tanakh", "vhe": "hebrew|Miqra", "aliyot": "1"})
    assert ng_supports_request(request, REFS["section"]) is True
    assert use_ng_reader(request, REFS["section"]) is True


# --------------------------------------------------------------------------- the full matrix

NG_PARAMS = [None, "1", "0", "auto", "x"]
COOKIES = [None, "1", "0", "x"]
EXTRA = [{}, {"p2": "Exodus 1"}, {"with": "Rashi"}, {"with": "all"}, {"with": "Sheets"}, {"with": "WebPage:x.com"}, {"mobile": ""}]


@pytest.mark.parametrize("ua,ng,cookie,ref,extra", list(itertools.product(UAS, NG_PARAMS, COOKIES, REFS, EXTRA)))
def test_matrix(ua, ng, cookie, ref, extra):
    params = dict(extra)
    if ng is not None:
        params["ng"] = ng
    request = make_request(ua, params, cookie)
    result = use_ng_reader(request, REFS[ref])

    classic_tool = params.get("with") in ("Sheets", "WebPage:x.com")
    unsupported = REFS[ref].is_book_level() or ref == "sheet" or "p2" in params or classic_tool
    mobile = ua in MOBILE_UAS or "mobile" in params
    if unsupported:
        assert result is False
    elif ng in ("1", "0"):
        assert result is (ng == "1")
    elif ng != "auto" and cookie in ("1", "0"):
        assert result is (cookie == "1")
    else:
        assert result is mobile


# --------------------------------------------------------------------------- the sticky cookie

@pytest.mark.parametrize("value", ["1", "0"])
def test_ng_param_sets_a_sticky_cookie(value):
    response = apply_ng_cookie(make_request(params={"ng": value}), HttpResponse())
    morsel = response.cookies[NG_COOKIE]
    assert morsel.value == value
    assert morsel["path"] == "/"
    assert int(morsel["max-age"]) == NG_COOKIE_MAX_AGE
    assert morsel["samesite"] == "Lax"


def test_ng_auto_clears_the_cookie():
    response = apply_ng_cookie(make_request(params={"ng": "auto"}, cookie="0"), HttpResponse())
    assert response.cookies[NG_COOKIE].value == ""
    assert response.cookies[NG_COOKIE]["max-age"] == 0


@pytest.mark.parametrize("params", [{}, {"ng": "maybe"}, {"lang": "he"}])
def test_no_cookie_change_without_a_valid_ng_param(params):
    response = apply_ng_cookie(make_request(params=params, cookie="1"), HttpResponse())
    assert NG_COOKIE not in response.cookies


def test_the_cookie_is_set_even_when_the_ref_falls_back_to_classic():
    # ?ng=1 on a book page renders classic, but the choice still sticks for the next text page.
    request = make_request("desktop", {"ng": "1"})
    assert use_ng_reader(request, REFS["book"]) is False
    assert apply_ng_cookie(request, HttpResponse()).cookies[NG_COOKIE].value == "1"


# --------------------------------------------------------------------------- props

def base_props():
    """The keys base_props() produces, including per-user and conditional ones NG must not get."""
    return {
        "_uid": 7, "_email": "a@b.c", "slug": "a-b", "is_moderator": False, "notifications": [{"x": 1}],
        "saved": {"loaded": False, "items": []}, "calendars": [{"title": "Parashat Hashavua"}],
        "in_chatbot_experiment": True, "chatbot_user_token": "secret", "googleClientId": "g",
        "activeModule": "library", "last_cached": 1790000000, "initialPath": "/Genesis.1",
        "interfaceLang": "english", "initialSettings": {"language": "bilingual"},
        "translationLanguagePreference": None, "versionPrefsByCorpus": {}, "domainModules": {},
        "_siteSettings": {"TORAH_SPECIFIC": True}, "_debug": False, "appVersion": "v1", "multiPanel": True,
    }


def text_panel():
    version = {"text": ["בראשית"], "versionTitle": "Miqra", "languageFamilyName": "hebrew", "direction": "rtl",
               "isPrimary": True, "isSource": True, "priority": 2, "formatAsPoetry": "", "license": "CC-BY",
               "versionNotes": "long notes", "purchaseInformationImage": "x.png", "extendedNotes": "more"}
    return {
        "mode": "Text", "ref": "Genesis 1:3", "refs": ["Genesis 1:3"], "filter": None, "versionFilter": [],
        "currVersions": {"en": {"languageFamilyName": "", "versionTitle": ""}, "he": {"languageFamilyName": "", "versionTitle": ""}},
        "highlightedRefs": ["Genesis 1:3"], "settings": {"language": "bilingual"}, "selectedWords": None,
        "indexDetails": {"title": "Genesis", "schema": {"big": "tree"}},
        "text": {"ref": "Genesis 1", "sectionRef": "Genesis 1", "next": "Genesis 2", "prev": None,
                 "he": ["בראשית"], "text": ["In the beginning"], "versions": [version],
                 "available_versions": [{"versionTitle": f"v{i}"} for i in range(50)],
                 "titleVariants": ["Gen"], "lengths": [50], "updateFromAPI": True},
    }


def test_props_are_a_whitelist_of_base_props():
    props = ng_reader_props(base_props(), [text_panel()], {"sentry": {"sampleRate": 1.0}})
    assert set(props) == set(NG_BASE_PROP_KEYS) | {"multiPanel", "initialPanel", "remoteConfig"}
    for dropped in ("notifications", "saved", "calendars", "in_chatbot_experiment", "chatbot_user_token", "googleClientId", "slug"):
        assert dropped not in props
    assert props["multiPanel"] is False
    assert props["remoteConfig"] == {"sentry": {"sampleRate": 1.0}}


def test_the_panel_keeps_the_text_and_drops_the_rest():
    panel = ng_panel(text_panel())
    assert set(panel) == {"ref", "refs", "currVersions", "highlightedRefs", "filter", "settings", "text"}
    text = panel["text"]
    assert text["he"] == ["בראשית"] and text["text"] == ["In the beginning"]
    assert text["next"] == "Genesis 2"
    assert "available_versions" not in text and "titleVariants" not in text and "updateFromAPI" not in text
    version = text["versions"][0]
    assert version["versionTitle"] == "Miqra" and version["direction"] == "rtl" and version["isPrimary"] is True
    assert "versionNotes" not in version and "purchaseInformationImage" not in version


def commentary_panel():
    """make_panel_dict for /Rashi_on_Genesis.1.1.1-3: a depth-3 text, its section, the range highlighted."""
    versions = [
        {"text": ["בראשית. אמר רבי יצחק", "בראשית ברא", "ברא אלהים"], "versionTitle": "Rosenbaum and Silbermann",
         "languageFamilyName": "hebrew", "direction": "rtl", "isPrimary": True, "isSource": True, "priority": 1},
        {"text": ["IN THE BEGINNING", "IN THE BEGINNING OF", "GOD CREATED"], "versionTitle": "Rosenbaum and Silbermann",
         "languageFamilyName": "english", "direction": "ltr", "isPrimary": False, "isSource": False},
    ]
    return {
        "mode": "Text", "ref": "Rashi on Genesis 1:1:1-3", "refs": ["Rashi on Genesis 1:1:1-3"],
        "currVersions": {"en": {"languageFamilyName": "", "versionTitle": ""}, "he": {"languageFamilyName": "", "versionTitle": ""}},
        "highlightedRefs": ["Rashi on Genesis 1:1:1", "Rashi on Genesis 1:1:2", "Rashi on Genesis 1:1:3"],
        "text": {"ref": "Rashi on Genesis 1:1", "heRef": "רש\"י על בראשית א׳:א׳", "sectionRef": "Rashi on Genesis 1:1",
                 "sections": ["1", "1"], "toSections": ["1", "1"], "textDepth": 3,
                 "sectionNames": ["Chapter", "Verse", "Comment"], "addressTypes": ["Perek", "Pasuk", "Integer"],
                 "indexTitle": "Rashi on Genesis", "heIndexTitle": "רש\"י על בראשית", "book": "Rashi on Genesis",
                 "collectiveTitle": "Rashi", "primary_category": "Commentary", "type": "Commentary",
                 "categories": ["Tanakh", "Rishonim on Tanakh", "Rashi", "Torah"], "isDependant": True,
                 "next": "Rashi on Genesis 1:2", "prev": None, "versions": versions,
                 "he": versions[0]["text"], "text": versions[1]["text"], "available_versions": [{}] * 12},
    }


def test_a_commentary_panel_keeps_what_ng_needs_to_render_it():
    panel = ng_panel(commentary_panel())
    assert panel["ref"] == "Rashi on Genesis 1:1:1-3"
    assert panel["highlightedRefs"] == ["Rashi on Genesis 1:1:1", "Rashi on Genesis 1:1:2", "Rashi on Genesis 1:1:3"]
    text = panel["text"]
    for key in ("textDepth", "sectionNames", "addressTypes", "indexTitle", "heIndexTitle", "collectiveTitle",
                "primary_category", "categories", "sections", "next", "prev", "he", "text"):
        assert key in text, key
    assert text["textDepth"] == 3 and text["primary_category"] == "Commentary"
    assert "available_versions" not in text and "isDependant" not in text
    assert [v["languageFamilyName"] for v in text["versions"]] == ["hebrew", "english"]


def test_props_without_panels():
    assert ng_reader_props(base_props(), [], None)["initialPanel"] is None
    assert ng_reader_props(base_props(), [], None)["remoteConfig"] == {}
