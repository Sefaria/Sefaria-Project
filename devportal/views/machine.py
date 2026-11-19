"""The machine-readable surface of the developers host (PLAN.md §2.10, contract C9).

Routes (owner W8 in C9): `<page path>.md`, `Accept: text/markdown` negotiation on page paths, `/docs.md`,
`/llms.txt`, `/docs/llms.txt`, `/reference/llms.txt`, `/llms-full.txt`, `/sitemap.xml`,
`/openapi/sefaria-api.json` and the four `/.well-known/` files. `url_patterns()` lists them in the order
they must take ahead of the page routes; `negotiate_markdown(view)` wraps a page view.

Every absolute URL in these responses is on the request's host. The `.well-known` files copy
`docs/dev-portal/research/site/machine/` with that one change, plus the server card's `name`
(`org.sefaria/developers`) and the skill `digest`, recomputed from the `SKILL.md` this host serves.

Headers: the middleware adds the discovery `Link` header to text responses; a Markdown page also gets
`rel="canonical"` (via `response.devportal_canonical_url`). JSON and XML responses get the discovery
`Link` header here, as live sends it on every response.
"""

import hashlib
import json
import re
from functools import wraps

from django.http import HttpResponse
from django.urls import path, re_path
from django.utils.cache import patch_vary_headers
from django.views.decorators.http import require_safe

from devportal.models import PortalArtifact, Section
from devportal.security.headers import link_header, request_origin
from devportal.services import llms, md_export
from devportal.services.nav import SITEMAP_ORIGIN, build_sitemap
from devportal.views.pages import PortalRedirect

MARKDOWN = "text/markdown; charset=utf-8"
PLAIN = "text/plain; charset=utf-8"
JSON = "application/json; charset=utf-8"
WELL_KNOWN_CACHE = "public, max-age=300"  # as live
SERVER_CARD_NAME = "org.sefaria/developers"
PAGE_PATH = re.compile(r"^/(?P<section>docs|reference|page)/(?P<slug>[^/]+)/?$")

# --- .well-known files: research/site/machine/, host from the request ------------------------------

SKILL_MD = """---
name: read-the-docs
description: "Guide to the documentation available at {origin}. Points to an llms.txt summary with links to every doc, reference, changelog, and custom page."
---

Fetch {origin}/llms.txt for an index of every doc, API reference, changelog entry, and custom page on this site, then follow the links in it to read the pages you need.
"""  # noqa: E501 - copied byte for byte


def skill_md(origin):
    return SKILL_MD.format(origin=origin)


def agent_skills_index(origin):
    digest = hashlib.sha256(skill_md(origin).encode("utf-8")).hexdigest()
    skill = {
        "name": "read-the-docs",
        "description": (
            f"Guide to the documentation available at {origin}. Points to an llms.txt summary with links to "
            "every doc, reference, changelog, and custom page."
        ),
        "type": "skill-md",
        "url": f"{origin}/.well-known/agent-skills/read-the-docs/SKILL.md",
        "digest": f"sha256:{digest}",
    }
    return {"$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json", "skills": [skill]}


def api_catalog(origin):
    return {
        "linkset": [
            {
                "anchor": f"{origin}/reference#sefaria-api.json",
                "service-desc": [
                    {"href": f"{origin}/openapi/sefaria-api.json", "type": "application/vnd.oai.openapi+json"}
                ],
                "service-doc": [{"href": f"{origin}/reference", "type": "text/html"}],
            }
        ]
    }


def server_card(origin):
    return {
        "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        "name": SERVER_CARD_NAME,
        "version": "1.0",
        "title": "Sefaria",
        "description": "MCP server for Sefaria. Lets AI agents explore this project's API reference and documentation.",
        "remotes": [{"type": "streamable-http", "url": f"{origin}/mcp"}],
    }


def compact_json(data):
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


# --- helpers ------------------------------------------------------------------------------------


def _with_discovery_links(request, response):
    """JSON and XML responses: the middleware only adds `Link` to text responses."""
    response["Link"] = link_header(request_origin(request))
    return response


def markdown_response(request, page_path, *, vary_accept=False):
    """The Markdown version of a page path (without `.md`): 200, or live's 404 document."""
    origin = request_origin(request)
    status, text, canonical_path = md_export.markdown_for_path(page_path, origin)
    response = HttpResponse(text, status=status, content_type=MARKDOWN)
    response["Cache-Control"] = "no-cache"
    if canonical_path:
        response.devportal_canonical_url = f"{origin}{canonical_path}"
    if vary_accept:
        patch_vary_headers(response, ("Accept",))
    return response


def _accept_entries(header):
    for item in (header or "").split(","):
        parts = [p.strip() for p in item.split(";")]
        media = parts[0].lower()
        if not media:
            continue
        q = 1.0
        for param in parts[1:]:
            if param.lower().startswith("q="):
                try:
                    q = float(param[2:])
                except ValueError:
                    q = 0.0
        yield media, q


