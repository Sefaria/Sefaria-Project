"""Navigation: the sidebar trees, the sitemap, path resolution and the link check.

Sidebar tree shape (artifact `sidebar-<section>.json`, also returned by `build_tree`), a list of
categories, each with its visible pages in order:

    [{"kind": "category", "slug": "TECHNICAL DOCS", "title": "TECHNICAL DOCS", "pages": [
        {"kind": "page", "slug": "welcome", "title": "...", "path": "/docs/welcome",
         "deprecated": false, "link_url": "", "new_tab": false, "method": "", "pages": [...]},
     ...]}]

Custom pages have no category in the source; their tree is wrapped in one category titled
"Custom Pages", as live's sidebar API does. A page is visible when it is not deleted, has a
published revision, and neither it nor an ancestor is hidden (I-6). A category with no visible
page is left out.

The sitemap artifact holds absolute URLs whose origin is the placeholder `SITEMAP_ORIGIN`; the
view serving `/sitemap.xml` substitutes the request's origin.
"""

import json
import re
from datetime import UTC
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from xml.sax.saxutils import escape

from devportal.adapters import markdown as md
from devportal.adapters import spec as spec_adapter
from devportal.models import Page, PageKind, Section
from devportal.services.publish import register_artifact_builder

SITEMAP_ORIGIN = "__DEVPORTAL_ORIGIN__"
CUSTOM_PAGES_CATEGORY = "Custom Pages"
C9_PATH = Path(__file__).resolve().parents[1] / "contracts" / "C9_urls.json"
SECTION_PREFIXES = {"docs": Section.DOCS, "reference": Section.REFERENCE, "page": Section.PAGE}


def _load(section, include_deleted=False):
    qs = Page.objects.filter(section=section).select_related("published_revision", "draft_revision")
    if not include_deleted:
        qs = qs.filter(deleted_at__isnull=True)
    pages = list(qs.order_by("position", "id"))
    children = {}
    for page in pages:
        children.setdefault(page.parent_id, []).append(page)
    return pages, children


def page_title(page, revision=None):
    revision = revision or page.published_revision
    if revision is None:
        return page.slug
    if page.kind == PageKind.ENDPOINT:
        return revision.sidebar_label or revision.title_override or revision.title
    return revision.title or page.slug


def _operation(page):
    if page.kind != PageKind.ENDPOINT or not page.operation_id:
        return {}
    try:
        return spec_adapter.operation_index().get(page.operation_id) or {}
    except OSError:
        return {}


def is_visible(page):
    rev = page.published_revision
    return page.deleted_at is None and rev is not None and not rev.hidden


def _node(page, children, include_hidden):
    rev = page.published_revision if not include_hidden else (page.published_revision or page.draft_revision)
    op = _operation(page)
    node = {
        "kind": page.kind,
        "slug": page.slug,
        "title": page_title(page, rev),
        "path": page.url_path,
        "deprecated": bool(rev and rev.deprecated) or bool(op.get("deprecated")),
        "link_url": (rev.link_url if rev else "") or "",
        "new_tab": bool(rev and rev.link_new_tab),
        "method": op.get("method", ""),
        "pages": [],
    }
    if include_hidden:
        node["id"] = page.pk
        node["hidden"] = bool(rev and rev.hidden)
        node["published"] = page.published_revision_id is not None
        node["has_draft"] = page.draft_revision_id is not None
    for child in children.get(page.pk, []):
        if include_hidden or is_visible(child):
            node["pages"].append(_node(child, children, include_hidden))
    return node


def build_tree(section, *, include_hidden=False):
    """The sidebar tree of a section. `include_hidden` gives the editor's full tree."""
    _pages, children = _load(section)
    roots = children.get(None, [])
    if section == Section.PAGE:
        pages = [_node(p, children, include_hidden) for p in roots if include_hidden or is_visible(p)]
        return [{"kind": "category", "slug": CUSTOM_PAGES_CATEGORY, "title": CUSTOM_PAGES_CATEGORY, "pages": pages}]
    tree = []
    for root in roots:
        if root.kind != PageKind.CATEGORY:
            continue
        if not include_hidden and (root.published_revision is None or root.published_revision.hidden):
            continue
        node = _node(root, children, include_hidden)
        if node["pages"] or include_hidden:
            tree.append(node)
    return tree


def flatten(tree, depth=0):
    """Yield `(depth, node)` in sidebar order, categories at depth 0."""
    for node in tree:
        yield depth, node
        yield from flatten(node["pages"], depth + 1)


def visible_pages_in_order():
    """Every visible page with a URL, in sidebar order: custom pages, docs, reference."""
    by_section = {}
    for section in (Section.PAGE, Section.DOCS, Section.REFERENCE):
        _pages, children = _load(section)
        ordered = []

        def walk(parent_id, ordered=ordered, children=children):
            for page in children.get(parent_id, []):
                if page.kind == PageKind.CATEGORY:
                    if page.published_revision is not None and not page.published_revision.hidden:
                        walk(page.pk)
                    continue
                if not is_visible(page):
                    continue
                ordered.append(page)
                walk(page.pk)

        walk(None)
        by_section[section] = ordered
    return by_section


