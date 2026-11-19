"""The editor's business logic (PLAN.md §2.11, contract C3 editor API).

`devportal/views/editor_api.py` parses requests and turns `EditorError` into JSON; everything that touches the
database is here. Shapes follow `devportal/contracts/schemas/editor-*.schema.json` (camelCase on the wire,
snake_case in the models).

Rules worth knowing:

- Revisions are immutable. Saving a draft appends a revision; it needs the number of the newest revision the
  client loaded (`baseRevision`) and answers 409 `revision_conflict` when someone else saved first.
- Endpoint pages are an overlay on docs/openAPI.json: a save keeps the spec-derived fields of the base revision
  and takes only the overlay fields, the free Markdown and the visibility from the client. Nothing is ever written
  to the spec.
- Tree changes (create, move, delete, slug change) bump `PortalState.generation`; a move sends the generation the
  client saw and answers 409 `tree_conflict` when it is stale.
- Every create, move, delete, slug change, publish, restore and upload writes an `EditorAuditLog` row.
- HTML from a client is never stored or rendered: previews and publishes render Markdown on the server.
"""

import hashlib
import io
import re
import unicodedata
from html.parser import HTMLParser

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from devportal.adapters import storage as storage_adapter
from devportal.models import (
    EditorAuditLog,
    MediaAsset,
    Page,
    PageKind,
    PageRevision,
    PortalState,
    Redirect,
    RevisionSource,
    Section,
)
from devportal.models.pages import validate_tree_position
from devportal.services import publish as publish_service

CONTRACT_VERSION = 1

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
# Pillow format name -> (content type, file extension).
UPLOAD_FORMATS = {
    "PNG": ("image/png", "png"),
    "JPEG": ("image/jpeg", "jpg"),
    "GIF": ("image/gif", "gif"),
    "WEBP": ("image/webp", "webp"),
}
SLUG_RE = re.compile(r"^[^/\s?#]+$")
MAX_SLUG = 200
LINK_URL_RE = re.compile(r"^(https?://|mailto:|/)")
ROBOTS = ("index", "noindex")
API_CONFIGS = ("getting-started", "authentication", "my-requests")
NEXT_TYPES = ("basic", "endpoint", "link")
CREATABLE_KINDS = (PageKind.CATEGORY, PageKind.PAGE, PageKind.LINK)


