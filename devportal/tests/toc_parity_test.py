"""The table of contents page_doc.html renders equals live's on every page (PLAN.md Phase 3).

For each page of `docs/dev-portal/research/site/pages.json` the source file is rendered with the portal's
renderer (`RenderResult.toc`, what the publish pipeline stores as `PageRevision.rendered_toc`), put in a
C3 doc payload and rendered with page_doc.html; the TOC entries the template shows must equal live's
`toc` array, in order, including live's empty entries for empty headings. Written against the source
snapshot, without W6's import.
"""

import json
from urllib.parse import unquote, urlparse

import lxml.html
import pytest
from django.template.loader import render_to_string

from devportal.markdown import parse_front_matter, render

from .pure.markdown_source import REPO, require_source_root

PAGES_JSON = json.loads((REPO / "docs/dev-portal/research/site/pages.json").read_text(encoding="utf-8"))


def _path(entry):
    return unquote(urlparse(entry["url"]).path)


PAGES = [e for e in PAGES_JSON if e["status"] == 200 and _path(e).split("/")[1] in ("docs", "reference")]


def _source(root, path):
    section, slug = path.strip("/").split("/", 1)
    for f in (root / section).rglob("*.md"):
        if (f.parent.name if f.name == "index.md" else f.stem) == slug:
            return f
    raise AssertionError(f"no source for {path}")


def render_page(path, source_text):
    front, body = parse_front_matter(source_text)
    result = render(body, revision="1")
    payload = {
        "kind": "doc",
        "path": path,
        "section": path.split("/")[1],
        "layout": "standard",
        "page": {
            "title": front.get("title", ""),
            "excerpt": front.get("excerpt", ""),
            "bodyHtml": result.html,
            "toc": result.toc,
            "updatedAt": None,
            "deprecated": False,
        },
        "nav": None,
        "pager": {"prev": None, "next": None},
    }
    return render_to_string("devportal/page_doc.html", {"payload": payload})


def toc_texts(html):
    tree = lxml.html.fromstring(f"<div>{html}</div>")
    navs = tree.xpath('//nav[@aria-label="Table of Contents"]')
    if not navs:
        return []
    return [li.text_content().strip() for li in navs[0].xpath(".//li")]


def test_pages_are_covered():
    assert len(PAGES) == 60  # 59 visible docs pages and the reference guide in pages.json


@pytest.mark.parametrize("entry", PAGES, ids=[_path(e) for e in PAGES])
def test_toc_equals_live(entry):
    path = _path(entry)
    source = _source(require_source_root(), path)
    html = render_page(path, source.read_text(encoding="utf-8"))
    assert toc_texts(html) == [t.strip() for t in entry["toc"]]


def test_toc_links_point_at_heading_ids():
    source = _source(require_source_root(), "/docs/linker-v3")
    html = render_page("/docs/linker-v3", source.read_text(encoding="utf-8"))
    tree = lxml.html.fromstring(f"<div>{html}</div>")
    ids = set(tree.xpath('//*[@id="dp-article-body"]//*[starts-with(local-name(), "h")]/@id'))
    hrefs = tree.xpath('//nav[@aria-label="Table of Contents"]//a/@href')
    assert hrefs
    assert all(h.startswith("#") and h[1:] in ids for h in hrefs)
    levels = tree.xpath('//nav[@aria-label="Table of Contents"]//li/@class')
    assert all(c.startswith("dp-toc-item dp-toc-item--h") for c in levels)
