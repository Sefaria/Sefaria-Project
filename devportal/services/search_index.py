"""The search documents (PLAN.md §2.9, contract C3 ``search-documents.schema.json``).

Built at publish time: one document per visible page and one per OpenAPI operation, stored as a
``PortalArtifact`` and served at ``/_portal/search-docs.<sha>.json``. The browser builds a MiniSearch
index from that file the first time the search modal opens (``devportal-ui/src/search/``).

The core, ``build_search_documents``, is pure: it takes page/revision pairs, the parsed spec and the
endpoint overlays, and imports no Django. ``build_artifact`` and ``current_search_docs`` read the
database and import the models lazily, so this module also imports cleanly without Django.

Visibility (I-6): a page is searchable when it is not soft-deleted, has a published revision, is
not hidden, and no ancestor is hidden, deleted or unpublished (the same rule as the sidebar).
Only ``page`` and ``endpoint`` rows produce documents; categories, links, tag groups and the
``api_config`` stubs have no body of their own.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping
from functools import lru_cache
from typing import Any

from devportal.markdown import render
from devportal.spec import Overlay, Spec, merge

CONTRACT_VERSION = 1

# The registry key of the artifact (devportal/services/publish.py). Its content carries the
# documents' ``sha``, which names the served file (``artifact_name``).
SEARCH_DOCS_ARTIFACT = "search-docs"
URL_PREFIX = "/_portal/"

SECTION_ORDER = ("docs", "reference", "page")
SEARCHABLE_PAGE_KINDS = ("page",)
ENDPOINT_KIND = "endpoint"

EXCERPT_LIMIT = 300
BODY_LIMIT = 20_000  # characters of plain text per document; keeps the file small
MAX_RESPONSE_FIELDS = 40  # schema field descriptions kept per response status
MAX_SCHEMA_DEPTH = 4

_WS = re.compile(r"\s+")
_MARKDOWN_HINT = re.compile(r"[`*_\[\]<>#|!\\]|^\s*[-+]\s|^\s*\d+\.\s", re.MULTILINE)
_SHA_RE = re.compile(r"^[0-9a-f]{7,64}$")


# --- names -----------------------------------------------------------------------------------


def artifact_name(sha: str) -> str:
    """The served file name of the search documents with ``sha``: ``search-docs.<sha>.json``."""
    return f"search-docs.{sha}.json"


def artifact_url(sha: str) -> str:
    """``/_portal/search-docs.<sha>.json`` (C9 ``portal-search-docs``; ``SiteConfig.searchDocsUrl``)."""
    return URL_PREFIX + artifact_name(sha)


def documents_sha(documents: list[dict[str, Any]]) -> str:
    """A content hash of the documents (16 hex digits): it changes exactly when the documents do."""
    canonical = json.dumps(documents, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


# --- text helpers ----------------------------------------------------------------------------


def _collapse(text: str) -> str:
    return _WS.sub(" ", text or "").strip()


@lru_cache(maxsize=8192)
def markdown_text(source: str) -> str:
    """Plain text of a Markdown fragment (C4 renderer, then ``extract_text``), lines kept."""
    if not source or not source.strip():
        return ""
    if not _MARKDOWN_HINT.search(source):
        return "\n".join(line for line in (_collapse(p) for p in source.splitlines()) if line)
    return render(source).text


def _one_line(source: str) -> str:
    return _collapse(markdown_text(source))


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space > limit // 2:
        cut = cut[:space]
    return cut.rstrip(" ,.;:") + "…"


def _attr(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(name, default)
    return getattr(obj, name, default)


# --- pages -----------------------------------------------------------------------------------


def _page_path(page: Any) -> str | None:
    path = _attr(page, "url_path")
    if path:
        return path
    section, slug = _attr(page, "section"), _attr(page, "slug")
    if not section or not slug or _attr(page, "kind") == "category":
        return None
    return f"/{section}/{slug}"


def _self_visible(page: Any, revision: Any) -> bool:
    return _attr(page, "deleted_at") is None and revision is not None and not bool(_attr(revision, "hidden", False))


def visible_page_ids(pairs: list[tuple[Any, Any]]) -> set[Any]:
    """Ids of the pages that are visible (I-6): neither the page nor a known ancestor is hidden."""
    by_id = {_attr(page, "id"): (page, revision) for page, revision in pairs}
    memo: dict[Any, bool] = {}

    def visible(page_id: Any, depth: int = 0) -> bool:
        if page_id in memo:
            return memo[page_id]
        page, revision = by_id[page_id]
        result = _self_visible(page, revision)
        parent_id = _attr(page, "parent_id")
        if result and parent_id is not None and parent_id in by_id and depth < 16:
            result = visible(parent_id, depth + 1)
        memo[page_id] = result
        return result

    return {page_id for page_id in by_id if visible(page_id)}


def _rendered(revision: Any) -> tuple[str, list[str]]:
    """Plain text and headings of a revision's body, from the publish cache when it is filled."""
    cached_text = _attr(revision, "search_text", "") or ""
    cached_toc = _attr(revision, "rendered_toc", None)
    body_md = _attr(revision, "body_md", "") or ""
    if _attr(revision, "renderer_version", "") and (cached_text or not body_md.strip()):
        toc = cached_toc or []
        return cached_text, [_collapse(_attr(entry, "text", "")) for entry in toc if _attr(entry, "text", "")]
    if not body_md.strip():
        return "", []
    result = render(body_md)
    return result.text, [_collapse(entry.get("text", "")) for entry in result.toc if entry.get("text")]


