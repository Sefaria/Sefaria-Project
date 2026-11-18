"""Public HTML pages of the developers host, and the page payload behind them (PLAN.md §2.4, §2.5).

`resolve(path, origin)` turns a portal path into a page payload (contract C3,
`page-payload.schema.json`). The same payload is embedded in the HTML page as the `#dp-data` island
and returned by `GET /_portal/page.json?path=…` (devportal/views/api.py).

Phase 1 resolves the kinds `home` (a placeholder until the homepage lands), `doc` (published Page rows
of kind `page`), `redirect` (the built-in redirects of contract C9, tag groups, and the Redirect table)
and `notfound`. Endpoint pages, the gallery and the editor add their kinds in later phases.

Portal templates render without a request (rule Q4): `render_to_string(template, context)`, so no
Sefaria context processor runs. Views never touch `request.session` (S-12).
"""

import difflib
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote, urlsplit

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotAllowed, HttpResponseRedirect
from django.http.response import HttpResponseRedirectBase
from django.template.loader import render_to_string
from django.utils.cache import patch_vary_headers
from django.utils.encoding import iri_to_uri
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.views.decorators.http import require_safe

from devportal.models import Page, PageKind, PortalArtifact, PortalState, Redirect, Section
from devportal.security.headers import request_origin
from devportal.services import nav

CONTRACT_VERSION = 1

# PortalArtifact names this module reads. The publish pipeline writes them.
SIDEBAR_ARTIFACT = "sidebar-{section}.json"

NAV_SECTIONS = (Section.DOCS, Section.REFERENCE)
ACTIVE_TAB_BY_SECTION = {Section.DOCS: "docs", Section.REFERENCE: "reference"}
CONTACT_PAGE_SLUG = "contact-us"

NOT_FOUND_TITLE = "404 Not Found"
HOME_TITLE = "Sefaria"
MAX_PATH = 2048

# The built-in redirects of contract C9, in match order: (pattern, status, target template).
BUILTIN_REDIRECTS = (
    (re.compile(r"^/docs$"), 301, "/docs/welcome"),
    (re.compile(r"^/docs/$"), 301, "/docs"),
    (re.compile(r"^/docs/getting-started$"), 301, "/docs/welcome"),
    (re.compile(r"^/reference$"), 301, "/reference/getting-started"),
    (re.compile(r"^/reference/$"), 301, "/reference"),
    (re.compile(r"^/(?P<section>docs|reference)/(?P<slug>[^/]+)/$"), 301, "/{section}/{slug}"),
    (re.compile(r"^/v1\.0$"), 302, "/"),
    (re.compile(r"^/v1\.0/(?P<rest>.+)\.md$"), 302, "/{rest}"),  # live drops `.md` here (URL-parity crawl)
    (re.compile(r"^/v1\.0/(?P<rest>.*)$"), 302, "/{rest}"),
)
# Kinds rendered as a Markdown page. The hidden `ReadMeConfig` stubs (`api_config`) answer 200 as on live (I-6).
RENDERED_KINDS = (PageKind.PAGE, PageKind.API_CONFIG)
# A custom page's trailing slash is served directly, as on live.
PAGE_PATH = re.compile(r"^/(?P<section>docs|reference|page)/(?P<slug>[^/]+)(?P<slash>/?)$")

# "For AI agents" banner, copied from live (the first content of <body>).
AI_BANNER = (
    "For AI agents: the docs index is at {origin}/llms.txt. "
    "Append .md to any documentation page URL to get its markdown version."
)


# ---------------------------------------------------------------------------------------------------
# Payload


def is_portal_path(path):
    return isinstance(path, str) and path.startswith("/") and not path.startswith("//") and len(path) <= MAX_PATH


def _generation():
    return PortalState.load().generation


def search_docs_url(generation):
    """`/_portal/search-docs.<sha>.json` of the stored search documents (devportal.services.search_index).

    Before the first build there is no file; the URL then names a sha that answers 404, and the search modal
    shows its empty state.
    """
    from devportal.services import search_index  # noqa: PLC0415

    current = search_index.current_search_docs()
    if current is not None:
        return search_index.artifact_url(current[0])
    return search_index.artifact_url(hashlib.sha256(f"generation:{generation}".encode()).hexdigest()[:16])


def site_config(origin, generation, analytics_section="default"):
    return {
        "apiOrigin": settings.DEVPORTAL_API_ORIGIN.rstrip("/"),
        "ga4": dict(settings.DEVPORTAL_GA4 or {}),
        "analyticsSection": analytics_section,
        "demoApiKey": settings.DEVPORTAL_DEMO_API_KEY or None,
        "searchDocsUrl": search_docs_url(generation),
        "mcpUrl": f"{origin}/mcp",
        "generation": generation,
    }


