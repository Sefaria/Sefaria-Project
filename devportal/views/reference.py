"""The API reference views (PLAN.md §2.4, §2.5, §2.7; contract C9 routes reference-root and reference-page).

- ``/reference`` answers 301 to ``/reference/getting-started``.
- ``/reference/<slug>`` of a tag group answers 302 to its first visible child.
- ``/reference/<slug>`` of an endpoint renders ``devportal/page_endpoint.html`` with the endpoint page
  payload (C3 ``endpointPayload``) in the ``#dp-data`` island: the spec (``devportal.spec``) merged with the
  overlay of the page's published revision.
- Any other kind of reference page (hand-written guides) is a Markdown page, served by the docs-page view
  of ``devportal.views.pages`` when it is installed.

The page shell (``meta``, ``header``, ``site``, ``nav``, ``pager``) comes from ``default_shell``, with the site
settings, the reference sidebar tree and the prev/next links of ``devportal.views.pages``. The HTML page is
``pages.render_page`` (base.html with the CSP nonce) around ``devportal/page_endpoint.html``.
"""

from __future__ import annotations

import html
import importlib
import logging
import re
from dataclasses import dataclass
from typing import Any

from django.http import Http404, HttpResponse, HttpResponsePermanentRedirect, HttpResponseRedirect
from django.views.decorators.http import require_safe

from devportal.models import Page, PageKind, PortalState, Section
from devportal.spec import MergedOperation, Overlay, load_spec, merge

from . import pages

logger = logging.getLogger("devportal")

CONTRACT_VERSION = 1
REFERENCE_ROOT_TARGET = "/reference/getting-started"
SPEC_FILE_URL = "/static/bundles/devportal/spec/{operation_id}.json"


# -- lookups -------------------------------------------------------------------------------------------


def _live(qs):
    return qs.filter(deleted_at__isnull=True, published_revision__isnull=False)


def get_reference_page(slug: str) -> Page | None:
    """The published, not deleted, reference page with ``slug`` (any kind but category), or None."""
    return (
        _live(Page.objects.filter(section=Section.REFERENCE, slug=slug))
        .exclude(kind=PageKind.CATEGORY)
        .select_related("published_revision")
        .first()
    )


def _visible_children(page: Page):
    return (
        _live(page.children.all())
        .filter(published_revision__hidden=False)
        .select_related("published_revision")
        .order_by("position", "id")
    )


def first_visible_child_path(group: Page, _depth: int = 0) -> str | None:
    """Path of the first visible page under a tag group, depth first; categories and links are skipped."""
    if _depth > Page.MAX_DEPTH:
        return None
    for child in _visible_children(group):
        if child.kind in (PageKind.ENDPOINT, PageKind.PAGE):
            return child.url_path
        if child.kind == PageKind.TAG_GROUP:
            target = first_visible_child_path(child, _depth + 1)
            if target:
                return target
    return None


def published_overlays() -> dict[str, Overlay]:
    """``{operationId: Overlay}`` of every published endpoint page: the overlay loader of
    ``devportal.spec.mcp_provider.SpecEndpointProvider``."""
    pages = _live(Page.objects.filter(kind=PageKind.ENDPOINT, operation_id__isnull=False)).select_related(
        "published_revision"
    )
    return {p.operation_id: Overlay.from_revision(p.published_revision) for p in pages}


# -- Markdown --------------------------------------------------------------------------------------------


def render_markdown(source: str, *, revision_key: str) -> str:
    """Sanitized HTML for ``source`` from ``devportal.markdown`` (contract C4).

    Until that package is installed, a plain escaped fallback keeps the page usable.
    """
    if not source.strip():
        return ""
    try:
        markdown = importlib.import_module("devportal.markdown")
    except ModuleNotFoundError as exc:
        if exc.name != "devportal.markdown":
            raise
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", source) if p.strip()]
        return "".join(f'<p dir="auto">{html.escape(p)}</p>' for p in paragraphs)
    return markdown.render(source, revision=revision_key).html


def plain_text(source: str, limit: int = 300) -> str:
    """A short plain-text version of Markdown for ``<meta name="description">``."""
    try:
        text = importlib.import_module("devportal.markdown").extract_text(source)
    except (ModuleNotFoundError, AttributeError):
        text = re.sub(r"[`*_#>\[\]]|\(https?://[^)]*\)", "", source)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# -- the payload -----------------------------------------------------------------------------------------


@dataclass(frozen=True)
class EndpointView:
    page: Page
    merged: MergedOperation
    description_html: str
    body_html: str
    spec_sha: str


def endpoint_view(page: Page) -> EndpointView | None:
    """The merged spec and overlay of an endpoint page, or None when its operation left the spec."""
    spec = load_spec()
    op = spec.operation(page.operation_id or "")
    if op is None:
        return None
    revision = page.published_revision
    merged = merge(op, Overlay.from_revision(revision))
    key = str(revision.pk) if revision is not None else "0"
    return EndpointView(
        page=page,
        merged=merged,
        description_html=render_markdown(merged.description_md, revision_key=key),
        body_html=render_markdown(merged.body_md, revision_key=key),
        spec_sha=spec.sha,
    )


