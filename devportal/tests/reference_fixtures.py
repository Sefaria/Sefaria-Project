"""A small reference tree shaped like live's (research/reference/data/sidebar-tree.txt), for the W4 DB tests."""

from django.utils import timezone

from devportal.models import Origin, Page, PageKind, PageRevision, RevisionSource, Section


def make_page(kind, slug, *, parent=None, position=0, title=None, operation_id=None, published=True, **revision):
    page = Page.objects.create(
        section=Section.REFERENCE,
        kind=kind,
        slug=slug,
        parent=parent,
        position=position,
        operation_id=operation_id,
        origin=Origin.IMPORT,
        content_updated_at=timezone.now() if published else None,
    )
    if published:
        rev = PageRevision.objects.create(
            page=page, number=1, source=RevisionSource.IMPORT, title=title or slug, **revision
        )
        page.published_revision = rev
        page.save(update_fields=["published_revision"])
    return page


# (group slug, group title, [(operationId, hidden)])
GROUPS = [
    ("text", "Text", [("get-v3-texts", False), ("get-v1-texts", False), ("get-versions", False)]),
    ("index", "Index", [("get-v2-index", False), ("get-index", False), ("get-shape", False)]),
    ("topic", "Topic", [("get-v2-topics", True), ("get-topic-slug", False), ("get-all-topics", False)]),
    ("index-1", "Index", [("get-author-indexes", False), ("get-index-titles", False)]),
    ("misc", "Misc", [("post-find-refs", False)]),
]


def build_reference_tree():
    """Returns {slug: Page}."""
    pages = {}
    welcome = make_page(PageKind.CATEGORY, "welcome", position=0)
    pages["getting-started"] = make_page(
        PageKind.PAGE, "getting-started", parent=welcome, title="Getting Started With the Sefaria API"
    )
    api = make_page(PageKind.CATEGORY, "Sefaria API", position=1)
    pages["Sefaria API"] = api
    for gpos, (slug, title, ops) in enumerate(GROUPS):
        group = make_page(PageKind.TAG_GROUP, slug, parent=api, position=gpos, title=title)
        pages[slug] = group
        for pos, (op_id, hidden) in enumerate(ops):
            pages[op_id] = make_page(
                PageKind.ENDPOINT, op_id, parent=group, position=pos, operation_id=op_id, title=op_id, hidden=hidden
            )
    return pages