def _meta(origin, path, *, description="", robots="index", markdown_path=None):
    return {
        "description": description,
        "robots": robots,
        "canonicalUrl": f"{origin}{path}",
        "markdownUrl": f"{origin}{markdown_path}" if markdown_path else None,
    }


def _base(kind, path, title, meta, active_tab, site):
    return {
        "contractVersion": CONTRACT_VERSION,
        "kind": kind,
        "path": path,
        "title": title,
        "meta": meta,
        "header": {"activeTab": active_tab},
        "site": site,
    }


def redirect_payload(path, status, location):
    return {
        "contractVersion": CONTRACT_VERSION,
        "kind": "redirect",
        "path": path,
        "status": status,
        "location": location,
    }


def home_payload(origin, site):
    payload = _base("home", "/", HOME_TITLE, _meta(origin, "/"), "home", site)
    from .home import home_body_html  # noqa: PLC0415 - devportal.views.home imports this module

    payload["bodyHtml"] = home_body_html()
    return payload


def _c3_item(node, ids):
    """One node of the publish pipeline's tree (devportal.services.nav) as a C3 sidebar item."""
    kind = node["kind"]
    item = {
        "id": ids.get((kind, node["slug"])),
        "kind": kind,
        "title": node["title"] or node["slug"],
        "href": (node.get("link_url") or node["path"]) if kind == PageKind.LINK else node["path"],
        "newTab": kind == PageKind.LINK and bool(node.get("new_tab")),
        "method": (node.get("method") or "get").lower() if kind == PageKind.ENDPOINT else None,
        "deprecated": bool(node.get("deprecated")),
        "children": [],
    }
    item["children"] = [c for c in (_c3_item(child, ids) for child in node.get("pages", [])) if c is not None]
    return item if item["id"] is not None and item["href"] else None


def sidebar_tree(section, generation):
    """The C3 sidebar tree (sidebar-tree.schema.json) of `section`.

    The publish pipeline stores its own tree shape in the `sidebar-<section>.json` artifact (categories with
    `pages`, `path`, `link_url`, no ids); this converts it, taking the ids from the pages themselves.
    """
    tree = None
    artifact = PortalArtifact.objects.filter(name=SIDEBAR_ARTIFACT.format(section=section)).first()
    if artifact is not None:
        try:
            tree = json.loads(artifact.content)
        except ValueError:
            tree = None
    if not isinstance(tree, list):
        tree = nav.build_tree(section)
    ids = {
        (kind, slug): pk
        for pk, kind, slug in Page.objects.filter(section=section, deleted_at__isnull=True).values_list(
            "pk", "kind", "slug"
        )
    }
    categories = []
    for node in tree:
        category_id = ids.get((PageKind.CATEGORY, node["slug"]))
        if node.get("kind") != PageKind.CATEGORY or category_id is None:
            continue
        items = [c for c in (_c3_item(child, ids) for child in node.get("pages", [])) if c is not None]
        categories.append({"id": category_id, "title": node["title"], "items": items})
    return {"contractVersion": CONTRACT_VERSION, "section": section, "generation": generation, "categories": categories}


def _iso(value):
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def doc_payload(origin, site, page, path):
    revision = page.published_revision
    metadata = revision.metadata or {}
    section = page.section
    canonical_path = page.url_path
    if section in ACTIVE_TAB_BY_SECTION:
        active_tab = ACTIVE_TAB_BY_SECTION[section]
    else:
        active_tab = "contact" if page.slug == CONTACT_PAGE_SLUG else None
    meta = _meta(
        origin,
        canonical_path,
        description=metadata.get("description") or revision.excerpt or "",
        robots="noindex" if metadata.get("robots") == "noindex" else "index",
        markdown_path=f"{canonical_path}.md",
    )
    payload = _base("doc", path, revision.title, meta, active_tab, site)
    nav = None
    if section in NAV_SECTIONS:
        generation = site["generation"]
        nav = {
            "section": section,
            "generation": generation,
            "url": f"/_portal/nav/{section}.json",
            "tree": sidebar_tree(section, generation),
        }
    payload.update(
        {
            "section": section,
            "slug": page.slug,
            "pageId": page.id,
            "layout": "fullscreen" if revision.fullscreen else "standard",
            "page": {
                "title": revision.title,
                "excerpt": revision.excerpt,
                "bodyHtml": revision.rendered_html,
                "toc": list(revision.rendered_toc or []),
                "updatedAt": _iso(page.content_updated_at),
                "deprecated": revision.deprecated,
            },
            "nav": nav,
            "pager": {"prev": None, "next": None},
        }
    )
    return payload


