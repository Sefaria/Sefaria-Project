"""The publish pipeline (PLAN.md §2.5, §2.11 "Publishing").

Revisions are immutable snapshots; a page's `draft_revision` is the pending, unpublished one (None
when the published revision is current) and `published_revision` is the only one the public site
reads. Publishing renders the revision through `devportal.markdown` (via
`devportal.adapters.markdown`), caches the HTML, table of contents and search text on the
revision, bumps `PortalState.generation` and rebuilds the artifacts.

Artifacts are produced by registered builder functions. This module owns the registry; the
navigation module registers the sidebar trees and the sitemap, and the modules named in
`ARTIFACT_BUILDER_MODULES` (search documents, `llms` files: other workstreams) register theirs
when they exist. Callers log editor actions in `EditorAuditLog`; this module does not.
"""

import hashlib
import importlib
import json
import logging

from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from devportal.adapters import markdown as md
from devportal.models import Page, PageRevision, PortalArtifact, PortalState, RevisionSource

logger = logging.getLogger("devportal")

# Content fields of a revision (everything but identity, provenance and cached rendering).
CONTENT_FIELDS = (
    "title",
    "excerpt",
    "body_md",
    "hidden",
    "deprecated",
    "metadata",
    "next",
    "link_url",
    "link_new_tab",
    "fullscreen",
    "api_config",
    "sidebar_label",
    "title_override",
    "description_override_md",
)

# Modules that register artifact builders when imported. Missing modules are skipped.
ARTIFACT_BUILDER_MODULES = (
    "devportal.services.nav",  # sidebar trees and sitemap (W6)
    "devportal.services.search_index",  # search documents (W10)
    "devportal.services.llms",  # llms.txt files (W8)
)

_BUILDERS = {}


class PublishError(Exception):
    pass


# --- revisions ----------------------------------------------------------------------------------


def content_of(revision):
    return {name: getattr(revision, name) for name in CONTENT_FIELDS}


