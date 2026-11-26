"""Prev/next links equal live's on every page (PLAN.md Phase 3, "prev/next").

Written against fixture data, without W6's import: the sidebar order comes from live's sidebar files
(`devportal/migration_source/live/sidebar-*.json`), `next.pages` from the source front matter, and the
expected links from `docs/dev-portal/research/site/pages.json`. The rule (the same as
devportal-ui/src/docs/pager.ts, which Vitest proves on the same data):

1. A page shows the pagination only when its front matter `next.pages` is empty or absent.
2. Previous and next are its neighbours in the section's sidebar order, flattened depth first across
   all categories.
3. Only pages take part: `link` items are skipped; hidden pages are not in the sidebar.
4. Custom pages (`/page/<slug>`) have none.

`pager_for` below is the reference implementation; the page payload's `pager` (C3) must equal it.
"""

import json
from urllib.parse import unquote, urlparse

import pytest

from devportal.markdown import parse_front_matter

from .markdown_source import REPO, require_source_root

PAGES_JSON = json.loads((REPO / "docs/dev-portal/research/site/pages.json").read_text(encoding="utf-8"))
LIVE = REPO / "devportal/migration_source/live"


def flatten(section):
    """`[(path, title)]` of the section's pages in sidebar order."""
    out = []

    def walk(pages):
        for page in pages:
            if page.get("hidden"):
                continue
            if page["type"] != "link":
                out.append((f"/{section}/{page['slug']}", page["title"]))
            walk(page.get("pages", []))

    for category in json.loads((LIVE / f"sidebar-{section}.json").read_text(encoding="utf-8")):
        walk(category["pages"])
    return out


def pager_for(flat, path, has_next_pages):
    """`(prev, next)` as `(path, title)` or None."""
    paths = [p for p, _ in flat]
    if has_next_pages or path not in paths:
        return None, None
    i = paths.index(path)
    return (flat[i - 1] if i > 0 else None), (flat[i + 1] if i + 1 < len(flat) else None)


def _sources(root):
    found = {}
    for tree in ("docs", "reference"):
        for f in (root / tree).rglob("*.md"):
            found[f.parent.name if f.name == "index.md" else f.stem] = f
    return found


def _has_next_pages(path):
    front, _ = parse_front_matter(path.read_text(encoding="utf-8"))
    return bool(((front or {}).get("next") or {}).get("pages"))


def _path(entry):
    return unquote(urlparse(entry["url"]).path)


DOCS = [e for e in PAGES_JSON if e["status"] == 200 and _path(e).startswith("/docs/")]


def test_every_visible_docs_page_is_covered():
    assert len(DOCS) == 59
    assert len(flatten("docs")) == 59


@pytest.mark.parametrize("entry", DOCS, ids=[_path(e) for e in DOCS])
def test_pagination_equals_live(entry):
    sources = _sources(require_source_root())
    path = _path(entry)
    source = sources[path.rsplit("/", 1)[1]]
    prev, nxt = pager_for(flatten("docs"), path, _has_next_pages(source))
    shown = [{"t": title, "h": href} for href, title in filter(None, (prev, nxt))]
    assert shown == [{"t": link["t"], "h": unquote(link["h"])} for link in entry["pagination"]]


def test_reference_guide_and_custom_page_show_none():
    sources = _sources(require_source_root())
    by_path = {_path(e): e for e in PAGES_JSON}
    assert by_path["/reference/getting-started"]["pagination"] == []
    assert _has_next_pages(sources["getting-started"])
    assert pager_for(flatten("reference"), "/reference/getting-started", True) == (None, None)
    assert by_path["/page/contact-us"]["pagination"] == []


def test_link_items_are_skipped_and_categories_are_crossed():
    flat = flatten("docs")
    assert "/docs/helpful-link-somewhere-else" not in [p for p, _ in flat]
    assert pager_for(flat, "/docs/the-sefaria-mcp", False)[0][0] == "/docs/sites-using-the-linker"
    # Last page of TECHNICAL DOCS → first page of "local installation".
    assert pager_for(flat, "/docs/getting-started-with-local-installation", False)[0][0] == (
        "/docs/the-educator-playbook-a-quick-guide-to-vibe-coding-with-sefaria"
    )
    assert pager_for(flat, "/docs/how-to-report-a-mistake", False)[1] is None