def visible_pages():
    return (
        Page.objects.filter(
            deleted_at__isnull=True,
            published_revision__isnull=False,
            published_revision__hidden=False,
            kind__in=(PageKind.PAGE, PageKind.ENDPOINT),
        )
        .select_related("published_revision")
        .order_by("section", "position", "id")
    )


def suggestions_for(path, limit=3):
    """Up to three visible pages whose slug is most similar to the path's last segment (I-14)."""
    target = path.rstrip("/").rsplit("/", 1)[-1].lower()
    if not target:
        return []
    scored = []
    for page in visible_pages():
        ratio = difflib.SequenceMatcher(None, target, page.slug.lower()).ratio()
        scored.append((-ratio, page.url_path, page.published_revision.title))
    scored.sort()
    return [{"title": title, "path": url_path} for _, url_path, title in scored[:limit] if title]


def notfound_payload(origin, site, path):
    payload = _base("notfound", path, NOT_FOUND_TITLE, _meta(origin, path, robots="noindex"), None, site)
    payload["suggestions"] = suggestions_for(path)
    return payload


def _first_visible_child(page):
    children = (
        page.children.filter(
            deleted_at__isnull=True, published_revision__isnull=False, published_revision__hidden=False
        )
        .exclude(kind=PageKind.CATEGORY)
        .order_by("position", "id")
    )
    return children.first()


def _table_redirect(path):
    redirect = Redirect.objects.filter(from_path=path).first()
    if redirect is None or not is_redirect_target(redirect.to_path):
        return None
    return redirect_payload(path, redirect.status, redirect.to_path)


def is_redirect_target(location):
    return bool(re.match(r"^(/(?!/)|https?://)", location or ""))


def resolve(path, origin):
    """The page payload for a portal path. Every path resolves: unknown ones to `notfound`."""
    for pattern, status, target in BUILTIN_REDIRECTS:
        match = pattern.match(path)
        if match:
            return redirect_payload(path, status, target.format(**match.groupdict()))

    generation = _generation()
    site = site_config(origin, generation)
    if path == "/":
        return home_payload(origin, site)

    match = PAGE_PATH.match(path)
    if match and (match["section"] == Section.PAGE or not match["slash"]):
        page = (
            Page.objects.filter(section=match["section"], slug=match["slug"], deleted_at__isnull=True)
            .exclude(kind=PageKind.CATEGORY)
            .select_related("published_revision")
            .first()
        )
        if page is not None and page.kind == PageKind.TAG_GROUP:
            child = _first_visible_child(page)
            if child is not None:
                return redirect_payload(path, 302, child.url_path)
        elif page is not None and page.kind in RENDERED_KINDS and page.published_revision is not None:
            return doc_payload(origin, site, page, path)

    return _table_redirect(path) or notfound_payload(origin, site, path)


def markdown_path_for(payload):
    """The page's .md path for the Link header's `alternate`, as live sends it (relative)."""
    if payload["kind"] == "doc":
        return urlsplit(payload["meta"]["markdownUrl"]).path
    if payload["kind"] == "notfound" and PAGE_PATH.match(payload["path"]):
        return payload["path"].rstrip("/") + ".md"
    return None


# ---------------------------------------------------------------------------------------------------
# HTML


def _content_html(payload):
    kind = payload["kind"]
    if kind == "home":
        return format_html('<main class="dp-main" id="dp-main">{}</main>', mark_safe(payload["bodyHtml"]))  # noqa: S308
    if kind == "doc":
        # W7's docs layout (sidebar, article, TOC, page footer); the body is rendered and sanitized by
        # devportal.markdown at publish time.
        return format_html(
            '<main class="dp-main" id="dp-main">{}</main>',
            mark_safe(render_to_string("devportal/page_doc.html", {"payload": payload})),  # noqa: S308
        )
    return ""


def render_page(payload, nonce, origin, *, status=200, template="devportal/base.html"):
    """Renders a page payload into a full HTML response (rule Q4: no request, no context processors)."""
    context = {
        "payload": payload,
        "csp_nonce": nonce,
        "title": payload["title"],
        "meta": payload["meta"],
        "active_tab": payload["header"]["activeTab"],
        "content_html": _content_html(payload),
        "ai_banner": AI_BANNER.format(origin=origin),
        "suggestions": payload.get("suggestions", []),
    }
    response = HttpResponse(render_to_string(template, context), status=status, content_type="text/html; charset=utf-8")
    response.devportal_markdown_path = markdown_path_for(payload)
    patch_vary_headers(response, ("Accept",))
    return response


