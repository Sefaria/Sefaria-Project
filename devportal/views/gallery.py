"""The "Powered by Sefaria" gallery on the developers host (PLAN.md §2.14; contract C9 gallery, gallery-project,
gallery-charts).

Django serves each gallery URL with its real status code and a server-rendered copy of the content, so search
engines and visitors without JavaScript see the real projects. The gallery's React app (devportal-ui/src/gallery)
then replaces the markup, reading the same data from ``GET /api/powered-by`` and the ``#dp-data`` island
(contract C3 ``galleryPayload``).

- ``/powered-by``: the published projects, the same rows ``GET /api/powered-by`` sends an anonymous visitor.
- ``/powered-by/projects/<id>-<name>``: one project. Only the id is used for lookup; a slug whose name part is
  not the canonical one answers 301 to the canonical slug, an unknown or unpublished id answers 404.
- ``/powered-by/charts``: unlisted, ``noindex``.

Projects come from ``powered_by.models.Project`` when the ``powered_by`` app is installed. The standalone dev
server (``devportal/dev/settings_standalone.py``) does not install it, and answers ``/api/powered-by`` from the
gallery's API snapshot (``DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE``); these views read the same file there.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.apps import apps
from django.conf import settings
from django.http import HttpResponse, HttpResponsePermanentRedirect
from django.template import engines
from django.template.exceptions import TemplateDoesNotExist
from django.template.loader import get_template, render_to_string
from django.views.decorators.http import require_safe

logger = logging.getLogger("devportal")

CONTRACT_VERSION = 1
GALLERY_BASE = "/powered-by"
API_PATH = "/api/powered-by"
BASE_TEMPLATE = "devportal/base.html"
LIST_TEMPLATE = "devportal/gallery_list.html"
PROJECT_TEMPLATE = "devportal/gallery_project.html"
# devportal-ui/public/gallery/og-image.png, served under the bundle's base (vite.config.ts `base`).
OG_IMAGE_PATH = "/static/bundles/devportal/gallery/og-image.png"

SITE_NAME = "Powered by Sefaria"
INDEX_TITLE = "Powered by Sefaria: projects built on the open Jewish library"
INDEX_DESCRIPTION = (
    "Sefaria is the hub for Torah innovation. Explore the apps, study tools, AI assistants, and research people "
    "have built with Sefaria's free texts, API, and data."
)
SOCIAL_DESCRIPTION = (
    "Explore the apps, study tools, AI assistants, and research people have built with Sefaria's free texts, "
    "API, and data."
)
CHARTS_TITLE = "Powered by Sefaria in numbers"
NOT_FOUND_TITLE = "Project not found · Powered by Sefaria"
PAGE_NOT_FOUND_TITLE = "Page not found | Powered by Sefaria"

# Used only while the shell's base template does not exist yet (it belongs to the shell workstream).
_FALLBACK_BASE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{% block title %}{% endblock %}</title>{% block head %}{% endblock %}</head>
<body><main id="dp-root">{% block content %}{% endblock %}</main>{% block data %}{% endblock %}</body></html>
"""


# -- slugs (devportal-ui/src/gallery/lib/slug.ts) --------------------------------------------------------

_SLUG = re.compile(r"([0-9]+)(?:-(.*))?")  # ASCII digits, as the JavaScript \d