def _iso(dt) -> str | None:
    if dt is None:
        return None
    return dt.isoformat().replace("+00:00", "Z")


def _origin(request) -> str:
    if request is None:
        return "https://developers.sefaria.org"
    return f"{request.scheme}://{request.get_host()}"


def default_shell(request, page: Page, *, description: str) -> dict[str, Any]:
    """``meta``, ``header``, ``site``, ``nav`` and ``pager`` of a reference page (C3 ``page-payload``)."""
    state = PortalState.objects.filter(pk=PortalState.SINGLETON_ID).first() or PortalState()  # no write on GET
    origin = _origin(request)
    revision = page.published_revision
    metadata = (revision.metadata if revision is not None else None) or {}
    robots = metadata.get("robots") if metadata.get("robots") in ("index", "noindex") else "index"
    canonical = f"{origin}{page.url_path}"
    nav = pages.section_nav(Section.REFERENCE, state.generation)
    return {
        "meta": {
            "description": metadata.get("description") or description,
            "robots": robots,
            "canonicalUrl": canonical,
            "markdownUrl": f"{canonical}.md",
        },
        "header": {"activeTab": "reference"},
        "site": pages.site_config(origin, state.generation),
        "nav": nav,
        "pager": pages.pager_for(nav["tree"], page.url_path, pages.has_next_pages(revision)),
    }


def endpoint_payload(view: EndpointView, *, request=None, shell: dict[str, Any] | None = None) -> dict[str, Any]:
    """The C3 ``endpointPayload`` of an endpoint page."""
    page, merged = view.page, view.merged
    op = merged.operation
    shell = shell or default_shell(request, page, description=plain_text(merged.description_md or merged.title))
    return {
        "contractVersion": CONTRACT_VERSION,
        "path": page.url_path,
        "title": merged.title,
        "meta": shell["meta"],
        "header": shell["header"],
        "site": shell["site"],
        "kind": "endpoint",
        "section": "reference",
        "slug": page.slug,
        "pageId": page.pk,
        "operation": {
            "operationId": op.operation_id,
            "method": op.method,
            "path": op.path,
            "tags": list(op.tags),
            "deprecated": merged.deprecated,
            "specUrl": SPEC_FILE_URL.format(operation_id=op.operation_id),
            "specSha": view.spec_sha,
        },
        "page": {
            "title": merged.title,
            "sidebarLabel": merged.sidebar_label,
            "descriptionHtml": view.description_html,
            "bodyHtml": view.body_html,
            "updatedAt": _iso(page.content_updated_at),
            "specUpdatedAt": _iso(page.spec_updated_at),
        },
        "nav": shell["nav"],
        "pager": shell["pager"],
    }


def redirect_payload(path: str, status: int, location: str) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "path": path,
        "kind": "redirect",
        "status": status,
        "location": location,
    }


def reference_payload(slug: str | None, *, request=None) -> dict[str, Any] | None:
    """The payload for ``/reference`` (slug None) or ``/reference/<slug>`` when this module owns it:
    a redirect or an endpoint. None for other pages (the docs-page payload) and for unknown slugs.
    For ``/_portal/page.json``."""
    if slug is None:
        return redirect_payload("/reference", 301, REFERENCE_ROOT_TARGET)
    page = get_reference_page(slug)
    if page is None:
        return None
    if page.kind == PageKind.TAG_GROUP:
        target = first_visible_child_path(page)
        return redirect_payload(page.url_path, 302, target) if target else None
    if page.kind == PageKind.ENDPOINT:
        view = endpoint_view(page)
        return endpoint_payload(view, request=request) if view else None
    return None


# -- rendering -------------------------------------------------------------------------------------------


def render_endpoint(request, view: EndpointView) -> HttpResponse:
    """The endpoint page: base.html around page_endpoint.html (the sidebar and the prerendered article)."""
    payload = endpoint_payload(view, request=request)
    return pages.render_page(payload, pages.nonce_for(request), _origin(request))


def _delegate_to_doc_page(request, slug: str):
    try:
        pages = importlib.import_module("devportal.views.pages")
    except ModuleNotFoundError:
        raise Http404(f"/reference/{slug}") from None
    view = getattr(pages, "reference_doc_page", None) or getattr(pages, "doc_page", None)
    if view is None:
        raise Http404(f"/reference/{slug}")
    return view(request, section=Section.REFERENCE, slug=slug)


@require_safe
def reference_root(request):
    """``/reference`` (C9 reference-root)."""
    return HttpResponsePermanentRedirect(REFERENCE_ROOT_TARGET)


@require_safe
def reference_page(request, slug: str):
    """``/reference/<slug>`` (C9 reference-page)."""
    page = get_reference_page(slug)
    if page is None:
        raise Http404(f"/reference/{slug}")
    if page.kind == PageKind.TAG_GROUP:
        target = first_visible_child_path(page)
        if not target:
            raise Http404(f"/reference/{slug}")
        return HttpResponseRedirect(target)
    if page.kind == PageKind.ENDPOINT:
        view = endpoint_view(page)
        if view is None:  # the operation left the spec; devportal_sync_spec hides such pages
            raise Http404(f"/reference/{slug}")
        return render_endpoint(request, view)
    return _delegate_to_doc_page(request, slug)