def prefers_markdown(accept):
    """True when `Accept` names text/markdown with a higher quality than it gives text/html.

    Wildcards count for HTML (`text/*`, `*/*`) but never select Markdown; a tie is HTML.
    """
    entries = list(_accept_entries(accept))
    markdown = max((q for media, q in entries if media == "text/markdown"), default=0.0)
    if markdown <= 0:
        return False
    html = max((q for media, q in entries if media == "text/html"), default=None)
    if html is None:
        html = max((q for media, q in entries if media in ("text/*", "*/*")), default=0.0)
    return markdown > html


def negotiate_markdown(view):
    """Wrap a page view: serve Markdown when `Accept` prefers it, and add `Vary: Accept` either way.

    `/` answers 302 to `/llms.txt` (as live). A page path answers its Markdown (200, or 404 for an
    unknown page). Other paths fall through to the view. An HTML page response that has no
    `devportal_markdown_path` gets its `.md` path, so the middleware sends the `alternate` link.
    """

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if request.method in ("GET", "HEAD") and prefers_markdown(request.META.get("HTTP_ACCEPT")):
            if request.path == "/":
                response = PortalRedirect(f"{request_origin(request)}/llms.txt", 302)
                patch_vary_headers(response, ("Accept",))
                return response
            if PAGE_PATH.match(request.path):
                return markdown_response(request, request.path, vary_accept=True)
        response = view(request, *args, **kwargs)
        patch_vary_headers(response, ("Accept",))
        if (
            PAGE_PATH.match(request.path)
            and getattr(response, "devportal_markdown_path", None) is None
            and (response.get("Content-Type") or "").startswith("text/html")
            and response.status_code in (200, 404)
        ):
            response.devportal_markdown_path = request.path.rstrip("/") + ".md"
        return response

    return wrapper


def _artifact(name, build):
    artifact = PortalArtifact.objects.filter(name=name).only("content").first()
    return artifact.content if artifact is not None else build()


# --- views --------------------------------------------------------------------------------------


@require_safe
def page_markdown(request, section, slug):
    """`<page path>.md`. Hidden pages answer too (I-6)."""
    return markdown_response(request, f"/{section}/{slug}")


@require_safe
def docs_md_redirect(request):
    return PortalRedirect("/docs/llms.txt", 302)


def _llms(request, name):
    content = _artifact(name, llms.BUILDERS[name])
    return HttpResponse(llms.with_origin(content, request_origin(request)), content_type=PLAIN)


@require_safe
def llms_txt(request):
    return _llms(request, llms.ARTIFACTS["all"])


@require_safe
def docs_llms_txt(request):
    return _llms(request, llms.ARTIFACTS[Section.DOCS])


@require_safe
def reference_llms_txt(request):
    return _llms(request, llms.ARTIFACTS[Section.REFERENCE])


@require_safe
def llms_full_txt(request):
    return _llms(request, llms.ARTIFACTS["full"])


@require_safe
def sitemap_xml(request):
    content = _artifact("sitemap.xml", build_sitemap)
    response = HttpResponse(content.replace(SITEMAP_ORIGIN, request_origin(request)), content_type="application/xml")
    return _with_discovery_links(request, response)


@require_safe
def openapi_json(request):
    from devportal.spec import DEFAULT_SPEC_PATH  # noqa: PLC0415

    response = HttpResponse(DEFAULT_SPEC_PATH.read_bytes(), content_type=JSON)
    return _with_discovery_links(request, response)


def _well_known(request, body, content_type):
    response = HttpResponse(body, content_type=content_type)
    response["Cache-Control"] = WELL_KNOWN_CACHE
    if not content_type.startswith("text/"):
        _with_discovery_links(request, response)
    return response


@require_safe
def well_known_api_catalog(request):
    body = compact_json(api_catalog(request_origin(request)))
    return _well_known(request, body, "application/linkset+json; charset=utf-8")


@require_safe
def well_known_agent_skills(request):
    return _well_known(request, compact_json(agent_skills_index(request_origin(request))), JSON)


@require_safe
def well_known_skill_md(request):
    return _well_known(request, skill_md(request_origin(request)), MARKDOWN)


@require_safe
def well_known_server_card(request):
    return _well_known(request, compact_json(server_card(request_origin(request))), JSON)


def url_patterns():
    """The routes of this module, in C9 order. They go ahead of every page route of devportal.urls."""
    return [
        path("docs.md", docs_md_redirect, name="docs_md"),
        path("llms.txt", llms_txt, name="llms"),
        path("llms-full.txt", llms_full_txt, name="llms_full"),
        path("docs/llms.txt", docs_llms_txt, name="docs_llms"),
        path("reference/llms.txt", reference_llms_txt, name="reference_llms"),
        re_path(r"^(?P<section>docs|reference|page)/(?P<slug>[^/]+)\.md$", page_markdown, name="page_markdown"),
        path("sitemap.xml", sitemap_xml, name="sitemap"),
        path("openapi/sefaria-api.json", openapi_json, name="openapi"),
        path(".well-known/api-catalog", well_known_api_catalog, name="wk_api_catalog"),
        path(".well-known/agent-skills/index.json", well_known_agent_skills, name="wk_agent_skills"),
        path(".well-known/agent-skills/read-the-docs/SKILL.md", well_known_skill_md, name="wk_agent_skill"),
        path(".well-known/mcp/server-card.json", well_known_server_card, name="wk_mcp_server_card"),
    ]
