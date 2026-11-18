"""Content import from the vendored ReadMe snapshot (PLAN.md §7.2) and automatic seeding (§7.6).

`Importer(...).run()` reads `devportal/migration_source/` and upserts the three trees:

1. Builds the trees from the `_order.yaml` files (a file missing from its `_order.yaml` is appended
   at the end and reported).
2. Reads the front matter into revision fields. The slug is the file or folder name.
3. Applies `link_fixes.yaml` (each fix must match its expected count, or the import fails), then
   rewrites `doc:`/`ref:`/`page:` and `https://developers.sefaria.org/` link destinations to paths.
4. Sets `content_updated_at` from `migration_source/live/sidebar-*.json`, else the snapshot date.
5. Upserts by section and slug in one transaction, keeping pages edited in the new editor.
6. Syncs the spec (when `devportal_sync_spec` exists), rebuilds the artifacts, bumps the generation.
7. Stores the report as the `import-report.json` artifact.

`auto_seed()` is what the `post_migrate` hook runs (devportal/apps.py).
"""

import difflib
import hashlib
import json
import logging
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import yaml
from django.db import connections, transaction
from django.utils import timezone

from devportal.adapters import markdown as md
from devportal.adapters import spec as spec_adapter
from devportal.models import (
    EditorAuditLog,
    Origin,
    Page,
    PageKind,
    PortalState,
    RevisionSource,
    Section,
)
from devportal.services import publish

logger = logging.getLogger("devportal")

SOURCE_DIR = Path(__file__).resolve().parents[1] / "migration_source"
TREES = (("docs", Section.DOCS), ("reference", Section.REFERENCE), ("custom_pages", Section.PAGE))
LIVE_SIDEBARS = {Section.DOCS: "sidebar-docs.json", Section.REFERENCE: "sidebar-reference.json"}
LIVE_SIDEBARS[Section.PAGE] = "sidebar-custom_pages.json"
REPORT_ARTIFACT = "import-report.json"
SNAPSHOT_FILES = ("SOURCE.json", "link_fixes.yaml")
SNAPSHOT_DIRS = ("docs", "reference", "custom_pages", "custom_blocks", "live")
API_CATEGORY = "Sefaria API"
TREE_ACTIONS = (EditorAuditLog.Action.CREATE, EditorAuditLog.Action.MOVE, EditorAuditLog.Action.DELETE)
_FM_CLOSE = re.compile(r"\n---(\n|$)")


class SourceError(Exception):
    """The snapshot cannot be imported as it is (a broken tree, stub or link fix)."""


class _DryRunRollback(Exception):
    pass


def nfc(text):
    return unicodedata.normalize("NFC", text)


def split_front_matter(text):
    """`(front_matter_dict, body)`. The closing fence may be the file's last line, with no newline."""
    if not text.startswith("---\n"):
        return {}, text
    m = _FM_CLOSE.search(text, 3)
    if m is None:
        return {}, text
    data = yaml.safe_load(text[4 : m.start() + 1]) or {}
    if not isinstance(data, dict):
        msg = "front matter is not a mapping"
        raise SourceError(msg)
    return data, text[m.end() :]


def snapshot_sha(source_dir=SOURCE_DIR):
    """A hash of everything the import reads from the snapshot."""
    source_dir = Path(source_dir)
    digest = hashlib.sha256()
    paths = [source_dir / name for name in SNAPSHOT_FILES]
    for name in SNAPSHOT_DIRS:
        paths += sorted((source_dir / name).rglob("*")) if (source_dir / name).is_dir() else []
    for path in paths:
        if path.is_file():
            digest.update(nfc(path.relative_to(source_dir).as_posix()).encode())
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    return digest.hexdigest()


@dataclass
class Node:
    section: str
    kind: str
    slug: str
    rel_path: str  # source file (or folder, for a category), relative to the snapshot
    parent: "Node | None" = None
    position: int = 0
    front: dict = field(default_factory=dict)
    body: str = ""
    children: list = field(default_factory=list)
    content: dict = field(default_factory=dict)
    operation_id: str | None = None

    @property
    def key(self):
        return (self.section, self.kind == PageKind.CATEGORY, self.slug)

    @property
    def depth(self):
        return 1 if self.parent is None else self.parent.depth + 1

    def flags(self):
        flags = []
        if self.content.get("hidden"):
            flags.append("hidden")
        if self.content.get("deprecated"):
            flags.append("deprecated")
        if self.kind == PageKind.LINK:
            flags.append("link")
        return flags


