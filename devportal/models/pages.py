"""The page tree and its immutable revisions (contract C2, PLAN.md §2.3.3)."""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Section(models.TextChoices):
    """The three navigation trees. Each value is also the URL prefix (`/docs/`, `/reference/`, `/page/`)."""

    DOCS = "docs", "Docs"
    REFERENCE = "reference", "API Reference"
    PAGE = "page", "Custom pages"


class PageKind(models.TextChoices):
    CATEGORY = "category", "Category"  # a sidebar heading such as "TECHNICAL DOCS"; no URL
    PAGE = "page", "Page"
    LINK = "link", "Link"  # a sidebar entry that points elsewhere (revision.link_url)
    TAG_GROUP = "tag_group", "Tag group"  # e.g. `text`, `index`, `index-1`; answers 302 to its first visible child
    ENDPOINT = "endpoint", "Endpoint"  # one OpenAPI operation; the row is the editor overlay
    API_CONFIG = "api_config", "API config"  # the three hidden ReadMe `ReadMeConfig` stubs


class Origin(models.TextChoices):
    IMPORT = "import", "Import"
    EDITOR = "editor", "Editor"


class RevisionSource(models.TextChoices):
    IMPORT = "import", "Import"
    EDITOR = "editor", "Editor"
    RESTORE = "restore", "Restore"