class EditorError(Exception):
    """An error the API turns into a JSON response (`error-response.schema.json`)."""

    def __init__(self, status, code, message, fields=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields


class EditorConflict(Exception):
    """A 409 (`editor-conflict-response.schema.json`)."""

    def __init__(self, code, message, latest=None, generation=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.latest = latest
        self.generation = generation if generation is not None else current_generation()

    def payload(self):
        return {
            "error": {"code": self.code, "message": self.message},
            "latest": self.latest,
            "generation": self.generation,
        }


def slug_taken():
    # 400, not 409: a 409 of the editor API is always an EditorConflictResponse (contract C3).
    return invalid("slug", "Another page in this section has that slug.")


def invalid(field, message):
    return EditorError(400, "invalid_request", message, {field: [message]})


# --- serialization ------------------------------------------------------------------------------------------------


def iso(dt):
    if dt is None:
        return None
    value = timezone.localtime(dt, timezone.UTC) if timezone.is_aware(dt) else dt
    return value.isoformat().replace("+00:00", "Z")


def current_generation():
    return PortalState.load().generation


def user_ref(user):
    if user is None:
        return None
    name = (user.get_full_name() or "").strip() if hasattr(user, "get_full_name") else ""
    return {"id": user.pk, "name": name or user.get_username()}


def newest_revision(page):
    return page.revisions.order_by("-number").first()


def revision_summary(page, revision):
    if revision is None:
        return None
    return {
        "number": revision.number,
        "source": revision.source,
        "author": user_ref(revision.author),
        "createdAt": iso(revision.created_at),
        "title": revision.title,
        "isPublished": page.published_revision_id == revision.pk,
        "isDraft": page.draft_revision_id == revision.pk,
    }


def page_summary(page):
    return {
        "id": page.pk,
        "section": page.section,
        "kind": page.kind,
        "slug": None if page.kind == PageKind.CATEGORY else page.slug,
        "parentId": page.parent_id,
        "position": page.position,
        "operationId": page.operation_id,
        "path": page.url_path,
        "publishedRevision": page.published_revision.number if page.published_revision_id else None,
        "draftRevision": page.draft_revision.number if page.draft_revision_id else None,
        "contentUpdatedAt": iso(page.content_updated_at),
    }


def _metadata(value):
    value = value if isinstance(value, dict) else {}
    robots = value.get("robots")
    return {
        "title": value.get("title") if isinstance(value.get("title"), str) else "",
        "description": value.get("description") if isinstance(value.get("description"), str) else "",
        "robots": robots if robots in ROBOTS else "index",
    }


def _next(value):
    value = value if isinstance(value, dict) else {}
    pages = []
    for item in value.get("pages") or []:
        if not isinstance(item, dict) or not item.get("slug"):
            continue
        kind = item.get("type") if item.get("type") in NEXT_TYPES else "basic"
        pages.append({"type": kind, "slug": str(item["slug"]), "title": str(item.get("title") or "")})
    description = value.get("description") if isinstance(value.get("description"), str) else ""
    return {"description": description, "pages": pages}


def revision_content(page, revision):
    """`revisionContent` of a revision (or the defaults of a page that has none)."""
    if revision is None:
        revision = PageRevision(title=page.slug)
    endpoint = None
    if page.kind == PageKind.ENDPOINT:
        endpoint = {
            "sidebarLabel": revision.sidebar_label or None,
            "titleOverride": revision.title_override or None,
            "descriptionOverrideMd": revision.description_override_md or None,
        }
    return {
        "title": revision.title,
        "excerpt": revision.excerpt,
        "bodyMd": revision.body_md,
        "hidden": revision.hidden,
        "deprecated": revision.deprecated,
        "metadata": _metadata(revision.metadata),
        "next": _next(revision.next),
        "linkUrl": revision.link_url or None,
        "linkNewTab": revision.link_new_tab,
        "fullscreen": revision.fullscreen,
        "apiConfig": revision.api_config if revision.api_config in API_CONFIGS else None,
        "endpoint": endpoint,
    }


def spec_info(page):
    """What the spec says about an endpoint, shown read-only. None for other kinds or an unknown operation."""
    if page.kind != PageKind.ENDPOINT or not page.operation_id:
        return None
    try:
        from devportal.spec import load_spec  # noqa: PLC0415 - keeps this module importable without the spec file

        operation = load_spec().operation(page.operation_id)
    except (OSError, ValueError):
        operation = None
    if operation is None:
        return None
    return {
        "method": operation.method,
        "path": operation.path,
        "title": operation.title,
        "description": operation.description,
        "tags": list(operation.tags),
        "deprecated": operation.deprecated,
    }


def editor_page(page):
    revision = page.current_revision()
    return {
        "contractVersion": CONTRACT_VERSION,
        "page": page_summary(page),
        "revision": revision_summary(page, revision),
        "content": revision_content(page, revision),
        "spec": spec_info(page),
    }


# --- tree ---------------------------------------------------------------------------------------------------------


def _operations():
    try:
        from devportal.adapters import spec as spec_adapter  # noqa: PLC0415

        return spec_adapter.operation_index()
    except OSError:
        return {}


def _tree_title(page, revision):
    if revision is None:
        return page.slug
    if page.kind == PageKind.ENDPOINT:
        return revision.sidebar_label or revision.title_override or revision.title or page.slug
    return revision.title or page.slug


def tree(section):
    """The editor's tree of a section, hidden and unpublished pages included, deleted ones left out."""
    section = parse_section(section)
    pages = list(
        Page.objects.filter(section=section, deleted_at__isnull=True)
        .select_related("published_revision", "draft_revision")
        .order_by("position", "id")
    )
    children = {}
    for page in pages:
        children.setdefault(page.parent_id, []).append(page)
    ops = _operations() if section == Section.REFERENCE else {}

    def node(page):
        revision = page.current_revision()
        op = ops.get(page.operation_id) or {}
        return {
            "id": page.pk,
            "kind": page.kind,
            "title": _tree_title(page, revision),
            "slug": None if page.kind == PageKind.CATEGORY else page.slug,
            "hidden": bool(revision and revision.hidden),
            "deprecated": bool(revision and revision.deprecated) or bool(op.get("deprecated")),
            "hasDraft": page.draft_revision_id is not None,
            "isPublished": page.published_revision_id is not None,
            "method": op.get("method") or None,
            "operationId": page.operation_id,
            "children": [node(child) for child in children.get(page.pk, [])],
        }

    known = {p.pk for p in pages}
    roots = [p for p in pages if p.parent_id is None or p.parent_id not in known]
    return {
        "contractVersion": CONTRACT_VERSION,
        "section": section,
        "generation": current_generation(),
        "nodes": [node(page) for page in roots],
    }


def parse_section(value):
    if value not in Section.values:
        raise EditorError(404, "not_found", f"No section {value!r}.")
    return value


# --- pages --------------------------------------------------------------------------------------------------------


def get_page(page_id):
    page = (
        Page.objects.select_related("published_revision", "draft_revision", "parent")
        .filter(pk=page_id, deleted_at__isnull=True)
        .first()
    )
    if page is None:
        raise EditorError(404, "not_found", "No such page.")
    return page


def slug_from_title(title):
    """A URL slug from a title: lower case, letters and digits kept (any script), runs of others become `-`."""
    text = unicodedata.normalize("NFKC", title).lower()
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        out.append(ch if cat[0] in ("L", "N") or ch in "_" else "-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug[:MAX_SLUG] or "page"


def _unique_slug(section, base, exclude_id=None):
    slug, n = base, 1
    while _slug_taken(section, slug, exclude_id):
        n += 1
        suffix = f"-{n}"
        slug = base[: MAX_SLUG - len(suffix)] + suffix
    return slug


def _slug_taken(section, slug, exclude_id=None):
    qs = Page.objects.filter(section=section, slug=slug).exclude(kind=PageKind.CATEGORY)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


def validate_slug(value, field="slug"):
    if not isinstance(value, str) or not value or len(value) > MAX_SLUG or not SLUG_RE.match(value):
        raise invalid(field, "A slug is 1 to 200 characters with no slash, whitespace, ? or #.")
    return unicodedata.normalize("NFC", value)


def _siblings(section, parent_id, exclude_id=None):
    qs = Page.objects.filter(section=section, parent_id=parent_id, deleted_at__isnull=True)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return list(qs.order_by("position", "id"))


def _renumber(pages):
    for index, page in enumerate(pages):
        if page.position != index:
            page.position = index
            Page.objects.filter(pk=page.pk).update(position=index)


def _audit(user, action, page, **details):
    EditorAuditLog.objects.create(
        user=user if getattr(user, "pk", None) else None,
        action=action,
        page=page,
        section=page.section if page is not None else "",
        path=(page.url_path or f"category:{page.slug}") if page is not None else "",
        details=details,
    )


def _tree_changed():
    publish_service.bump_generation()
    publish_service.schedule_rebuild()


def _parent(section, parent_id):
    if parent_id is None:
        return None
    if not isinstance(parent_id, int) or isinstance(parent_id, bool):
        raise invalid("parentId", "parentId must be an id or null.")
    parent = Page.objects.filter(pk=parent_id, deleted_at__isnull=True).first()
    if parent is None:
        raise EditorError(422, "invalid_move", "The parent page does not exist.", {"parentId": ["No such page."]})
    if parent.section != section:
        raise EditorError(422, "invalid_move", "A page and its parent must be in the same section.")
    return parent


def create_page(user, data):
    """`EditorPageCreateRequest` -> the new page (with a first draft revision holding its title)."""
    data = _object(data)
    section = data.get("section")
    if section not in Section.values:
        raise invalid("section", "Unknown section.")
    kind = data.get("kind")
    if kind not in CREATABLE_KINDS:
        raise invalid("kind", "Only categories, pages and links can be created; endpoints come from the spec.")
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        raise invalid("title", "A title is required.")
    title = title.strip()
    position = data.get("position")
    if position is not None and (not isinstance(position, int) or isinstance(position, bool) or position < 0):
        raise invalid("position", "position must be a non-negative integer or null.")
    raw_slug = data.get("slug")
    if kind == PageKind.CATEGORY:
        slug = slug_from_title(title)
    elif raw_slug is None:
        slug = _unique_slug(section, slug_from_title(title))
    else:
        slug = validate_slug(raw_slug)
        if _slug_taken(section, slug):
            raise slug_taken()

    with transaction.atomic():
        parent = _parent(section, data.get("parentId"))
        page = Page(section=section, kind=kind, slug=slug, parent=parent, origin="editor")
        try:
            validate_tree_position(page, parent)
        except ValidationError as exc:
            raise EditorError(422, "invalid_move", " ".join(exc.messages)) from exc
        siblings = _siblings(section, parent.pk if parent else None)
        index = len(siblings) if position is None else min(position, len(siblings))
        page.position = index
        try:
            page.save()
        except IntegrityError as exc:
            raise slug_taken() from exc
        siblings.insert(index, page)
        _renumber(siblings)
        publish_service.create_revision(page, source=RevisionSource.EDITOR, author=_author(user), title=title)
        _audit(user, EditorAuditLog.Action.CREATE, page, kind=kind, parent=page.parent_id, position=index)
        _tree_changed()
    return get_page(page.pk)


def _author(user):
    return user if getattr(user, "pk", None) else None


def _object(data):
    if not isinstance(data, dict):
        raise EditorError(400, "invalid_request", "The request body must be a JSON object.")
    return data


def _string(content, key, *, required=True, allow_null=False):
    value = content.get(key)
    if value is None and (allow_null or not required):
        return None
    if not isinstance(value, str):
        raise invalid(key, f"{key} must be a string.")
    return value


def _bool(content, key):
    value = content.get(key)
    if not isinstance(value, bool):
        raise invalid(key, f"{key} must be true or false.")
    return value


def content_fields(page, content, base):
    """Validate a `revisionContent` and map it to PageRevision fields.

    Endpoint pages take only the overlay, the free Markdown and the visibility from the client; everything the
    spec owns is copied from the base revision.
    """
    content = _object(content)
    body_md = _string(content, "bodyMd")
    hidden = _bool(content, "hidden")
    if page.kind == PageKind.ENDPOINT:
        overlay = content.get("endpoint")
        if not isinstance(overlay, dict):
            raise invalid("endpoint", "An endpoint page needs its overlay object.")
        label = _string(overlay, "sidebarLabel", allow_null=True)
        title_override = _string(overlay, "titleOverride", allow_null=True)
        description = _string(overlay, "descriptionOverrideMd", allow_null=True)
        values = publish_service.content_of(base) if base is not None else {"title": page.operation_id or page.slug}
        values.update(
            body_md=body_md,
            hidden=hidden,
            sidebar_label=(label or "").strip(),
            title_override=(title_override or "").strip(),
            description_override_md=description or "",
        )
        return values

    title = _string(content, "title")
    if not title.strip():
        raise invalid("title", "A title is required.")
    link_url = _string(content, "linkUrl", allow_null=True) or ""
    if link_url and not LINK_URL_RE.match(link_url):
        raise invalid("linkUrl", "A link must start with http://, https://, mailto: or /.")
    if page.kind == PageKind.LINK and not link_url:
        raise invalid("linkUrl", "A link page needs a URL.")
    metadata = content.get("metadata")
    if not isinstance(metadata, dict):
        raise invalid("metadata", "metadata must be an object.")
    robots = metadata.get("robots", "index")
    if robots not in ROBOTS:
        raise invalid("metadata", "robots must be index or noindex.")
    next_ = content.get("next")
    if not isinstance(next_, dict) or not isinstance(next_.get("pages", []), list):
        raise invalid("next", "next must be an object with a pages list.")
    for item in next_.get("pages", []):
        if not isinstance(item, dict) or item.get("type") not in NEXT_TYPES or not item.get("slug"):
            raise invalid("next", "Each next page needs a type (basic, endpoint, link) and a slug.")
    api_config = content.get("apiConfig")
    if api_config is not None and api_config not in API_CONFIGS:
        raise invalid("apiConfig", "Unknown apiConfig.")
    return {
        "title": title.strip(),
        "excerpt": _string(content, "excerpt"),
        "body_md": body_md,
        "hidden": hidden,
        "deprecated": _bool(content, "deprecated"),
        "metadata": {
            "title": str(metadata.get("title") or ""),
            "description": str(metadata.get("description") or ""),
            "robots": robots,
        },
        "next": {
            "description": str(next_.get("description") or ""),
            "pages": [
                {"type": p["type"], "slug": str(p["slug"]), "title": str(p.get("title") or "")}
                for p in next_.get("pages", [])
            ],
        },
        "link_url": link_url,
        "link_new_tab": _bool(content, "linkNewTab"),
        "fullscreen": _bool(content, "fullscreen"),
        "api_config": api_config or "",
        "sidebar_label": "",
        "title_override": "",
        "description_override_md": "",
    }


def _check_base(page, base_number):
    newest = newest_revision(page)
    newest_number = newest.number if newest else None
    if base_number is not None and (not isinstance(base_number, int) or isinstance(base_number, bool)):
        raise invalid("baseRevision", "baseRevision must be a revision number or null.")
    if base_number != newest_number:
        raise EditorConflict(
            "revision_conflict",
            "Someone saved this page after you opened it. Reload to see their changes.",
            latest=revision_summary(page, newest),
        )
    return newest


def save_draft(user, page_id, data):
    """`EditorDraftSaveRequest` -> `EditorDraftSaveResponse`."""
    data = _object(data)
    with transaction.atomic():
        page = Page.objects.select_for_update().get(pk=get_page(page_id).pk)
        base = _check_base(page, data.get("baseRevision"))
        values = content_fields(page, data.get("content"), base)
        revision = publish_service.create_revision(page, source=RevisionSource.EDITOR, author=_author(user), **values)
    page = get_page(page.pk)
    return {
        "contractVersion": CONTRACT_VERSION,
        "page": page_summary(page),
        "revision": revision_summary(page, revision),
    }


def publish(user, page_id, data, origin):
    """`EditorPublishRequest` -> `EditorPublishResponse`. Only the newest revision can be published."""
    data = _object(data)
    number = data.get("revision")
    if not isinstance(number, int) or isinstance(number, bool):
        raise invalid("revision", "revision must be a revision number.")
    with transaction.atomic():
        page = Page.objects.select_for_update().get(pk=get_page(page_id).pk)
        newest = newest_revision(page)
        if newest is None or newest.number != number:
            raise EditorConflict(
                "revision_conflict",
                "A newer revision exists. Reload before publishing.",
                latest=revision_summary(page, newest),
            )
        page = get_page(page.pk)
        publish_service.publish(page, newest)
        _audit(user, EditorAuditLog.Action.PUBLISH, page, revision=newest.number)
    page = get_page(page.pk)
    revision = page.published_revision
    path = page.url_path or ""
    return {
        "contractVersion": CONTRACT_VERSION,
        "page": page_summary(page),
        "revision": revision_summary(page, revision),
        "generation": current_generation(),
        "url": f"{origin}{path}" if path else origin + "/",
    }


def revisions(page_id):
    page = get_page(page_id)
    return {
        "contractVersion": CONTRACT_VERSION,
        "pageId": page.pk,
        "revisions": [
            revision_summary(page, rev) for rev in page.revisions.select_related("author").order_by("-number")
        ],
    }


def restore(user, page_id, number, data):
    """Copy revision `number` into a new draft (`EditorRestoreRequest` -> `EditorDraftSaveResponse`)."""
    data = _object(data)
    with transaction.atomic():
        page = Page.objects.select_for_update().get(pk=get_page(page_id).pk)
        if not page.revisions.filter(number=number).exists():
            raise EditorError(404, "not_found", f"Revision {number} does not exist.")
        _check_base(page, data.get("baseRevision"))
        revision = publish_service.restore(page, number, author=_author(user))
        _audit(user, EditorAuditLog.Action.RESTORE, page, restored=number, revision=revision.number)
    page = get_page(page.pk)
    return {
        "contractVersion": CONTRACT_VERSION,
        "page": page_summary(page),
        "revision": revision_summary(page, revision),
    }


def change_settings(user, page_id, data):
    """`EditorPageSettingsRequest`: the slug. A change leaves a 301 from the old path."""
    data = _object(data)
    if set(data) - {"slug"}:
        raise invalid(sorted(set(data) - {"slug"})[0], "Only the slug can be changed here.")
    slug = validate_slug(data.get("slug"))
    with transaction.atomic():
        page = Page.objects.select_for_update().get(pk=get_page(page_id).pk)
        if page.kind in (PageKind.CATEGORY, PageKind.ENDPOINT, PageKind.API_CONFIG):
            raise invalid("slug", f"The slug of a {page.kind} cannot be changed in the editor.")
        if slug == page.slug:
            return editor_page(get_page(page.pk))
        if _slug_taken(page.section, slug, exclude_id=page.pk):
            raise slug_taken()
        old_path = page.url_path
        page.slug = slug
        page.save(update_fields=["slug", "updated_at"])
        new_path = page.url_path
        _redirect_slug_change(old_path, new_path)
        _audit(user, EditorAuditLog.Action.CHANGE_SLUG, page, old=old_path, new=new_path)
        _tree_changed()
    return editor_page(get_page(page.pk))


def _redirect_slug_change(old_path, new_path):
    """301 old -> new; earlier redirects to the old path now point at the new one; none may shadow the new path."""
    Redirect.objects.filter(from_path=new_path).delete()
    Redirect.objects.filter(to_path=old_path).update(to_path=new_path)
    Redirect.objects.update_or_create(
        from_path=old_path,
        defaults={"to_path": new_path, "status": Redirect.Status.MOVED_PERMANENTLY, "reason": "slug_change"},
    )


def move(user, page_id, data):
    """`EditorMoveRequest` -> the section's tree. Validated by the model's tree rules."""
    data = _object(data)
    position = data.get("position")
    if not isinstance(position, int) or isinstance(position, bool) or position < 0:
        raise invalid("position", "position must be a non-negative integer.")
    base_generation = data.get("baseGeneration")
    if not isinstance(base_generation, int) or isinstance(base_generation, bool):
        raise invalid("baseGeneration", "baseGeneration must be the tree generation you saw.")
    with transaction.atomic():
        state = PortalState.load()
        PortalState.objects.select_for_update().filter(pk=state.pk).first()
        page = Page.objects.select_for_update().get(pk=get_page(page_id).pk)
        if base_generation != current_generation():
            raise EditorConflict("tree_conflict", "The page tree changed since you loaded it. Reload and try again.")
        parent = _parent(page.section, data.get("parentId"))
        try:
            validate_tree_position(page, parent)
        except ValidationError as exc:
            raise EditorError(422, "invalid_move", " ".join(exc.messages)) from exc
        from_parent, from_position = page.parent_id, page.position
        new_parent_id = parent.pk if parent else None
        if from_parent != new_parent_id:
            _renumber(_siblings(page.section, from_parent, exclude_id=page.pk))
        siblings = _siblings(page.section, new_parent_id, exclude_id=page.pk)
        index = min(position, len(siblings))
        page.parent = parent
        page.save(update_fields=["parent", "updated_at"])
        siblings.insert(index, page)
        page.position = -1  # force the write in _renumber
        _renumber(siblings)
        _audit(
            user,
            EditorAuditLog.Action.MOVE,
            page,
            from_parent=from_parent,
            from_position=from_position,
            to_parent=new_parent_id,
            to_position=index,
        )
        _tree_changed()
    return tree(page.section)


def delete(user, page_id):
    """Soft delete -> the section's tree. Endpoints come from the spec and cannot be deleted here."""
    with transaction.atomic():
        page = Page.objects.select_for_update().get(pk=get_page(page_id).pk)
        if page.kind in (PageKind.ENDPOINT, PageKind.API_CONFIG, PageKind.TAG_GROUP):
            raise EditorError(400, "invalid_request", f"A {page.kind} page cannot be deleted in the editor.")
        if page.children.filter(deleted_at__isnull=True).exists():
            raise EditorError(400, "invalid_request", "Move or delete this page's children first.")
        publish_service.soft_delete(page)
        _renumber(_siblings(page.section, page.parent_id))
        _audit(user, EditorAuditLog.Action.DELETE, page)
    return tree(page.section)


# --- preview ------------------------------------------------------------------------------------------------------


class _Inventory(HTMLParser):
    """Counts tags and (tag, attribute) pairs of an HTML fragment."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = {}
        self.attrs = {}

    def handle_starttag(self, tag, attrs):
        self.tags[tag] = self.tags.get(tag, 0) + 1
        for name, _value in attrs:
            key = (tag, name)
            self.attrs[key] = self.attrs.get(key, 0) + 1

    handle_startendtag = handle_starttag


def _inventory(html):
    parser = _Inventory()
    parser.feed(html)
    parser.close()
    return parser


def sanitizer_removals(raw_html, clean_html):
    """Human-readable notes on what the sanitizer took out: tags and attributes, with counts."""
    before, after = _inventory(raw_html), _inventory(clean_html)
    notes = []
    for tag, count in sorted(before.tags.items()):
        gone = count - after.tags.get(tag, 0)
        if gone > 0:
            notes.append(f"Removed <{tag}> ({gone})")
    for (tag, name), count in sorted(before.attrs.items()):
        if (tag, name) == ("iframe", "sandbox"):
            continue  # always replaced by the fixed value
        gone = count - after.attrs.get((tag, name), 0)
        if gone > 0 and after.tags.get(tag, 0):
            notes.append(f"Removed attribute {name} on <{tag}> ({gone})")
    return notes


def preview(data):
    """`EditorPreviewRequest` -> `EditorPreviewResponse`: the server's rendering of unsaved Markdown."""
    data = _object(data)
    content = _object(data.get("content"))
    body_md = _string(content, "bodyMd")
    title = content.get("title") if isinstance(content.get("title"), str) else ""
    excerpt = content.get("excerpt") if isinstance(content.get("excerpt"), str) else ""
    page_id = data.get("pageId")
    revision_key = "0"
    if isinstance(page_id, int) and not isinstance(page_id, bool):
        page = Page.objects.filter(pk=page_id).select_related("draft_revision", "published_revision").first()
        revision = page.current_revision() if page else None
        if revision is not None:
            revision_key = str(revision.pk)  # HTMLBlock frames are keyed by the revision's primary key
    import devportal.markdown as dpmd  # noqa: PLC0415

    raw = dpmd.render(body_md, revision=revision_key, sanitize_output=False)
    clean_html = dpmd.sanitize(raw.html)
    return {
        "contractVersion": CONTRACT_VERSION,
        "title": title,
        "excerpt": excerpt,
        "bodyHtml": clean_html,
        "toc": [entry for entry in raw.toc if entry.get("level") in (2, 3) and entry.get("id")],
        "sanitizerRemovals": sanitizer_removals(raw.html, clean_html),
    }


# --- uploads ------------------------------------------------------------------------------------------------------


def _safe_stem(filename):
    stem = (filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    stem = stem.rsplit(".", 1)[0] if "." in stem else stem
    stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii").lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")[:60]
    return stem or "image"


def decode_image(data, claimed_type):
    """Decode with Pillow. Returns (content_type, extension, width, height); raises EditorError when the bytes are
    not a PNG, JPEG, GIF or WebP image, or not the type the client declared."""
    from PIL import Image, UnidentifiedImageError  # noqa: PLC0415

    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            width, height = image.size
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise EditorError(415, "unsupported_media_type", "The file is not a PNG, JPEG, GIF or WebP image.") from exc
    if fmt not in UPLOAD_FORMATS:
        raise EditorError(415, "unsupported_media_type", "Only PNG, JPEG, GIF and WebP images can be uploaded.")
    content_type, extension = UPLOAD_FORMATS[fmt]
    claimed = (claimed_type or "").split(";", 1)[0].strip().lower()
    if claimed == "image/jpg":
        claimed = "image/jpeg"
    if claimed != content_type:
        raise EditorError(
            415, "unsupported_media_type", f"The file's bytes are {content_type}, but it was sent as {claimed or '?'}."
        )
    return content_type, extension, width, height


def media_asset_ref(asset, origin=""):
    url = asset.url
    if url.startswith("/") and not url.startswith("//"):
        url = origin + url  # the local backend (development) stores paths; the contract wants absolute URLs
    return {
        "id": asset.pk,
        "url": url,
        "contentType": asset.content_type,
        "size": asset.size,
        "width": asset.width or 1,
        "height": asset.height or 1,
        "sha256": asset.sha256,
    }


def upload(user, uploaded, origin=""):
    """Store an image under `developers/<sha256-prefix>-<name>.<ext>`. Returns (EditorUploadResponse, created)."""
    if uploaded is None:
        raise invalid("file", "Send the image in a multipart part named file.")
    if uploaded.size is not None and uploaded.size > MAX_UPLOAD_BYTES:
        raise EditorError(413, "file_too_large", "Images can be at most 5 MB.")
    data = uploaded.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise EditorError(413, "file_too_large", "Images can be at most 5 MB.")
    if not data:
        raise invalid("file", "The file is empty.")
    content_type, extension, width, height = decode_image(data, uploaded.content_type)
    sha = hashlib.sha256(data).hexdigest()
    existing = MediaAsset.objects.filter(sha256=sha, source_url__isnull=True).first()
    if existing is not None:
        return {
            "contractVersion": CONTRACT_VERSION,
            "asset": media_asset_ref(existing, origin),
            "created": False,
        }, False
    name = f"{storage_adapter.PREFIX}{sha[:16]}-{_safe_stem(uploaded.name)}.{extension}"
    storage = storage_adapter.get_storage()
    url = storage.save(name, data, content_type)
    asset = MediaAsset.objects.create(
        gcs_path=name,
        url=url,
        content_type=content_type,
        size=len(data),
        width=width,
        height=height,
        sha256=sha,
        uploaded_by=_author(user),
    )
    EditorAuditLog.objects.create(
        user=_author(user),
        action=EditorAuditLog.Action.UPLOAD,
        details={"asset": asset.pk, "path": name, "sha256": sha, "size": len(data)},
    )
    return {"contractVersion": CONTRACT_VERSION, "asset": media_asset_ref(asset, origin), "created": True}, True


# Re-exported for the views.
__all__ = [
    "EditorConflict",
    "EditorError",
    "change_settings",
    "create_page",
    "delete",
    "editor_page",
    "get_page",
    "move",
    "preview",
    "publish",
    "restore",
    "revisions",
    "save_draft",
    "tree",
    "upload",
]