def slugify(name: str) -> str:
    """Lowercase ASCII words joined by "-". Accents are folded; anything else is dropped. As ``slug.ts``."""
    text = unicodedata.normalize("NFKD", name)
    text = re.sub(r"[̀-ͯ]", "", text)
    text = re.sub(r"['’]", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return text.strip("-")


def project_slug(project_id: int, name: str) -> str:
    """``141-torah-mcp``; the bare id when the name has no ASCII letters or digits."""
    text = slugify(name)
    return f"{project_id}-{text}" if text else str(project_id)


def project_path(project_id: int, name: str) -> str:
    return f"{GALLERY_BASE}/projects/{project_slug(project_id, name)}"


def parse_slug(slug: str) -> int | None:
    """The id at the start of a slug, or None when the slug does not start with a positive integer."""
    match = _SLUG.fullmatch(slug or "")
    if not match:
        return None
    project_id = int(match.group(1))
    return project_id if 0 < project_id <= 2**53 - 1 else None


# -- data ------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class GalleryProject:
    """The fields the server-rendered pages show, from one ``GET /api/powered-by`` row."""

    id: int
    name: str
    description: str
    backstory: str
    url: str | None
    source_url: str | None
    category: str
    is_buggy: bool

    @property
    def path(self) -> str:
        return project_path(self.id, self.name)

    @property
    def slug(self) -> str:
        return project_slug(self.id, self.name)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> GalleryProject:
        return cls(
            id=int(row["id"]),
            name=str(row.get("project_name") or "").strip(),
            description=str(row.get("project_desc") or "").strip(),
            backstory=str(row.get("project_why") or "").strip(),
            url=_safe_url(row.get("project_link")),
            source_url=_safe_url(row.get("project_source_code")),
            category=str(row.get("project_category") or "").strip(),
            is_buggy=bool(row.get("is_buggy")),
        )


def _safe_url(value: Any) -> str | None:
    """http(s) URLs only, as the gallery's ``safeUrl``."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if re.match(r"^https?://[^\s/]+", value, re.IGNORECASE) else None


def _model_rows() -> list[dict[str, Any]]:
    """Published rows from ``powered_by``: the queryset ``powered_by.views.powered_by_api`` serves a non-staff
    visitor (kept in step with it; that module imports ``sefaria.settings`` and cannot be imported here)."""
    from django.db.models import Exists, OuterRef, Q

    from powered_by.models import ApiProject, Project, SubmissionSource

    live_api_projects = ApiProject.objects.filter(profile=OuterRef("pk"), deleted_at__isnull=True)
    queryset = (
        Project.objects.filter(is_published=True, request_not_to_publish=False, deleted_at__isnull=True)
        .filter(~Exists(live_api_projects.filter(tier_id__in=("internal", "mcp"))))
        .filter(~Q(submission_source=SubmissionSource.DEVELOPER_SETTINGS) | Exists(live_api_projects))
    )
    return [project.contents(authenticated=False) for project in queryset]


def _fixture_rows() -> list[dict[str, Any]]:
    """Published rows of the standalone server's API snapshot (``devportal/dev/urls_standalone.py``)."""
    path = getattr(settings, "DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE", "")
    if not path:
        return []
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("Powered-by fixture %s not found; the gallery lists no projects", path)
        return []
    rows = data.get("projects") if isinstance(data, dict) else None
    return [row for row in rows or [] if isinstance(row, dict) and row.get("is_published") is True]


def published_projects() -> list[GalleryProject]:
    """Every published project, newest id first (the gallery's default sort is newest first)."""
    rows = _model_rows() if apps.is_installed("powered_by") else _fixture_rows()
    projects = []
    for row in rows:
        try:
            project = GalleryProject.from_row(row)
        except (KeyError, TypeError, ValueError):
            continue
        if project.name:
            projects.append(project)
    return sorted(projects, key=lambda p: p.id, reverse=True)


# -- the payload -----------------------------------------------------------------------------------------


def _origin(request) -> str:
    return f"{request.scheme}://{request.get_host()}"


def _site(request) -> dict[str, Any]:
    """C3 ``siteConfig``, reporting to the ``gallery`` analytics section (contract C8)."""
    from devportal.models import PortalState

    state = PortalState.objects.filter(pk=PortalState.SINGLETON_ID).first() or PortalState()  # no write on GET
    search_sha = state.snapshot_sha
    if not search_sha:
        from devportal.spec import load_spec

        search_sha = load_spec().sha
    return {
        "apiOrigin": getattr(settings, "DEVPORTAL_API_ORIGIN", "https://www.sefaria.org"),
        "ga4": dict(getattr(settings, "DEVPORTAL_GA4", {}) or {}),
        "analyticsSection": "gallery",
        "demoApiKey": getattr(settings, "DEVPORTAL_DEMO_API_KEY", "") or None,
        "searchDocsUrl": f"/_portal/search-docs.{search_sha}.json",
        "mcpUrl": f"{_origin(request)}/mcp",
        "generation": state.generation,
    }


def gallery_payload(
    request,
    *,
    path: str,
    view: str,
    title: str,
    description: str,
    robots: str,
    canonical_path: str,
    project_id: int | None = None,
) -> dict[str, Any]:
    """The C3 ``galleryPayload``."""
    return {
        "contractVersion": CONTRACT_VERSION,
        "path": path,
        "title": title,
        "meta": {
            "description": description,
            "robots": robots,
            "canonicalUrl": f"{_origin(request)}{canonical_path}",
            "markdownUrl": None,
        },
        "header": {"activeTab": "gallery"},
        "site": _site(request),
        "kind": "gallery",
        "view": view,
        "projectId": project_id,
    }


def _truncate(text: str, limit: int) -> str:
    """As the project page's ``truncate``."""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# -- rendering -------------------------------------------------------------------------------------------


def _base_template():
    try:
        return get_template(BASE_TEMPLATE)
    except TemplateDoesNotExist:
        return engines["django"].from_string(_FALLBACK_BASE)


def _render(request, template: str, payload: dict[str, Any], context: dict[str, Any], status: int = 200):
    origin = _origin(request)
    context = {
        "base_template": _base_template(),
        "payload": payload,
        "title": payload["title"],
        "meta": payload["meta"],
        "noindex": payload["meta"]["robots"] == "noindex",
        "social": {
            "site_name": SITE_NAME,
            "url": payload["meta"]["canonicalUrl"],
            "image": f"{origin}{OG_IMAGE_PATH}",
        },
        "gallery_url": GALLERY_BASE,
        "api_path": API_PATH,
        **context,
    }
    return HttpResponse(render_to_string(template, context), status=status, content_type="text/html; charset=utf-8")


# -- views -----------------------------------------------------------------------------------------------


@require_safe
def gallery_index(request):
    """``/powered-by`` (C9 gallery): every published project, as links to their pages."""
    projects = published_projects()
    payload = gallery_payload(
        request,
        path=GALLERY_BASE,
        view="index",
        title=INDEX_TITLE,
        description=INDEX_DESCRIPTION,
        robots="index",
        canonical_path=GALLERY_BASE,
    )
    context = {
        "projects": [p for p in projects if not p.is_buggy],
        "buggy_projects": [p for p in projects if p.is_buggy],
        "social_description": SOCIAL_DESCRIPTION,
        "charts": False,
    }
    return _render(request, LIST_TEMPLATE, payload, context)


@require_safe
def gallery_charts(request):
    """``/powered-by/charts`` (C9 gallery-charts): unlisted and ``noindex``. The charts are drawn client-side."""
    path = f"{GALLERY_BASE}/charts"
    payload = gallery_payload(
        request,
        path=path,
        view="charts",
        title=CHARTS_TITLE,
        description=INDEX_DESCRIPTION,
        robots="noindex",
        canonical_path=path,
    )
    context = {"projects": [], "buggy_projects": [], "social_description": SOCIAL_DESCRIPTION, "charts": True}
    return _render(request, LIST_TEMPLATE, payload, context)


@require_safe
def gallery_project(request, slug: str):
    """``/powered-by/projects/<id>-<name>`` (C9 gallery-project): 200, 301 to the canonical slug, or 404."""
    path = f"{GALLERY_BASE}/projects/{slug}"
    project_id = parse_slug(slug)
    project = None
    if project_id is not None:
        project = next((p for p in published_projects() if p.id == project_id), None)
    if project is None:
        payload = gallery_payload(
            request,
            path=path,
            view="project",
            title=NOT_FOUND_TITLE,
            description="That project doesn't exist, or it isn't published.",
            robots="noindex",
            canonical_path=path,
        )
        return _render(request, PROJECT_TEMPLATE, payload, {"project": None, "missing": "project"}, status=404)
    if slug != project.slug:
        target = project.path
        if request.META.get("QUERY_STRING"):
            target = f"{target}?{request.META['QUERY_STRING']}"
        return HttpResponsePermanentRedirect(target)
    payload = gallery_payload(
        request,
        path=path,
        view="project",
        title=f"{project.name} · {SITE_NAME}",
        description=_truncate(project.description or project.backstory, 155),
        robots="index",
        canonical_path=project.path,
        project_id=project.id,
    )
    return _render(request, PROJECT_TEMPLATE, payload, {"project": project})


@require_safe
def gallery_unknown(request, rest: str):
    """Any other ``/powered-by/<rest>``: the gallery's own "Page not found", with a real 404."""
    path = f"{GALLERY_BASE}/{rest}"
    payload = gallery_payload(
        request,
        path=path,
        view="index",
        title=PAGE_NOT_FOUND_TITLE,
        description="That page doesn't exist.",
        robots="noindex",
        canonical_path=path,
    )
    return _render(request, PROJECT_TEMPLATE, payload, {"project": None, "missing": "page"}, status=404)
