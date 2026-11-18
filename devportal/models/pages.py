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