class Page(models.Model):
    """One node of a navigation tree.

    Content lives on `PageRevision`. The public site reads only `published_revision`; a page
    without one is a 404. Tree position (parent, position) is not versioned; moves are recorded
    in `EditorAuditLog`. Maximum depth is a category plus three levels (validated by the editor
    and the import, not by the database).
    """

    MAX_DEPTH = 4

    section = models.CharField(max_length=16, choices=Section.choices)
    kind = models.CharField(max_length=16, choices=PageKind.choices)
    # Unicode and case-sensitive, as on live. Unique per section among rows that are not
    # categories (constraint below). For a category it is the source folder name.
    slug = models.CharField(max_length=255)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="children",
    )
    position = models.PositiveIntegerField(default=0)
    # Set only for endpoints (constraint below).
    operation_id = models.CharField(max_length=255, null=True, blank=True, unique=True)

    published_revision = models.ForeignKey(
        "PageRevision",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    draft_revision = models.ForeignKey(
        "PageRevision",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # Feeds "Updated N ago": ReadMe's `updatedAt` at import, then each publish.
    content_updated_at = models.DateTimeField(null=True, blank=True)

    # Endpoints only: hash of the operation's slice of docs/openAPI.json, and when it last changed.
    spec_slice_sha = models.CharField(max_length=64, blank=True, default="")
    spec_updated_at = models.DateTimeField(null=True, blank=True)

    # Lets the re-import tell whether staff edited a page in the editor (PLAN.md §7.2).
    origin = models.CharField(max_length=16, choices=Origin.choices, default=Origin.EDITOR)
    origin_path = models.CharField(max_length=1024, blank=True, default="")
    origin_body_sha = models.CharField(max_length=64, blank=True, default="")

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["section", "position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["section", "slug"],
                condition=~Q(kind="category"),
                name="devportal_page_slug_unique_per_section",
            ),
            models.CheckConstraint(
                condition=Q(kind="endpoint") | Q(operation_id__isnull=True),
                name="devportal_page_operation_id_only_endpoint",
            ),
        ]
        indexes = [
            models.Index(fields=["section", "parent", "position"], name="devportal_page_tree_idx"),
        ]

    def __str__(self):
        return f"{self.section}/{self.slug} ({self.kind})"

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    @property
    def url_path(self):
        """The page's path on the developers host, or None for a kind that has no URL."""
        if self.kind == PageKind.CATEGORY:
            return None
        return f"/{self.section}/{self.slug}"

    @property
    def depth(self):
        """1 for a root row (a category, or a custom page), 2 for its child, and so on."""
        depth, node, seen = 1, self.parent, set()
        while node is not None:
            if node.pk in seen:
                break
            seen.add(node.pk)
            depth += 1
            node = node.parent
        return depth

    def subtree_height(self):
        """1 for a leaf, 2 for a page with children, and so on (non-deleted rows only)."""
        children = list(self.children.filter(deleted_at__isnull=True)) if self.pk else []
        return 1 + max((c.subtree_height() for c in children), default=0)

    def clean(self):
        super().clean()
        validate_tree_position(self, self.parent)

    def current_revision(self):
        """The revision the editor opens: the pending draft if any, else the published one."""
        return self.draft_revision or self.published_revision


# Which parent kinds each kind may have (None: a root row). PLAN.md §2.3.3, §2.11.
ALLOWED_PARENT_KINDS = {
    PageKind.CATEGORY: {None},
    PageKind.PAGE: {PageKind.CATEGORY, PageKind.PAGE},
    PageKind.LINK: {PageKind.CATEGORY, PageKind.PAGE},
    PageKind.TAG_GROUP: {PageKind.CATEGORY},
    PageKind.ENDPOINT: {PageKind.TAG_GROUP},
    PageKind.API_CONFIG: {PageKind.CATEGORY},
}
# Custom pages are one flat list with no category.
SECTION_KINDS = {
    Section.DOCS: {PageKind.CATEGORY, PageKind.PAGE, PageKind.LINK},
    Section.REFERENCE: set(PageKind),
    Section.PAGE: {PageKind.PAGE, PageKind.LINK},
}


def validate_tree_position(page, parent):
    """Raise `ValidationError` unless `page` may sit under `parent` (None for a root row).

    Rules: the parent is in the same section and not deleted; the parent's kind is allowed for
    the page's kind; custom pages are flat; no cycles; the deepest row of the page's subtree stays
    within `Page.MAX_DEPTH` (a category plus three levels).
    """
    from django.core.exceptions import ValidationError

    if page.kind not in SECTION_KINDS.get(page.section, set()):
        msg = f"A {page.kind} cannot be in section {page.section!r}."
        raise ValidationError(msg)
    parent_kind = parent.kind if parent is not None else None
    if page.section == Section.PAGE and parent is not None:
        msg = "Custom pages are a flat list; they have no parent."
        raise ValidationError(msg)
    if page.section != Section.PAGE and page.kind != PageKind.CATEGORY and parent is None:
        msg = f"A {page.kind} in {page.section} must have a parent."
        raise ValidationError(msg)
    if page.section != Section.PAGE and parent_kind not in ALLOWED_PARENT_KINDS[page.kind]:
        msg = f"A {page.kind} cannot be placed under a {parent_kind or 'root'}."
        raise ValidationError(msg)
    if parent is None:
        depth = 1
    else:
        if parent.section != page.section:
            msg = "A page and its parent must be in the same section."
            raise ValidationError(msg)
        if parent.deleted_at is not None:
            msg = "The parent page is deleted."
            raise ValidationError(msg)
        node = parent
        while node is not None:
            if page.pk is not None and node.pk == page.pk:
                msg = "A page cannot be moved under itself."
                raise ValidationError(msg)
            node = node.parent
        depth = parent.depth + 1
    if depth + page.subtree_height() - 1 > Page.MAX_DEPTH:
        msg = f"The tree would be deeper than {Page.MAX_DEPTH} levels (a category plus three)."
        raise ValidationError(msg)


class PageRevision(models.Model):
    """An immutable snapshot of a page's content. Restoring creates a new revision."""

    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="revisions")
    number = models.PositiveIntegerField()
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )  # null for imports
    source = models.CharField(max_length=16, choices=RevisionSource.choices)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    # Content (front matter fields of the source files, plus the body).
    title = models.CharField(max_length=500)
    excerpt = models.TextField(blank=True, default="")
    body_md = models.TextField(blank=True, default="")
    hidden = models.BooleanField(default=False)
    deprecated = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)  # {"title", "description", "robots"}
    next = models.JSONField(default=dict, blank=True)  # {"description", "pages": [...]}
    link_url = models.CharField(max_length=2048, blank=True, default="")
    link_new_tab = models.BooleanField(default=False)
    fullscreen = models.BooleanField(default=False)
    api_config = models.CharField(max_length=64, blank=True, default="")

    # Endpoint overlay. Nothing here is ever written back to docs/openAPI.json.
    sidebar_label = models.CharField(max_length=500, blank=True, default="")
    title_override = models.CharField(max_length=500, blank=True, default="")
    description_override_md = models.TextField(blank=True, default="")

    # Rendered output, cached on the revision by the publish pipeline.
    rendered_html = models.TextField(blank=True, default="")
    rendered_toc = models.JSONField(default=list, blank=True)
    search_text = models.TextField(blank=True, default="")
    renderer_version = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        ordering = ["page", "number"]
        constraints = [
            models.UniqueConstraint(fields=["page", "number"], name="devportal_revision_number_unique_per_page"),
        ]

    def __str__(self):
        return f"{self.page} r{self.number}"
