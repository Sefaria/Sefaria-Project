"""Bring the endpoint pages in line with docs/openAPI.json (PLAN.md §2.7).

    python manage.py devportal_sync_spec [--spec PATH] [--dry-run]

Runs after every import and at deploy (from the seeding hook, §7.6). For each operation of the spec:

- an operation with no endpoint ``Page`` gets one, published, appended to its tag's group (the last group
  that already holds an operation with that tag, or whose slug or title is the tag); a tag with no group
  gets a new tag group at the end, next to the last existing group;
- ``spec_slice_sha`` is updated, and ``spec_updated_at`` set when that hash changes.

An endpoint page whose operation left the spec is hidden (a new published revision with ``hidden``) and
reported; it is never deleted, so its overlay survives if the operation comes back, in which case the page
is shown again. A page staff soft-deleted stays deleted and is reported. ``PortalState.spec_sha`` records
the spec; ``generation`` is bumped when the tree changed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from devportal.models import Origin, Page, PageKind, PageRevision, PortalState, RevisionSource, Section
from devportal.spec import Operation, Spec, load_spec

SYNC_HIDDEN_KEY = "hiddenBySpecSync"  # in PageRevision.metadata: hidden because the operation left the spec

_REVISION_FIELDS = (
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


@dataclass
class SyncReport:
    created: list[str] = field(default_factory=list)  # operationIds
    new_groups: list[str] = field(default_factory=list)  # tag group slugs
    hidden: list[str] = field(default_factory=list)  # operationIds that left the spec
    shown: list[str] = field(default_factory=list)  # operationIds back in the spec
    spec_changed: list[str] = field(default_factory=list)  # operationIds whose slice changed
    deleted_in_spec: list[str] = field(default_factory=list)  # soft-deleted pages whose operation is in the spec

    @property
    def tree_changed(self) -> bool:
        return bool(self.created or self.new_groups or self.hidden or self.shown)

    def lines(self) -> list[str]:
        out = []
        for label, items in (
            ("created endpoint pages", self.created),
            ("created tag groups", self.new_groups),
            ("hidden (operation left the spec)", self.hidden),
            ("shown again (operation back in the spec)", self.shown),
            ("slice changed", self.spec_changed),
            ("soft-deleted but still in the spec", self.deleted_in_spec),
        ):
            if items:
                out.append(f"{label} ({len(items)}): {', '.join(items)}")
        return out or ["endpoint pages are in sync with the spec"]


def slugify_tag(tag: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", tag.lower()).strip("-") or "tag"


def _unique_slug(base: str) -> str:
    taken = set(
        Page.objects.filter(section=Section.REFERENCE, slug__startswith=base)
        .exclude(kind=PageKind.CATEGORY)
        .values_list("slug", flat=True)
    )
    if base not in taken:
        return base
    n = 1
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def _next_position(parent: Page | None) -> int:
    qs = Page.objects.filter(section=Section.REFERENCE, parent=parent)
    top = qs.aggregate(m=Max("position"))["m"]
    return 0 if top is None else top + 1


def _publish(page: Page, now, *, base: PageRevision | None = None, **changes) -> PageRevision:
    data = {name: getattr(base, name) for name in _REVISION_FIELDS} if base is not None else {}
    data.update(changes)
    number = (page.revisions.aggregate(m=Max("number"))["m"] or 0) + 1
    revision = PageRevision.objects.create(page=page, number=number, source=RevisionSource.IMPORT, **data)
    page.published_revision = revision
    page.content_updated_at = now
    page.save(update_fields=["published_revision", "content_updated_at", "updated_at"])
    return revision


class Syncer:
    def __init__(self, spec: Spec, now=None):
        self.spec = spec
        self.now = now or timezone.now()
        self.report = SyncReport()

    def _groups(self) -> list[Page]:
        return list(
            Page.objects.filter(section=Section.REFERENCE, kind=PageKind.TAG_GROUP, deleted_at__isnull=True)
            .select_related("published_revision")
            .order_by("position", "id")
        )

    def _group_tags(self, groups: list[Page]) -> dict[int, set[str]]:
        tags: dict[int, set[str]] = {g.pk: set() for g in groups}
        endpoints = Page.objects.filter(
            section=Section.REFERENCE, kind=PageKind.ENDPOINT, parent__in=groups, deleted_at__isnull=True
        )
        for page in endpoints:
            op = self.spec.operation(page.operation_id or "")
            if op is not None:
                tags[page.parent_id].update(op.tags)
        return tags

    def _group_for(self, op: Operation) -> Page:
        tag = op.tag
        groups = self._groups()
        group_tags = self._group_tags(groups)
        holding = [g for g in groups if tag and tag in group_tags[g.pk]]
        if holding:
            return holding[-1]
        named = [
            g
            for g in groups
            if g.slug == slugify_tag(tag)
            or (g.published_revision is not None and g.published_revision.title.strip().lower() == tag.lower())
        ]
        if named:
            return named[-1]
        return self._new_group(tag or "Other", groups)

    def _new_group(self, tag: str, groups: list[Page]) -> Page:
        parent = None
        if groups:
            last = max(groups, key=lambda g: (g.parent_id is not None, g.position, g.pk))
            parent = last.parent
        group = Page.objects.create(
            section=Section.REFERENCE,
            kind=PageKind.TAG_GROUP,
            slug=_unique_slug(slugify_tag(tag)),
            parent=parent,
            position=_next_position(parent),
            origin=Origin.IMPORT,
        )
        _publish(group, self.now, title=tag, excerpt=self.spec.tag_description(tag))
        self.report.new_groups.append(group.slug)
        return group

    def _create_endpoint(self, op: Operation, sha: str) -> None:
        group = self._group_for(op)
        page = Page.objects.create(
            section=Section.REFERENCE,
            kind=PageKind.ENDPOINT,
            slug=_unique_slug(op.operation_id),
            parent=group,
            position=_next_position(group),
            operation_id=op.operation_id,
            origin=Origin.IMPORT,
            spec_slice_sha=sha,
            spec_updated_at=self.now,
        )
        _publish(page, self.now, title=op.title)
        self.report.created.append(op.operation_id)

    def run(self) -> SyncReport:
        pages = {
            p.operation_id: p
            for p in Page.objects.filter(kind=PageKind.ENDPOINT, operation_id__isnull=False).select_related(
                "published_revision"
            )
        }
        in_spec = set()
        for op in self.spec.operations():
            in_spec.add(op.operation_id)
            sha = self.spec.slice_sha(op.operation_id)
            page = pages.get(op.operation_id)
            if page is None:
                self._create_endpoint(op, sha)
                continue
            if page.deleted_at is not None:
                self.report.deleted_in_spec.append(op.operation_id)
            if page.spec_slice_sha != sha:
                if page.spec_slice_sha:
                    self.report.spec_changed.append(op.operation_id)
                page.spec_slice_sha = sha
                page.spec_updated_at = self.now
                page.save(update_fields=["spec_slice_sha", "spec_updated_at", "updated_at"])
            rev = page.published_revision
            if rev is not None and rev.hidden and (rev.metadata or {}).get(SYNC_HIDDEN_KEY):
                metadata = {k: v for k, v in rev.metadata.items() if k != SYNC_HIDDEN_KEY}
                _publish(page, self.now, base=rev, hidden=False, metadata=metadata)
                self.report.shown.append(op.operation_id)

        for op_id, page in pages.items():
            if op_id in in_spec or page.deleted_at is not None:
                continue
            rev = page.published_revision
            if rev is None or rev.hidden:
                continue
            _publish(page, self.now, base=rev, hidden=True, metadata={**(rev.metadata or {}), SYNC_HIDDEN_KEY: True})
            self.report.hidden.append(op_id)

        state = PortalState.load()
        state.spec_sha = self.spec.sha
        if self.report.tree_changed:
            state.generation += 1
        state.save()
        return self.report


def sync_spec(spec: Spec | None = None, *, now=None) -> SyncReport:
    """Run the sync in one transaction and return what changed."""
    with transaction.atomic():
        return Syncer(spec or load_spec(), now=now).run()


class _DryRun(Exception):
    pass


class Command(BaseCommand):
    help = "Create endpoint pages for new operations, hide the ones that left the spec, update slice hashes."

    def add_arguments(self, parser):
        parser.add_argument("--spec", help="OpenAPI file (default: docs/openAPI.json)")
        parser.add_argument("--dry-run", action="store_true", help="report without saving")

    def handle(self, *args, **options):
        spec = load_spec(options["spec"]) if options.get("spec") else load_spec()
        report = None
        try:
            with transaction.atomic():
                report = Syncer(spec).run()
                if options.get("dry_run"):
                    raise _DryRun
        except _DryRun:
            self.stdout.write("dry run: nothing saved")
        for line in report.lines():
            self.stdout.write(line)
        if report.hidden:
            self.stderr.write(f"operations left the spec, their pages are hidden: {', '.join(report.hidden)}")