def _as_bool(value):
    return bool(value) if value is not None else False


def _as_str(value):
    return "" if value is None else str(value)


class Importer:
    def __init__(
        self,
        source_dir=SOURCE_DIR,
        *,
        spec_path=None,
        force=(),
        prune=False,
        dry_run=False,
        sync_spec=True,
        safe=False,
    ):
        self.source_dir = Path(source_dir)
        self.spec_path = spec_path
        self.force = {nfc(f) for f in force}
        self.prune = prune and not safe
        self.dry_run = dry_run
        self.sync_spec = sync_spec
        if safe:
            self.force = set()
        self.nodes = []
        self.report = {
            "source": {},
            "dry_run": dry_run,
            "files": [],
            "counts": {},
            "created": [],
            "updated": [],
            "unchanged": 0,
            "moved": [],
            "touched": [],  # provenance, kind or date changed, content not
            "kept_local_edits": [],
            "forced": [],
            "missing": [],
            "pruned": [],
            "undeleted": [],
            "order_not_applied": [],
            "not_in_order": [],
            "order_entries_without_file": [],
            "not_imported": [],
            "link_fixes": [],
            "link_rewrites": 0,
            "placeholder_links": [],
            "unresolved_links": [],
            "external_images": [],
            "spec_check": {},
            "artifacts": {},
            "warnings": [],
            "changes": 0,
        }

    # --- reading the snapshot -----------------------------------------------------------------

    def _read(self, path):
        text = path.read_text(encoding="utf-8")
        front, body = split_front_matter(text)
        return front, body

    def _ordered_entries(self, folder):
        names = {}
        for child in folder.iterdir():
            if child.name.startswith(("_", ".")) or child.name == "index.md":
                continue
            if child.is_dir():
                names[nfc(child.name)] = child
            elif child.suffix in (".md", ".html"):
                names[nfc(child.stem)] = child
        order_file = folder / "_order.yaml"
        order = []
        if order_file.exists():
            order = [nfc(str(x)) for x in (yaml.safe_load(order_file.read_text(encoding="utf-8")) or [])]
        rel = folder.relative_to(self.source_dir).as_posix()
        entries = []
        for name in order:
            if name in names:
                entries.append(names.pop(name))
            else:
                self.report["order_entries_without_file"].append(f"{rel}/{name}")
        for name in sorted(names):
            self.report["not_in_order"].append(f"{rel}/{name}")
            entries.append(names[name])
        return entries

    def _rel(self, path):
        return nfc(path.relative_to(self.source_dir).as_posix())

    def build_trees(self):
        ops = spec_adapter.operation_index(self.spec_path)
        for tree, section in TREES:
            root = self.source_dir / tree
            for position, entry in enumerate(self._ordered_entries(root)):
                if section == Section.PAGE:
                    self._add_leaf(entry, section, None, position, ops)
                elif entry.is_dir():
                    category = Node(section, PageKind.CATEGORY, nfc(entry.name), self._rel(entry), position=position)
                    category.content = {"title": nfc(entry.name)}
                    self.nodes.append(category)
                    self._walk(entry, category, ops)
                else:
                    msg = f"{self._rel(entry)}: a top-level entry of {tree}/ must be a folder (a category)"
                    raise SourceError(msg)
        blocks = self.source_dir / "custom_blocks"
        if blocks.is_dir():
            self.report["not_imported"] = sorted(self._rel(p) for p in blocks.rglob("*.md"))
        for node in self.nodes:
            if node.depth > Page.MAX_DEPTH:
                msg = f"{node.rel_path}: deeper than a category plus three levels"
                raise SourceError(msg)

    def _walk(self, folder, parent, ops):
        for position, entry in enumerate(self._ordered_entries(folder)):
            if entry.is_dir():
                index = entry / "index.md"
                if not index.exists():
                    msg = f"{self._rel(entry)}: a nested folder needs an index.md"
                    raise SourceError(msg)
                is_tag = parent.kind == PageKind.CATEGORY and parent.slug == API_CATEGORY
                kind = PageKind.TAG_GROUP if is_tag else PageKind.PAGE
                node = self._make(index, parent.section, kind, nfc(entry.name), parent, position)
                node.rel_path = self._rel(index)
                self._walk(entry, node, ops)
            else:
                self._add_leaf(entry, parent.section, parent, position, ops)

    def _add_leaf(self, path, section, parent, position, ops):
        front, _ = self._read(path)
        slug = nfc(path.stem)
        api = front.get("api") if isinstance(front.get("api"), dict) else None
        link = front.get("link") if isinstance(front.get("link"), dict) else {}
        if api is not None:
            kind = PageKind.ENDPOINT
        elif front.get("api_config"):
            kind = PageKind.API_CONFIG
        elif link.get("url"):
            kind = PageKind.LINK
        else:
            kind = PageKind.PAGE
        node = self._make(path, section, kind, slug, parent, position)
        if kind == PageKind.ENDPOINT:
            op_id = _as_str(api.get("operationId"))
            if op_id != slug:
                msg = f"{node.rel_path}: slug, filename and api.operationId must be equal ({op_id!r})"
                raise SourceError(msg)
            if op_id not in ops:
                msg = f"{node.rel_path}: operationId {op_id!r} is not in docs/openAPI.json"
                raise SourceError(msg)
            node.operation_id = op_id
            node.content["title"] = ops[op_id]["summary"] or op_id
        return node

    def _make(self, path, section, kind, slug, parent, position):
        front, body = self._read(path)
        link = front.get("link") if isinstance(front.get("link"), dict) else {}
        node = Node(section, kind, slug, self._rel(path), parent=parent, position=position, front=front, body=body)
        next_ = front.get("next") if isinstance(front.get("next"), dict) else {}
        node.content = {
            "title": _as_str(front.get("title")),
            "excerpt": _as_str(front.get("excerpt")),
            "body_md": body,
            "hidden": _as_bool(front.get("hidden")),
            "deprecated": _as_bool(front.get("deprecated")),
            "metadata": front.get("metadata") if isinstance(front.get("metadata"), dict) else {},
            "next": json.loads(json.dumps(next_)),
            "link_url": _as_str(link.get("url")),
            "link_new_tab": _as_bool(link.get("new_tab")),
            "fullscreen": _as_bool(front.get("fullscreen")),
            "api_config": _as_str(front.get("api_config")),
        }
        if parent is not None:
            parent.children.append(node)
        self.nodes.append(node)
        return node

    # --- links --------------------------------------------------------------------------------

    def apply_link_fixes(self):
        data = yaml.safe_load((self.source_dir / "link_fixes.yaml").read_text(encoding="utf-8")) or {}
        by_path = {n.rel_path: n for n in self.nodes}
        errors = []
        for fix in data.get("fixes") or []:
            node = by_path.get(nfc(fix["file"]))
            entry = {k: fix[k] for k in ("file", "field", "pattern", "replacement", "expected")}
            if node is None:
                errors.append(f"{fix['file']}: file not found for fix {fix['pattern']!r}")
                continue
            if fix["field"] == "body":
                found = node.content["body_md"].count(fix["pattern"])
                node.content["body_md"] = node.content["body_md"].replace(fix["pattern"], fix["replacement"])
            elif fix["field"] == "next_pages_slug":
                found = 0
                for item in node.content["next"].get("pages") or []:
                    if item.get("slug") == fix["pattern"]:
                        item["slug"] = fix["replacement"]
                        found += 1
            else:
                errors.append(f"{fix['file']}: unknown field {fix['field']!r}")
                continue
            entry["applied"] = found
            self.report["link_fixes"].append(entry)
            if found != fix["expected"]:
                errors.append(f"{fix['file']}: {fix['pattern']!r} matched {found} times, expected {fix['expected']}")
        for item in data.get("reported_not_fixed") or []:
            node = by_path.get(nfc(item["file"]))
            found = node.content["body_md"].count(item["pattern"]) if node else 0
            self.report["placeholder_links"].append({"file": item["file"], "pattern": item["pattern"], "found": found})
        if errors:
            msg = "Link fixes do not match the source (update link_fixes.yaml deliberately):\n  " + "\n  ".join(errors)
            raise SourceError(msg)

    def rewrite_links(self):
        for node in self.nodes:
            if node.kind == PageKind.CATEGORY:
                continue
            body, changes = md.rewrite_markdown_links(node.content["body_md"])
            node.content["body_md"] = body
            self.report["link_rewrites"] += len(changes)
            for item in node.content["next"].get("pages") or []:
                slug = _as_str(item.get("slug"))
                for prefix in ("doc:", "ref:", "page:"):
                    if slug.startswith(prefix):
                        item["slug"] = slug[len(prefix) :]
                        self.report["link_rewrites"] += 1

    # --- dates --------------------------------------------------------------------------------

    def updated_at_map(self):
        stamps = {}
        live = self.source_dir / "live"
        for section, name in LIVE_SIDEBARS.items():
            path = live / name
            if not path.exists():
                self.report["warnings"].append(f"live/{name} is missing; using the snapshot date")
                continue

            def walk(pages, section=section):
                for page in pages:
                    if page.get("slug") and page.get("updatedAt"):
                        stamps[(section, nfc(page["slug"]))] = _parse_date(page["updatedAt"])
                    walk(page.get("pages") or [])

            for category in json.loads(path.read_text(encoding="utf-8")):
                walk(category.get("pages") or [])
        return stamps

    # --- the database -------------------------------------------------------------------------

    def _tree_edited_sections(self):
        return set(
            EditorAuditLog.objects.filter(action__in=TREE_ACTIONS).values_list("section", flat=True).distinct(),
        )

    def _find(self, node):
        qs = Page.objects.filter(section=node.section, slug=node.slug)
        if node.kind == PageKind.CATEGORY:
            return qs.filter(kind=PageKind.CATEGORY).first()
        return qs.exclude(kind=PageKind.CATEGORY).first()

    @staticmethod
    def locally_edited(page):
        last_import = (
            page.revisions.filter(source=RevisionSource.IMPORT).order_by("-number").values_list("number", flat=True)
        ).first() or 0
        return page.revisions.filter(
            number__gt=last_import,
            source__in=[RevisionSource.EDITOR, RevisionSource.RESTORE],
        ).exists()

    def _db_content(self, node):
        """The revision content: the source's, with images already mirrored pointing at their copies."""
        content = dict(node.content)
        if self.assets:
            from devportal.services.images import replace_urls

            content["body_md"] = replace_urls(content["body_md"], self.assets)
        return content

    def upsert(self, stamps, default_stamp):
        from devportal.services.images import asset_map

        self.assets = asset_map()
        tree_edited = self._tree_edited_sections()
        pages = {}
        self.page_ids = []
        for node in self.nodes:  # parents come before their children
            parent = pages.get(id(node.parent)) if node.parent is not None else None
            stamp = stamps.get((node.section, node.slug), default_stamp)
            sha = publish.content_sha(node.content)
            ident = f"{node.section}/{node.slug}"
            page = self._find(node)
            if page is None:
                page = Page.objects.create(
                    section=node.section,
                    kind=node.kind,
                    slug=node.slug,
                    parent=parent,
                    position=self._new_position(node, parent, tree_edited),
                    operation_id=node.operation_id,
                    origin=Origin.IMPORT,
                    origin_path=node.rel_path,
                    origin_body_sha=sha,
                )
                revision = publish.create_revision(page, source=RevisionSource.IMPORT, **self._db_content(node))
                publish.publish(page, revision, content_updated_at=stamp, rebuild=False)
                self.report["created"].append(ident)
                pages[id(node)] = page
                self.page_ids.append(page.pk)
                continue
            pages[id(node)] = page
            self.page_ids.append(page.pk)
            changed = self._update(page, node, parent, sha, stamp, tree_edited, ident)
            if not changed:
                self.report["unchanged"] += 1

    def _new_position(self, node, parent, tree_edited):
        if node.section not in tree_edited:
            return node.position
        siblings = Page.objects.filter(section=node.section, parent=parent)
        return max(siblings.values_list("position", flat=True), default=-1) + 1

    def _update(self, page, node, parent, sha, stamp, tree_edited, ident):  # noqa: C901, PLR0912
        changed = False
        edited = self.locally_edited(page) or (page.origin == Origin.EDITOR and page.revisions.exists())
        forced = ident in self.force
        if page.deleted_at is not None:
            if edited and not forced:
                self.report["warnings"].append(f"{ident} was deleted after local edits; left deleted")
                return False
            publish.undelete(page, rebuild=False)
            self.report["undeleted"].append(ident)
            changed = True
        if edited and not forced:
            current = page.current_revision()
            if sha != page.origin_body_sha or (current and publish.content_sha(publish.content_of(current)) != sha):
                self.report["kept_local_edits"].append({"page": ident, "diff": _diff(current, node.content)})
        elif sha != page.origin_body_sha or (forced and edited):
            revision = publish.create_revision(page, source=RevisionSource.IMPORT, **self._db_content(node))
            publish.publish(page, revision, content_updated_at=stamp, rebuild=False)
            page.origin_body_sha = sha
            self.report["forced" if forced and edited else "updated"].append(ident)
            changed = True
        # Identity and provenance follow the source.
        changed_before = changed
        fields = []
        for attr, value in (
            ("kind", node.kind),
            ("operation_id", node.operation_id),
            ("origin_path", node.rel_path),
            ("origin_body_sha", page.origin_body_sha),
        ):
            if getattr(page, attr) != value:
                setattr(page, attr, value)
                fields.append(attr)
        if page.origin != Origin.IMPORT and not edited:
            page.origin = Origin.IMPORT
            fields.append("origin")
        if page.content_updated_at != stamp and not edited and page.published_revision_id:
            page.content_updated_at = stamp
            fields.append("content_updated_at")
        # Tree order follows the source until the section's tree is edited in the editor.
        parent_id = parent.pk if parent is not None else None
        if page.parent_id != parent_id or page.position != node.position:
            if node.section in tree_edited:
                self.report["order_not_applied"].append(
                    {"page": ident, "source_parent": parent.slug if parent else None, "source_position": node.position},
                )
            else:
                page.parent_id = parent_id
                page.position = node.position
                fields += ["parent", "position"]
                self.report["moved"].append(ident)
        if fields:
            page.save(update_fields=[*fields, "updated_at"])
            changed = True
            if not changed_before and ident not in self.report["moved"]:
                self.report["touched"].append(ident)
        return changed

    def handle_missing(self, seen_ids):
        missing = Page.objects.filter(origin=Origin.IMPORT, deleted_at__isnull=True).exclude(pk__in=seen_ids)
        # Children before parents, so a pruned parent has no live children left.
        for page in sorted(missing, key=lambda p: -p.depth):
            ident = f"{page.section}/{page.slug}"
            self.report["missing"].append(ident)
            if not self.prune:
                continue
            if self.locally_edited(page):
                self.report["warnings"].append(f"{ident} is gone from the source but was edited locally; kept")
                continue
            try:
                publish.soft_delete(page, rebuild=False)
            except publish.PublishError as exc:
                self.report["warnings"].append(f"{ident} not pruned: {exc}")
                continue
            self.report["pruned"].append(ident)

    def _counts(self):
        counts = {}
        for node in self.nodes:
            counts.setdefault(node.section, {}).setdefault(node.kind, 0)
            counts[node.section][node.kind] += 1
        files = [n for n in self.nodes if n.kind != PageKind.CATEGORY]
        counts["files"] = len(files)
        counts["hidden"] = sum(1 for n in files if n.content["hidden"])
        counts["deprecated"] = sum(1 for n in files if n.content["deprecated"])
        counts["link"] = sum(1 for n in files if n.kind == PageKind.LINK)
        return counts

    def _source_info(self):
        info = json.loads((self.source_dir / "SOURCE.json").read_text(encoding="utf-8"))
        info["snapshot_sha"] = snapshot_sha(self.source_dir)
        self.report["source"] = {k: info.get(k) for k in ("repository", "ref", "commit", "date", "snapshot_sha")}
        current = spec_adapter.spec_sha(self.spec_path)
        check = {"spec_sha": current}
        for excluded in info.get("excluded") or []:
            recorded = excluded.get("normalized_sha256")
            if recorded is None:
                check["status"] = "not recorded in SOURCE.json; compared by devportal_fetch_source"
            elif recorded == current:
                check["status"] = "equal"
            else:
                check["status"] = "differs"
                self.report["warnings"].append(
                    f"{excluded.get('path')} (parsed, numbers normalized) differs from docs/openAPI.json",
                )
        self.report["spec_check"] = check
        return info

    def run(self):
        info = self._source_info()
        self.build_trees()
        self.apply_link_fixes()
        self.rewrite_links()
        self.report["counts"] = self._counts()
        self.report["files"] = [
            {"path": n.rel_path, "section": n.section, "kind": n.kind, "slug": n.slug, "flags": n.flags()}
            for n in self.nodes
            if n.kind != PageKind.CATEGORY
        ]
        stamps = self.updated_at_map()
        default_stamp = _parse_date(info["date"])
        try:
            with transaction.atomic():
                generation_before = PortalState.load().generation
                self.upsert(stamps, default_stamp)
                self.handle_missing(self.page_ids)
                self._finish(info, generation_before)
                if self.dry_run:
                    raise _DryRunRollback
        except _DryRunRollback:
            pass
        return self.report

    def _finish(self, info, generation_before):
        r = self.report
        r["changes"] = (
            (len(r["created"]) + len(r["updated"]) + len(r["forced"]) + len(r["moved"]) + len(r["pruned"]))
            + len(r["undeleted"])
            + len(r["touched"])
        )
        if self.sync_spec:
            r["spec_sync"] = _sync_spec()
        r["artifacts"] = publish.rebuild_artifacts(rerender=True)
        links = _check_links()
        r["unresolved_links"] = links["unresolved"]
        r["external_images"] = links["external_images"]
        state = PortalState.load()
        if r["changes"] and state.generation == generation_before:
            publish.bump_generation()
        if not self.dry_run:
            PortalState.objects.filter(pk=state.pk).update(
                snapshot_sha=info["snapshot_sha"],
                spec_sha=r["spec_check"]["spec_sha"],
            )
            publish.store_artifact(REPORT_ARTIFACT, r)