def page_document(page: Any, revision: Any) -> dict[str, Any]:
    """The search document of one page (``kind`` ``page``)."""
    body, headings = _rendered(revision)
    return {
        "id": f"page:{_attr(page, 'id')}",
        "section": _attr(page, "section"),
        "kind": "page",
        "title": _collapse(_attr(revision, "title", "")) or _attr(page, "slug"),
        "path": _page_path(page),
        "method": None,
        "excerpt": _truncate(_one_line(_attr(revision, "excerpt", "") or ""), EXCERPT_LIMIT),
        "headings": [h for h in headings if h],
        "body": _truncate(body, BODY_LIMIT),
        "params": [],
        "responses": [],
    }


# --- operations ------------------------------------------------------------------------------


def _deref(spec: Spec, node: Any) -> Any:
    try:
        return spec.dereference(node)
    except Exception:  # noqa: BLE001 - a broken $ref must not stop the whole build
        return node


def _schema_fields(spec: Spec, schema: Any, prefix: str = "", depth: int = 0, seen: set[int] | None = None):
    """``(name, description)`` of the described properties of a schema, depth first."""
    if not isinstance(schema, Mapping) or depth > MAX_SCHEMA_DEPTH:
        return
    seen = seen if seen is not None else set()
    if id(schema) in seen:
        return
    seen.add(id(schema))
    for key in ("allOf", "oneOf", "anyOf"):
        for part in schema.get(key) or ():
            yield from _schema_fields(spec, part, prefix, depth, seen)
    items = schema.get("items")
    if isinstance(items, Mapping):
        yield from _schema_fields(spec, items, prefix, depth + 1, seen)
    properties = schema.get("properties")
    if isinstance(properties, Mapping):
        for name, prop in properties.items():
            if not isinstance(prop, Mapping):
                continue
            full = f"{prefix}{name}"
            yield full, prop.get("description") or ""
            yield from _schema_fields(spec, prop, f"{full}.", depth + 1, seen)


def _resolve(spec: Spec, node: Any, depth: int = 0) -> Any:
    """``node`` with a top-level local ``$ref`` followed (not the whole tree, unlike ``_deref``)."""
    while isinstance(node, Mapping) and isinstance(node.get("$ref"), str) and depth < 8:
        target = spec.resolve_pointer(node["$ref"])
        if target is None:
            break
        node, depth = target, depth + 1
    return node


def _json_schema(spec: Spec, holder: Any) -> Any:
    """The JSON (or first) media type's schema of a request body or response."""
    holder = _resolve(spec, holder)
    content = holder.get("content") if isinstance(holder, Mapping) else None
    if not isinstance(content, Mapping) or not content:
        return None
    media = content.get("application/json") or next(iter(content.values()))
    return _deref(spec, media.get("schema")) if isinstance(media, Mapping) else None


