"""Heading ids and the table of contents equal live developers.sefaria.org for every page.

`fixtures/markdown/live/headings.json` holds every heading id of the 66 live pages (59 visible docs pages with a body
plus the 7 reference guide pages), captured from live's server HTML. The TOC is checked against the `toc` arrays of
`docs/dev-portal/research/site/pages.json`.
"""

import json
import pathlib
from urllib.parse import unquote

import pytest

from devportal.markdown import Slugger, render, slugify

from .markdown_source import REPO, require_source_root

LIVE = json.loads((REPO / "devportal/contracts/fixtures/markdown/live/headings.json").read_text(encoding="utf-8"))
PAGES = LIVE["pages"]
PAGES_JSON = REPO / "docs/dev-portal/research/site/pages.json"


def _rendered_headings(html):
    import lxml.html

    tree = lxml.html.fragment_fromstring("<div>" + html + "</div>")
    return [
        {"level": int(h.tag[1]), "id": h.get("id"), "text": h.find("span").text_content()}
        for h in tree.xpath("//h1|//h2|//h3|//h4|//h5|//h6")
        if "dp-heading" in (h.get("class") or "")
    ]


def _render_page(key):
    root = require_source_root()
    return render((root / PAGES[key]["source"]).read_text(encoding="utf-8"))


def test_fixture_covers_all_live_pages():
    assert len(PAGES) == 66
    assert sum(1 for k in PAGES if k.startswith("docs/")) == 59
    assert sum(len(p["headings"]) for p in PAGES.values()) >= 480


@pytest.mark.parametrize("key", sorted(PAGES), ids=sorted(PAGES))
def test_heading_ids_equal_live(key):
    ours = _rendered_headings(_render_page(key).html)
    live = PAGES[key]["headings"]
    assert [(h["level"], h["id"]) for h in ours] == [(h["level"], h["id"]) for h in live]
    assert [h["text"] for h in ours] == [h["text"] for h in live]


def _pages_json_toc():
    out = {}
    for page in json.loads(PAGES_JSON.read_text(encoding="utf-8")):
        path = unquote(page["url"].replace("https://developers.sefaria.org/", ""))
        if path in PAGES:
            out[path] = page["toc"]
    return out


TOCS = _pages_json_toc()


def test_pages_json_tocs_found():
    assert len(TOCS) >= 58


@pytest.mark.parametrize("key", sorted(TOCS), ids=sorted(TOCS))
def test_toc_equals_live(key):
    toc = _render_page(key).toc
    assert [entry["text"] for entry in toc] == TOCS[key]
    assert all(entry["level"] in (1, 2, 3) for entry in toc)


def test_slugger_matches_github_slugger():
    s = Slugger()
    assert [s.slug(t) for t in ("Duplicate", "Duplicate", "Duplicate-1", "Duplicate")] == [
        "duplicate",
        "duplicate-1",
        "duplicate-1-1",
        "duplicate-2",
    ]
    assert slugify('Example 1: A "Simple" Complex Text') == "example-1-a-simple-complex-text"
    assert slugify("⚠️ Important: Text Licenses") == "️-important-text-licenses"
    assert slugify("🔧 Project Highlights") == "-project-highlights"
    assert slugify("Notable Projects & Community Tools ") == "notable-projects--community-tools-"
    assert slugify("איך ליצור מראי מקורות") == "איך-ליצור-מראי-מקורות"
    assert slugify("with_text format") == "with_text-format"
    assert slugify("") == ""


def test_live_heading_fixture_is_consistent_with_slugify():
    """Every live id is the slug of its own text (de-duplication aside)."""
    for page in PAGES.values():
        for h in page["headings"]:
            assert h["id"] == slugify(h["text"]) or h["id"].startswith(slugify(h["text"]) + "-"), h


def test_empty_heading_renders_nothing_but_keeps_a_toc_entry():
    result = render("# Title\n\n###\n\n## Next\n")
    assert [e["text"] for e in result.toc] == ["Title", "", "Next"]
    assert result.html.count("<h") == 2


def test_headings_in_callouts_get_ids_but_stay_out_of_the_toc():
    source = '<Callout icon="🚧" theme="warn">\n  ### Inside\n</Callout>\n\n> 🚧 Quote title\n\n## Outside\n'
    result = render(source)
    assert [e["id"] for e in result.toc] == ["outside"]
    assert 'id="inside"' in result.html
    assert 'id="quote-title"' in result.html


def test_corpus_file_paths_exist():
    root = require_source_root()
    for page in PAGES.values():
        assert pathlib.Path(root / page["source"]).is_file(), page["source"]