def _check_links():
    from devportal.services import nav

    return nav.check_links()


def _sync_spec():
    """Run `devportal_sync_spec` when it exists (another workstream writes it)."""
    from django.core.management import call_command, get_commands

    if "devportal_sync_spec" not in get_commands():
        return "skipped: devportal_sync_spec is not installed"
    call_command("devportal_sync_spec")
    return "ran"


def _parse_date(value):
    stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if timezone.is_naive(stamp):
        stamp = stamp.replace(tzinfo=UTC)
    return stamp


def _diff(revision, content, limit=200):
    old = (revision.body_md if revision else "").splitlines()
    new = content.get("body_md", "").splitlines()
    lines = list(difflib.unified_diff(old, new, "local", "source", lineterm="", n=1))
    if revision is not None and revision.title != content.get("title"):
        lines.insert(0, f"title: {revision.title!r} -> {content.get('title')!r}")
    return "\n".join(lines[:limit])


def format_report(report):
    """A human-readable summary of an import report."""
    lines = []
    src = report.get("source") or {}
    lines.append(f"Source {src.get('repository')} @ {src.get('ref')} ({(src.get('commit') or '')[:7]})")
    if report.get("dry_run"):
        lines.append("DRY RUN: nothing was written.")
    counts = report.get("counts") or {}
    for section in ("docs", "reference", "page"):
        if section in counts:
            kinds = ", ".join(f"{k} {v}" for k, v in sorted(counts[section].items()))
            lines.append(f"  {section}: {kinds}")
    lines.append(
        f"  files {counts.get('files')}, hidden {counts.get('hidden')}, deprecated {counts.get('deprecated')}, "
        f"link {counts.get('link')}",
    )
    for key in ("created", "updated", "forced", "moved", "touched", "undeleted", "missing", "pruned"):
        items = report.get(key) or []
        lines.append(
            f"{key}: {len(items)}" + (f" ({', '.join(items[:10])}{' ...' if len(items) > 10 else ''})" if items else "")
        )
    lines.append(f"unchanged: {report.get('unchanged')}")
    lines.append(f"kept local edits: {len(report.get('kept_local_edits') or [])}")
    for item in report.get("kept_local_edits") or []:
        lines.append(f"  {item['page']}")
    lines.append("link fixes:")
    for fix in report.get("link_fixes") or []:
        lines.append(f"  {fix['file']}: {fix['pattern']} -> {fix['replacement']} x{fix['applied']}")
    lines.append(f"link destinations rewritten: {report.get('link_rewrites')}")
    for item in report.get("placeholder_links") or []:
        lines.append(f"  placeholder left as is (I-7): {item['file']} {item['pattern']} x{item['found']}")
    lines.append(f"unresolved links: {len(report.get('unresolved_links') or [])}")
    for item in report.get("unresolved_links") or []:
        lines.append(f"  {item['page']}: {item['destination']}")
    images = report.get("external_images") or []
    lines.append(f"image URLs outside the media bucket: {len(images)} ({len({i['url'] for i in images})} distinct)")
    for key in ("not_in_order", "order_entries_without_file", "not_imported", "order_not_applied", "warnings"):
        for item in report.get(key) or []:
            lines.append(f"{key}: {item}")
    lines.append(f"spec check: {(report.get('spec_check') or {}).get('status')}")
    lines.append(f"changes: {report.get('changes')}")
    return "\n".join(lines)