def _operation_params(spec: Spec, operation: Any) -> list[dict[str, str]]:
    params: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in operation.parameters:
        param = _resolve(spec, raw)
        if not isinstance(param, Mapping) or not param.get("name"):
            continue
        name = str(param["name"])
        if name in seen:
            continue
        seen.add(name)
        schema = _resolve(spec, param.get("schema")) or {}
        description = param.get("description") or _attr(schema, "description", "") or ""
        params.append({"name": name, "description": _one_line(description)})
    if operation.request_body:
        schema = _json_schema(spec, operation.request_body)
        for name, description in _schema_fields(spec, schema):
            if name in seen:
                continue
            seen.add(name)
            params.append({"name": name, "description": _one_line(description)})
    return params


def _operation_responses(spec: Spec, operation: Any) -> list[dict[str, str]]:
    responses: list[dict[str, str]] = []
    for status, raw in (operation.responses or {}).items():
        response = _resolve(spec, raw)
        if not isinstance(response, Mapping):
            continue
        status = str(status)
        texts: list[str] = []
        own = _one_line(response.get("description") or "")
        if own:
            texts.append(own)
        for _name, description in _schema_fields(spec, _json_schema(spec, response)):
            text = _one_line(description)
            if text and text not in texts:
                texts.append(text)
            if len(texts) > MAX_RESPONSE_FIELDS:
                break
        if not texts:
            texts.append("")
        responses.extend({"status": status, "description": text} for text in texts)
    return responses


def operation_document(spec: Spec, operation: Any, overlay: Overlay | None, path: str) -> dict[str, Any]:
    """The search document of one operation (``kind`` ``endpoint``), with the overlay applied."""
    merged = merge(operation, overlay)
    description = markdown_text(merged.description_md)
    extra = markdown_text(merged.body_md)
    headings = [_collapse(e.get("text", "")) for e in render(merged.body_md).toc] if merged.body_md.strip() else []
    body = "\n".join(part for part in (operation.path, description, extra) if part)
    return {
        "id": f"op:{operation.operation_id}",
        "section": "reference",
        "kind": "endpoint",
        "title": _collapse(merged.title) or operation.operation_id,
        "path": path,
        "method": operation.method,
        "excerpt": _truncate(_collapse(description), EXCERPT_LIMIT),
        "headings": [h for h in headings if h],
        "body": _truncate(body, BODY_LIMIT),
        "params": _operation_params(spec, operation),
        "responses": _operation_responses(spec, operation),
    }


# --- the builder -----------------------------------------------------------------------------


def build_search_documents(
    pages_with_revisions: Iterable[tuple[Any, Any]],
    spec: Spec,
    overlays: Mapping[str, Overlay] | None = None,
    *,
    include_unpaged_operations: bool = True,
) -> list[dict[str, Any]]:
    """Every search document: visible pages (docs, then reference, then custom pages), then operations.

    ``pages_with_revisions``: ``(page, published_revision)`` pairs, ideally for every page row
    (deleted and unpublished ones included, so that a hidden or deleted ancestor hides its
    subtree). Pages and revisions may be model instances or mappings with the same names.
    ``overlays``: ``{operationId: Overlay}`` (``devportal.views.reference.published_overlays``);
    when an operation has none, the overlay is read from its endpoint page's revision.
    An operation whose endpoint page is hidden, or under a hidden ancestor, is left out. One with
    no page row at all is kept at ``/reference/<operationId>`` unless ``include_unpaged_operations``
    is false.
    """
    pairs = list(pages_with_revisions)
    visible = visible_page_ids(pairs)
    overlays = overlays or {}

    page_docs: list[tuple[int, int, dict[str, Any]]] = []
    endpoint_pages: dict[str, tuple[Any, Any, bool]] = {}
    for index, (page, revision) in enumerate(pairs):
        kind = _attr(page, "kind")
        page_id = _attr(page, "id")
        if kind == ENDPOINT_KIND:
            operation_id = _attr(page, "operation_id")
            if operation_id and _attr(page, "deleted_at") is None:
                endpoint_pages[operation_id] = (page, revision, page_id in visible)
            continue
        if kind not in SEARCHABLE_PAGE_KINDS or page_id not in visible or not _page_path(page):
            continue
        section = _attr(page, "section")
        order = SECTION_ORDER.index(section) if section in SECTION_ORDER else len(SECTION_ORDER)
        page_docs.append((order, index, page_document(page, revision)))
    page_docs.sort(key=lambda item: (item[0], item[1]))

    op_docs: list[dict[str, Any]] = []
    for operation in spec.operations():
        entry = endpoint_pages.get(operation.operation_id)
        if entry is None:
            if not include_unpaged_operations:
                continue
            path, overlay = f"/reference/{operation.operation_id}", overlays.get(operation.operation_id)
        else:
            page, revision, is_visible = entry
            if not is_visible:
                continue
            path = _page_path(page) or f"/reference/{operation.operation_id}"
            overlay = overlays.get(operation.operation_id) or Overlay.from_revision(revision)
        op_docs.append(operation_document(spec, operation, overlay, path))

    reference_at = next((i for i, (order, _, _) in enumerate(page_docs) if order > 1), len(page_docs))
    ordered = (
        [doc for _, _, doc in page_docs[:reference_at]] + op_docs + [doc for _, _, doc in page_docs[reference_at:]]
    )
    return ordered


