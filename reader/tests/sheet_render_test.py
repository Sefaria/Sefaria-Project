"""Sheet pages print user-written fields as escaped text or as bleached HTML, and embed sheet JSON safely."""

from html.parser import HTMLParser
from unittest import mock

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.sheets import clean_sheet_for_render
from sourcesheets import views

IMG_ONERROR = "<img src=x onerror=alert(1)>"
SCRIPT_BREAKOUT = "</script><img src=x onerror=alert(1)>"


def _hostile_sheet(owner=0):
    """A stored sheet document with the fields the sheet pages read, and hostile user-written text."""
    return {
        "id": 1,
        "owner": owner,
        "title": SCRIPT_BREAKOUT,
        "status": "public",
        "summary": "A summary",
        "views": 3,
        "likes": [],
        "topics": [],
        "collections": [],
        "dateCreated": "2026-01-01T10:00:00.000000",
        "dateModified": "2026-01-02T10:00:00.000000",
        "nextNode": 3,
        "options": {
            "language": "bilingual",
            "layout": "sideBySide",
            "langLayout": "heRight",
            "numbered": 0,
            "boxed": 0,
            "collaboration": "none",
            "divineNames": "noSub",
        },
        "attribution": IMG_ONERROR + "Credit",
        "sources": [
            {
                "ref": "Genesis 1:1",
                "heRef": "בראשית א:א",
                "node": 1,
                "customTitle": IMG_ONERROR + "Custom",
                "text": {"en": "<b>kept</b><script>alert(2)</script>", "he": ""},
                "options": {"sourceLayout": "stacked", "sourceLanguage": "bilingual", "indented": "indented-1"},
            },
            {"comment": "<i>note</i>" + IMG_ONERROR, "node": 2, "options": {"indented": "indented-1"}},
        ],
    }


def _request(path):
    """A request carrying everything reader.views.base_props() and the template context processors read."""
    request = RequestFactory().get(path)
    request.user = AnonymousUser()
    request.session = {}
    request.LANGUAGE_CODE = "en"
    request.interfaceLang = "english"
    request.contentLang = "english"
    request.active_module = "voices"
    request.country_code = "us"
    request.diaspora = True
    request.user_agent = mock.MagicMock(is_mobile=False)
    request.translation_language_preference = None
    request.translation_language_preference_suggestion = None
    request.version_preferences_by_corpus = {}
    return request


@pytest.fixture
def hostile_sheet(db, monkeypatch):
    owner = create_test_user("sheet-render")
    monkeypatch.setattr(views, "get_sheet", lambda sheet_id: _hostile_sheet(owner.id))
    monkeypatch.setattr(views, "db", mock.MagicMock())
    monkeypatch.setattr(views, "get_redirect_to_help_center", lambda request, sheet_id: None)
    yield _hostile_sheet
    purge_test_profiles(owner)


URL_ATTRIBUTES = ("href", "src", "action", "formaction", "xlink:href", "data")
INJECTABLE_TAGS = {"svg", "object", "embed", "math"}
# The sheet templates embed iframes of their own (help videos, the tag manager fallback), all https.
# An iframe counts as injected only when its src is anything else.


class _MarkupAudit(HTMLParser):
    """Collects what a browser would treat as live content: elements, attributes and script blocks."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.problems = []
        self.script_blocks = 0

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.script_blocks += 1
        if tag in INJECTABLE_TAGS:
            self.problems.append(f"injected <{tag}>")
        if tag == "iframe" and not (dict(attrs).get("src") or "").startswith("https://"):
            self.problems.append("injected <iframe>")
        for name, value in attrs:
            value = (value or "").strip().lower()
            if name.startswith("on"):
                self.problems.append(f"event handler {name} on <{tag}>")
            if name in URL_ATTRIBUTES and value.startswith(("javascript:", "data:text/html", "vbscript:")):
                self.problems.append(f"script URL in {name} on <{tag}>")
            if tag == "img" and value == "x":
                self.problems.append("injected <img src=x>")
            if "alert(" in value:
                self.problems.append(f"payload in {name} on <{tag}>")

    handle_startendtag = handle_starttag


def _assert_no_executable_injection(html):
    """
    The sheet JSON blob sits in a script block, JSON-escaped, so the payload text legitimately appears
    in it, and escaped text (such as the title) may still read `alert(1)`. So parse the page and judge
    elements and attributes only: no injected element or attribute, no event handler, no script URL,
    and no script block ended early (each opening script tag has exactly one closing tag).
    """
    audit = _MarkupAudit()
    audit.feed(html)
    audit.close()
    assert audit.problems == []
    assert html.lower().count("</script") == audit.script_blocks
    assert "</script><img" not in html
    # The payload's closing tag reaches the page only inside the escaped JSON.
    assert "\\u003c/script\\u003e" in html


@pytest.mark.django_db
def test_visual_sheet_page_escapes_hostile_fields(hostile_sheet):
    response = views.view_visual_sheet(_request("/sheets/visual/1"), "1")
    html = response.content.decode("utf8")
    _assert_no_executable_injection(html)
    # Bleached rich text and plain text still render.
    assert "<b>kept</b>" in html
    assert "note" in html
    assert "Credit" in html


@pytest.mark.django_db
def test_embedded_sheet_page_escapes_hostile_fields(hostile_sheet):
    response = views.view_sheet(_request("/sheets/1?embed=1"), "1")
    html = response.content.decode("utf8")
    _assert_no_executable_injection(html)
    assert "<b>kept</b>" in html
    assert "Credit" in html


def test_render_cleaner_bleaches_text_fields_and_keeps_media():
    sheet = _hostile_sheet()
    sheet["sources"].append({"media": "http://example.com/clip.mp4", "node": 3})
    clean_sheet_for_render(sheet)
    assert "onerror" not in sheet["attribution"]
    assert "onerror" not in sheet["sources"][0]["customTitle"]
    assert "<script" not in sheet["sources"][0]["text"]["en"]
    assert "onerror" not in sheet["sources"][1]["comment"]
    # Media is left for the editor to handle; render-time cleaning only bleaches text.
    assert sheet["sources"][2]["media"] == "http://example.com/clip.mp4"


@pytest.mark.django_db
def test_ref_link_fallback_escapes_unparseable_ref():
    from reader.templatetags.sefaria_tags import he_ref_link, ref_link

    assert "<img" not in ref_link(IMG_ONERROR)
    assert "<img" not in he_ref_link(IMG_ONERROR)