def public_path(page):
    """The page's path with its slug percent-encoded, as live writes it."""
    return f"/{page.section}/{quote(page.slug, safe='-_.~')}"


def build_sitemap():
    priorities = {Section.PAGE: "0.5", Section.DOCS: "0.7", Section.REFERENCE: "0.7"}
    urls = [
        f"<url><loc>{SITEMAP_ORIGIN}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>",
    ]
    for section, pages in visible_pages_in_order().items():
        for page in pages:
            if page.kind in (PageKind.LINK, PageKind.TAG_GROUP, PageKind.API_CONFIG):
                continue
            lastmod = ""
            if page.content_updated_at:
                stamp = page.content_updated_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")
                lastmod = f"<lastmod>{stamp}</lastmod>"
            urls.append(
                f"<url><loc>{SITEMAP_ORIGIN}{escape(public_path(page))}</loc>{lastmod}"
                f"<changefreq>daily</changefreq><priority>{priorities[section]}</priority></url>",
            )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(urls) + "</urlset>"
    )


@register_artifact_builder("sidebar-docs.json")
def _sidebar_docs(_context):
    return build_tree(Section.DOCS)


@register_artifact_builder("sidebar-reference.json")
def _sidebar_reference(_context):
    return build_tree(Section.REFERENCE)


@register_artifact_builder("sidebar-page.json")
def _sidebar_page(_context):
    return build_tree(Section.PAGE)


@register_artifact_builder("sitemap.xml", content_type="application/xml")
def _sitemap(_context):
    return build_sitemap()


# --- resolution and the link check (PLAN.md §6.3) ----------------------------------------------

_PAGE_PATH = re.compile(r"^/(docs|reference|page)/([^/]+)/?$")


def resolve_path(path, *, published_only=True):
    """The page a portal path (optionally percent-encoded, with query or fragment) names, or None."""
    parts = urlsplit(path)
    m = _PAGE_PATH.match(unquote(parts.path))
    if not m:
        return None
    qs = Page.objects.filter(section=SECTION_PREFIXES[m.group(1)], slug=m.group(2), deleted_at__isnull=True)
    qs = qs.exclude(kind=PageKind.CATEGORY)
    if published_only:
        qs = qs.exclude(published_revision=None)
    return qs.first()


@lru_cache(maxsize=1)
def _route_patterns():
    data = json.loads(C9_PATH.read_text(encoding="utf-8"))
    patterns = []
    for route in data["routes"]:
        for pattern in route["patterns"]:
            if not pattern.startswith("/") or "<slug>" in pattern:
                continue
            regex = ""
            for piece in re.split(r"(<[a-z_]+>)", pattern):
                if piece == "<rest>":
                    regex += ".+"
                elif piece.startswith("<") and piece.endswith(">"):
                    regex += "[^/]+"
                else:
                    regex += re.escape(piece)
            patterns.append(re.compile("^" + regex + "$"))
    return patterns


def is_known_route(path):
    plain = unquote(urlsplit(path).path)
    return any(p.match(plain) for p in _route_patterns())


def classify_destination(dest):
    """`external`, `anchor`, `ok`, or `unresolved` for one link destination."""
    dest = (dest or "").strip()
    if not dest or dest.startswith("#"):
        return "anchor"
    if dest.startswith(("doc:", "ref:", "page:")):
        return "unresolved"
    if re.match(r"^https?://developers\.sefaria\.org(/|$)", dest, re.IGNORECASE):
        return "unresolved"  # should have been made relative by the import
    if dest.startswith("/") and not dest.startswith("//"):
        if resolve_path(dest) is not None or is_known_route(dest):
            return "ok"
        return "unresolved"
    return "external"


def _next_destinations(revision):
    for item in (revision.next or {}).get("pages") or []:
        slug = item.get("slug") or ""
        prefix = "/reference/" if item.get("type") == "endpoint" else "/docs/"
        yield prefix + slug


EXTERNAL_IMAGE = re.compile(r"^https?://(files\.readme\.io|i\.imgur\.com)/", re.IGNORECASE)


def check_links(pages=None):
    """Check every published page. Returns `{"checked", "unresolved": [...], "external_images": [...]}`."""
    from devportal.adapters.storage import is_media_url

    if pages is None:
        pages = Page.objects.filter(deleted_at__isnull=True).exclude(published_revision=None)
    report = {"checked": 0, "links": 0, "unresolved": [], "external_images": []}
    for page in pages.select_related("published_revision"):
        rev = page.published_revision
        report["checked"] += 1
        where = f"{page.section}/{page.slug}"
        dests = list(md.link_destinations(rev.body_md))
        dests += list(_next_destinations(rev))
        if rev.link_url:
            dests.append(rev.link_url)
        for dest in dests:
            report["links"] += 1
            if classify_destination(dest) == "unresolved":
                report["unresolved"].append({"page": where, "destination": dest})
        for src in md.image_sources(rev.body_md):
            if src.startswith(("http://", "https://")) and not is_media_url(src):
                report["external_images"].append({"page": where, "url": src})
    return report