# --- automatic seeding (PLAN.md §7.6) ------------------------------------------------------------

ADVISORY_LOCK_KEY = 0x44455650  # "DEVP"
_seeding = False  # the in-process guard used where there is no advisory lock (SQLite)


def auto_seed_enabled(settings_obj=None):
    from django.conf import settings

    settings_obj = settings_obj or settings
    if not getattr(settings_obj, "DEVPORTAL_AUTO_SEED", True):
        return False
    # Never seed test databases, whichever app's tests run (PLAN.md §7.6: false under pytest).
    return not ("pytest" in sys.modules or os.environ.get("PYTEST_CURRENT_TEST"))


class _Lock:
    """A Postgres session advisory lock; on other databases, an in-process guard."""

    def __init__(self, conn):
        self.conn = conn
        self.acquired = False

    def __enter__(self):
        global _seeding  # noqa: PLW0603
        if self.conn.vendor == "postgresql":
            with self.conn.cursor() as cursor:
                cursor.execute("SELECT pg_try_advisory_lock(%s)", [ADVISORY_LOCK_KEY])
                self.acquired = bool(cursor.fetchone()[0])
        else:
            self.acquired = not _seeding
            if self.acquired:
                _seeding = True
        return self

    def __exit__(self, *exc):
        global _seeding  # noqa: PLW0603
        if not self.acquired:
            return
        if self.conn.vendor == "postgresql":
            with self.conn.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [ADVISORY_LOCK_KEY])
        else:
            _seeding = False