def content_sha(content):
    """A stable hash of a revision's content fields (missing fields take the model defaults)."""
    full = {name: content.get(name, _default(name)) for name in CONTENT_FIELDS}
    canonical = json.dumps(full, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _default(name):
    field = PageRevision._meta.get_field(name)
    return field.get_default()


def create_revision(page, *, source, author=None, base=None, **content):
    """Append a revision and make it the page's draft. `base` (a revision) supplies unset fields."""
    unknown = set(content) - set(CONTENT_FIELDS)
    if unknown:
        msg = f"Unknown revision fields: {sorted(unknown)}"
        raise PublishError(msg)
    values = content_of(base) if base is not None else {}
    values.update(content)
    with transaction.atomic():
        locked = Page.objects.select_for_update().get(pk=page.pk)
        number = (locked.revisions.aggregate(n=Max("number"))["n"] or 0) + 1
        revision = PageRevision.objects.create(page=locked, number=number, author=author, source=source, **values)
        Page.objects.filter(pk=page.pk).update(draft_revision=revision, updated_at=timezone.now())
    page.draft_revision = revision
    return revision


def render_revision(revision, *, force=False):
    """Render and cache a revision's body. Skips revisions rendered by the current renderer."""
    version = md.renderer_version()
    if not force and revision.renderer_version == version:
        return revision
    # The HTML-block frame URL names the PageRevision primary key (devportal/views/htmlblock.py).
    result = md.render(revision.body_md, revision=revision.pk)
    revision.rendered_html = result.html
    revision.rendered_toc = list(result.toc)
    revision.search_text = result.text
    revision.renderer_version = version
    PageRevision.objects.filter(pk=revision.pk).update(
        rendered_html=revision.rendered_html,
        rendered_toc=revision.rendered_toc,
        search_text=revision.search_text,
        renderer_version=version,
    )
    return revision


def publish(page, revision=None, *, content_updated_at=None, rebuild=True):
    """Publish `revision` (default: the page's draft). Returns the published revision."""
    revision = revision or page.draft_revision
    if revision is None:
        msg = f"{page} has no draft to publish."
        raise PublishError(msg)
    if revision.page_id != page.pk:
        msg = "The revision belongs to another page."
        raise PublishError(msg)
    render_revision(revision)
    page.published_revision = revision
    if page.draft_revision_id == revision.pk or (
        page.draft_revision is not None and page.draft_revision.number <= revision.number
    ):
        page.draft_revision = None
    page.content_updated_at = content_updated_at or timezone.now()
    page.save(update_fields=["published_revision", "draft_revision", "content_updated_at", "updated_at"])
    bump_generation()
    if rebuild:
        schedule_rebuild()
    return revision


def restore(page, number, *, author=None):
    """Make a copy of revision `number` the page's new draft. History is never rewritten."""
    old = page.revisions.get(number=number)
    return create_revision(page, source=RevisionSource.RESTORE, author=author, **content_of(old))


def soft_delete(page, *, rebuild=True):
    """Mark a page deleted. Its rows stay; the public site treats it as a 404."""
    if page.children.filter(deleted_at__isnull=True).exists():
        msg = f"{page} has children; move or delete them first."
        raise PublishError(msg)
    page.deleted_at = timezone.now()
    page.save(update_fields=["deleted_at", "updated_at"])
    bump_generation()
    if rebuild:
        schedule_rebuild()


def undelete(page, *, rebuild=True):
    page.deleted_at = None
    page.save(update_fields=["deleted_at", "updated_at"])
    bump_generation()
    if rebuild:
        schedule_rebuild()


# --- portal state -------------------------------------------------------------------------------


def bump_generation():
    PortalState.load()
    PortalState.objects.filter(id=PortalState.SINGLETON_ID).update(generation=F("generation") + 1)
    return PortalState.objects.get(id=PortalState.SINGLETON_ID).generation


# --- artifacts ----------------------------------------------------------------------------------


def register_artifact_builder(name, content_type="application/json"):
    """Decorator: `fn(context) -> str | dict | list | None` builds the artifact `name`.

    `context` is `{"generation": int}`. A dict or list is stored as JSON; None stores nothing.
    """

    def decorator(fn):
        _BUILDERS[name] = (fn, content_type)
        return fn

    return decorator


def artifact_builders():
    for module in ARTIFACT_BUILDER_MODULES:
        try:
            importlib.import_module(module)
        except ImportError as exc:
            if getattr(exc, "name", None) != module:
                raise
    return dict(_BUILDERS)


def store_artifact(name, content, content_type="application/json", generation=None):
    """Upsert one artifact. Returns True when its content changed."""
    if isinstance(content, (dict, list)):
        content = json.dumps(content, ensure_ascii=False, indent=1)
    sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
    if generation is None:
        generation = PortalState.load().generation
    artifact = PortalArtifact.objects.filter(name=name).first()
    if artifact is not None and artifact.sha256 == sha and artifact.content_type == content_type:
        return False
    PortalArtifact.objects.update_or_create(
        name=name,
        defaults={"content": content, "content_type": content_type, "sha256": sha, "generation": generation},
    )
    return True


def rerender_stale():
    """Re-render every published or draft revision rendered by another renderer version."""
    version = md.renderer_version()
    ids = set(Page.objects.exclude(published_revision=None).values_list("published_revision", flat=True))
    ids |= set(Page.objects.exclude(draft_revision=None).values_list("draft_revision", flat=True))
    count = 0
    for revision in PageRevision.objects.filter(pk__in=ids).exclude(renderer_version=version):
        render_revision(revision, force=True)
        count += 1
    return count


def stale_render_count():
    version = md.renderer_version()
    ids = Page.objects.exclude(published_revision=None).values_list("published_revision", flat=True)
    return PageRevision.objects.filter(pk__in=list(ids)).exclude(renderer_version=version).count()


def rebuild_artifacts(*, rerender=True):
    """Re-render stale revisions, then rebuild every registered artifact. Returns a report."""
    report = {"rerendered": 0, "changed": [], "unchanged": [], "errors": {}}
    if rerender:
        report["rerendered"] = rerender_stale()
    generation = PortalState.load().generation
    context = {"generation": generation}
    for name, (fn, content_type) in sorted(artifact_builders().items()):
        try:
            content = fn(context)
            if content is None:
                continue
            changed = store_artifact(name, content, content_type, generation)
        except Exception as exc:
            logger.exception("devportal: building artifact %s failed", name)
            report["errors"][name] = f"{type(exc).__name__}: {exc}"
            continue
        report["changed" if changed else "unchanged"].append(name)
    return report


def schedule_rebuild():
    """Rebuild on Celery when it is enabled, inline otherwise; after the transaction commits."""
    from devportal.adapters import tasks as task_runner
    from devportal.tasks import rebuild_artifacts_task

    transaction.on_commit(lambda: task_runner.run(rebuild_artifacts_task))