def search_documents_payload(documents: list[dict[str, Any]], generation: int) -> dict[str, Any]:
    """The whole file (C3 ``SearchDocuments``)."""
    return {
        "contractVersion": CONTRACT_VERSION,
        "sha": documents_sha(documents),
        "generation": int(generation),
        "documents": documents,
    }


# --- database --------------------------------------------------------------------------------


def _all_pages_with_revisions() -> list[tuple[Any, Any]]:
    from devportal.models import Page

    pages = Page.objects.select_related("published_revision").order_by("section", "parent_id", "position", "id")
    return [(page, page.published_revision) for page in pages]


def _tree_order(pairs: list[tuple[Any, Any]]) -> list[tuple[Any, Any]]:
    """Depth-first sidebar order (position, then id), so documents follow the navigation."""
    children: dict[Any, list[tuple[Any, Any]]] = {}
    for pair in pairs:
        children.setdefault(pair[0].parent_id, []).append(pair)
    for siblings in children.values():
        siblings.sort(key=lambda pair: (pair[0].position, pair[0].id))
    out: list[tuple[Any, Any]] = []

    def walk(parent_id: Any, depth: int) -> None:
        for pair in children.get(parent_id, ()):
            out.append(pair)
            if depth < 16:
                walk(pair[0].id, depth + 1)

    walk(None, 0)
    listed = {id(pair[0]) for pair in out}
    out.extend(pair for pair in pairs if id(pair[0]) not in listed)  # orphans (a parent missing)
    return out


def build_from_database(generation: int | None = None, spec: Spec | None = None) -> dict[str, Any]:
    """The search documents file for the current database and ``docs/openAPI.json``."""
    from devportal.models import PortalState
    from devportal.spec import load_spec

    spec = spec or load_spec()
    pairs = _tree_order(_all_pages_with_revisions())
    overlays = {
        page.operation_id: Overlay.from_revision(revision)
        for page, revision in pairs
        if page.kind == ENDPOINT_KIND and page.operation_id and revision is not None and page.deleted_at is None
    }
    documents = build_search_documents(pairs, spec, overlays)
    if generation is None:
        generation = PortalState.load().generation
    return search_documents_payload(documents, generation)


def build_artifact(context: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Artifact builder for ``devportal.services.publish`` (``fn(context) -> dict``)."""
    return build_from_database((context or {}).get("generation"))


def current_search_docs() -> tuple[str, str] | None:
    """``(sha, json)`` of the stored search documents, or None before the first build.

    For the ``/_portal/search-docs.<sha>.json`` view (a stale ``<sha>`` is a 404) and for
    ``SiteConfig.searchDocsUrl`` (``artifact_url(sha)``).
    """
    from devportal.models import PortalArtifact

    artifact = PortalArtifact.objects.filter(name=SEARCH_DOCS_ARTIFACT).only("content").first()
    if artifact is None or not artifact.content:
        return None
    try:
        sha = json.loads(artifact.content).get("sha", "")
    except (ValueError, AttributeError):
        return None
    if not isinstance(sha, str) or not _SHA_RE.match(sha):
        return None
    return sha, artifact.content


def _register() -> None:
    """Register ``build_artifact`` with the publish pipeline's registry, when both are available."""
    try:
        from django.conf import settings

        if not settings.configured:
            return
        from devportal.services import publish
    except Exception:  # noqa: BLE001 - no Django, apps not ready, or no registry on this branch
        return
    register = getattr(publish, "register_artifact_builder", None)
    if register is not None:
        register(SEARCH_DOCS_ARTIFACT)(build_artifact)


_register()