def seed_needed(source_dir=SOURCE_DIR, spec_path=None):
    state = PortalState.load()
    return (
        state.snapshot_sha != snapshot_sha(source_dir)
        or state.spec_sha != spec_adapter.spec_sha(spec_path)
        or publish.stale_render_count() > 0
    )


def auto_seed(source_dir=None, spec_path=None, *, using="default"):
    """Import (safe mode), sync the spec and rebuild when the snapshot, spec or renderer changed.

    Never raises: a failure is logged and stored on `PortalState.last_seed_error`. Returns a short
    status string.
    """
    source_dir = source_dir or SOURCE_DIR
    conn = connections[using]
    try:
        if Page._meta.db_table not in conn.introspection.table_names():
            return "skipped: tables missing"
        with _Lock(conn) as lock:
            if not lock.acquired:
                return "skipped: another process is seeding"
            if not seed_needed(source_dir, spec_path):
                return "up to date"
            state = PortalState.load()
            if state.snapshot_sha == snapshot_sha(source_dir) and state.spec_sha == spec_adapter.spec_sha(spec_path):
                publish.rebuild_artifacts(rerender=True)
                status = "re-rendered"
            else:
                report = Importer(source_dir, spec_path=spec_path, safe=True).run()
                logger.info("devportal: seeded content: %s changes", report["changes"])
                status = f"imported: {report['changes']} changes"
            PortalState.objects.filter(pk=state.pk).update(last_seed_at=timezone.now(), last_seed_error="")
            return status
    except Exception as exc:
        logger.exception("devportal: automatic content seeding failed")
        try:
            PortalState.load()
            PortalState.objects.filter(id=PortalState.SINGLETON_ID).update(
                last_seed_at=timezone.now(),
                last_seed_error=f"{type(exc).__name__}: {exc}"[:10000],
            )
        except Exception:
            logger.exception("devportal: could not record the seeding failure")
        return f"failed: {type(exc).__name__}"