class PortalRedirect(HttpResponseRedirectBase):
    """A portal redirect (301 or 302).

    Deliberately not an HttpResponseRedirect or HttpResponsePermanentRedirect: the main site's
    WebSessionRedirectMiddleware tags those with no_applink when the Referer is the library or voices
    host, which is about iOS universal links on the main site and would change live's redirect
    targets here (e.g. /docs -> /docs/welcome?no_applink=… for a visitor coming from sefaria.org).
    """

    def __init__(self, location, status):
        super().__init__(location, status=status)


def redirect_response(payload, query_string=""):
    location = payload["location"]
    if query_string and payload["path"].startswith("/v1.0"):  # C9: the versioned fallback keeps the query
        location = f"{location}?{query_string}"
    return PortalRedirect(iri_to_uri(location), payload["status"])


def nonce_for(request):
    return getattr(request, "devportal_nonce", "")


def response_for_path(request, path):
    """The full HTTP response for a portal path: the page, a redirect, or the 404 page."""
    origin = request_origin(request)
    payload = resolve(path, origin)
    if payload["kind"] == "redirect":
        return redirect_response(payload, request.META.get("QUERY_STRING", ""))
    if payload["kind"] == "notfound":
        return render_page(payload, nonce_for(request), origin, status=404, template="devportal/404.html")
    return render_page(payload, nonce_for(request), origin)


def portal_page(request, *args, **kwargs):
    """The fallback route: every portal path no more specific route claims (contract C9)."""
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET", "HEAD"])
    return response_for_path(request, request.path)


# ---------------------------------------------------------------------------------------------------
# Site files: robots.txt, favicons, web manifest, /login

STATIC_DIR = Path(__file__).resolve().parents[1] / "static" / "devportal"
ICON_VERSION = "e9b1b3beada0"  # live's cache-busting query string, kept so cached URLs stay valid
SITE_FILES = {
    "favicon.ico": "image/x-icon",
    "apple-touch-icon.png": "image/png",
    "icon-192.png": "image/png",
    "icon-512.png": "image/png",
}
_site_file_cache = {}

# research/site/machine/robots.txt, with our internal paths added. The origin comes from the request.
LIVE_ROBOTS = """User-agent: *
Allow: /
Disallow: /*/api-next
Disallow: /cdn-cgi/
Disallow: /edit/
Disallow: /*/edit/
Disallow: /suggested-edits/
Disallow: /login
Disallow: /logout
Disallow: /_portal/
Disallow: /editor

Sitemap: {origin}/sitemap.xml
# LLM Information: {origin}/llms.txt
"""
CLOSED_ROBOTS = "User-agent: *\nDisallow: /\n"


@require_safe
def robots_txt(request):
    if getattr(settings, "DEVPORTAL_ALLOW_INDEXING", False):
        body = LIVE_ROBOTS.format(origin=request_origin(request))
    else:
        body = CLOSED_ROBOTS
    return HttpResponse(body, content_type="text/plain; charset=utf-8")


@require_safe
def site_file(request, name):
    content_type = SITE_FILES[name]
    data = _site_file_cache.get(name)
    if data is None:
        data = (STATIC_DIR / name).read_bytes()
        _site_file_cache[name] = data
    response = HttpResponse(data, content_type=content_type)
    response["Cache-Control"] = "public, max-age=86400"
    return response


@require_safe
def web_manifest(request):
    import json  # noqa: PLC0415

    origin = request_origin(request)
    manifest = {
        "name": "Sefaria",
        "icons": [
            {"src": f"{origin}/icon-192.png?v={ICON_VERSION}", "sizes": "192x192", "type": "image/png"},
            {"src": f"{origin}/icon-512.png?v={ICON_VERSION}", "sizes": "512x512", "type": "image/png"},
        ],
    }
    response = HttpResponse(
        json.dumps(manifest, separators=(",", ":")), content_type="application/manifest+json; charset=utf-8"
    )
    response["Cache-Control"] = "public, max-age=86400"
    return response


def library_origin():
    domain_modules = getattr(settings, "DOMAIN_MODULES", None) or {}
    url = domain_modules.get("en", {}).get("library") or "https://www.sefaria.org"
    return url.rstrip("/")


@require_safe
def login_redirect(request):
    """302 to the library host's login. `next` is passed on only when it is a path on this host."""
    target = f"{library_origin()}/login"
    next_path = request.GET.get("next", "")
    if is_portal_path(next_path) and "\\" not in next_path and not any(ord(c) < 32 for c in next_path):
        target += "?next=" + quote(f"{request_origin(request)}{next_path}", safe="")
    return HttpResponseRedirect(target)


def doc_page(request, section, slug):
    """A hand-written page of `section` (e.g. the reference guides that devportal.views.reference
    delegates to): the same response as the fallback route gives for `/<section>/<slug>`."""
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET", "HEAD"])
    return response_for_path(request, f"/{section}/{slug}")
