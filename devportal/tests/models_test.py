"""Model rules (PLAN.md §5.3 "Models"): slugs, tree shape, draft/publish/restore, soft delete."""

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from devportal.models import Page, PageKind, PageRevision, PortalState, RevisionSource, Section
from devportal.models.pages import validate_tree_position
from devportal.services import nav, publish

pytestmark = pytest.mark.django_db


def make(section, kind, slug, parent=None, title=None, **content):
    page = Page.objects.create(section=section, kind=kind, slug=slug, parent=parent)
    revision = publish.create_revision(page, source=RevisionSource.IMPORT, title=title or slug, **content)
    publish.publish(page, revision, rebuild=False)
    return page


# --- slugs --------------------------------------------------------------------------------------


def test_slug_is_unique_per_section():
    cat = make(Section.DOCS, PageKind.CATEGORY, "Guides")
    make(Section.DOCS, PageKind.PAGE, "welcome", cat)
    with pytest.raises(IntegrityError), transaction.atomic():
        Page.objects.create(section=Section.DOCS, kind=PageKind.PAGE, slug="welcome", parent=cat)


def test_same_slug_in_another_section_is_fine():
    make(Section.DOCS, PageKind.PAGE, "intro", make(Section.DOCS, PageKind.CATEGORY, "A"))
    make(Section.REFERENCE, PageKind.PAGE, "intro", make(Section.REFERENCE, PageKind.CATEGORY, "B"))
    make(Section.PAGE, PageKind.PAGE, "intro")
    assert Page.objects.filter(slug="intro").count() == 3


def test_slugs_are_case_sensitive_and_categories_are_exempt():
    cat = make(Section.DOCS, PageKind.CATEGORY, "welcome")
    make(Section.DOCS, PageKind.PAGE, "welcome", cat)  # a category does not hold its slug
    make(Section.DOCS, PageKind.PAGE, "Welcome", cat)
    make(Section.DOCS, PageKind.CATEGORY, "welcome")  # nor do categories clash with each other


def test_operation_id_only_on_endpoints():
    cat = make(Section.REFERENCE, PageKind.CATEGORY, "API")
    with pytest.raises(IntegrityError), transaction.atomic():
        Page.objects.create(section=Section.REFERENCE, kind=PageKind.PAGE, slug="x", parent=cat, operation_id="get-x")


# --- tree shape ---------------------------------------------------------------------------------


def _new(section, kind, slug="new"):
    return Page(section=section, kind=kind, slug=slug)


def test_parent_kind_rules():
    docs_cat = make(Section.DOCS, PageKind.CATEGORY, "Docs")
    ref_cat = make(Section.REFERENCE, PageKind.CATEGORY, "Sefaria API")
    group = make(Section.REFERENCE, PageKind.TAG_GROUP, "text", ref_cat)
    # Allowed.
    validate_tree_position(_new(Section.DOCS, PageKind.PAGE), docs_cat)
    validate_tree_position(_new(Section.DOCS, PageKind.LINK), docs_cat)
    validate_tree_position(_new(Section.REFERENCE, PageKind.TAG_GROUP), ref_cat)
    validate_tree_position(_new(Section.REFERENCE, PageKind.ENDPOINT), group)
    validate_tree_position(_new(Section.REFERENCE, PageKind.API_CONFIG), ref_cat)
    validate_tree_position(_new(Section.PAGE, PageKind.PAGE), None)
    validate_tree_position(_new(Section.DOCS, PageKind.CATEGORY), None)
    # Refused.
    bad = [
        (_new(Section.REFERENCE, PageKind.ENDPOINT), ref_cat),  # endpoint outside a tag group
        (_new(Section.REFERENCE, PageKind.TAG_GROUP), group),
        (_new(Section.DOCS, PageKind.CATEGORY), docs_cat),  # categories are roots
        (_new(Section.DOCS, PageKind.PAGE), None),  # docs pages live under a category
        (_new(Section.PAGE, PageKind.PAGE), docs_cat),  # custom pages are flat
        (_new(Section.DOCS, PageKind.ENDPOINT), docs_cat),  # no endpoints in docs
        (_new(Section.REFERENCE, PageKind.PAGE), docs_cat),  # another section
    ]
    for page, parent in bad:
        with pytest.raises(ValidationError):
            validate_tree_position(page, parent)


def test_depth_is_a_category_plus_three_levels():
    cat = make(Section.DOCS, PageKind.CATEGORY, "C")
    one = make(Section.DOCS, PageKind.PAGE, "one", cat)
    two = make(Section.DOCS, PageKind.PAGE, "two", one)
    three = make(Section.DOCS, PageKind.PAGE, "three", two)
    assert three.depth == 4
    validate_tree_position(_new(Section.DOCS, PageKind.PAGE), two)
    with pytest.raises(ValidationError, match="deeper"):
        validate_tree_position(_new(Section.DOCS, PageKind.PAGE), three)
    # Moving a subtree counts its height: `two` (with a child) cannot go under `three`'s level.
    other = make(Section.DOCS, PageKind.PAGE, "other", make(Section.DOCS, PageKind.PAGE, "o1", cat))
    with pytest.raises(ValidationError, match="deeper"):
        validate_tree_position(two, other)


def test_no_cycles_and_no_deleted_parent():
    cat = make(Section.DOCS, PageKind.CATEGORY, "C")
    one = make(Section.DOCS, PageKind.PAGE, "one", cat)
    two = make(Section.DOCS, PageKind.PAGE, "two", one)
    with pytest.raises(ValidationError, match="itself"):
        validate_tree_position(one, two)
    publish.soft_delete(two, rebuild=False)
    with pytest.raises(ValidationError, match="deleted"):
        validate_tree_position(_new(Section.DOCS, PageKind.PAGE), two)


def test_full_clean_applies_the_tree_rules():
    cat = make(Section.REFERENCE, PageKind.CATEGORY, "API")
    page = Page(section=Section.REFERENCE, kind=PageKind.ENDPOINT, slug="get-x", parent=cat, operation_id="get-x")
    with pytest.raises(ValidationError):
        page.full_clean()


# --- draft, publish, restore --------------------------------------------------------------------


def test_draft_publish_and_restore():
    page = make(Section.PAGE, PageKind.PAGE, "p", title="First", body_md="one")
    first = page.published_revision
    assert first.number == 1
    assert page.draft_revision is None
    assert first.rendered_html  # rendered at publish

    draft = publish.create_revision(page, source=RevisionSource.EDITOR, base=first, title="Second", body_md="two")
    page.refresh_from_db()
    assert page.draft_revision == draft
    assert page.published_revision == first  # the public site still reads the first
    assert draft.number == 2
    assert draft.excerpt == first.excerpt  # unset fields come from the base

    publish.publish(page, rebuild=False)
    page.refresh_from_db()
    assert page.published_revision == draft
    assert page.draft_revision is None

    restored = publish.restore(page, 1)
    page.refresh_from_db()
    assert restored.number == 3
    assert restored.source == RevisionSource.RESTORE
    assert (restored.title, restored.body_md) == ("First", "one")
    assert page.draft_revision == restored
    assert page.published_revision == draft  # restore makes a draft; it never publishes
    assert list(page.revisions.values_list("number", flat=True)) == [1, 2, 3]  # history kept
    assert PageRevision.objects.get(pk=first.pk).title == "First"  # revisions are not rewritten


def test_publish_bumps_the_generation_and_sets_updated():
    before = PortalState.load().generation
    page = make(Section.PAGE, PageKind.PAGE, "p")
    assert PortalState.load().generation > before
    assert page.content_updated_at is not None


def test_publish_without_a_draft_is_an_error():
    page = make(Section.PAGE, PageKind.PAGE, "p")
    with pytest.raises(publish.PublishError):
        publish.publish(page, rebuild=False)


def test_hidden_page_is_published_but_not_in_navigation():
    cat = make(Section.DOCS, PageKind.CATEGORY, "C")
    make(Section.DOCS, PageKind.PAGE, "shown", cat)
    hidden = make(Section.DOCS, PageKind.PAGE, "secret", cat, hidden=True)
    make(Section.DOCS, PageKind.PAGE, "under-secret", hidden)
    slugs = [n["slug"] for _, n in nav.flatten(nav.build_tree(Section.DOCS))]
    assert slugs == ["C", "shown"]
    assert nav.resolve_path("/docs/secret") == hidden  # I-6: it still answers at its URL
    full = [n["slug"] for _, n in nav.flatten(nav.build_tree(Section.DOCS, include_hidden=True))]
    assert full == ["C", "shown", "secret", "under-secret"]


# --- soft delete --------------------------------------------------------------------------------


def test_soft_delete():
    cat = make(Section.DOCS, PageKind.CATEGORY, "C")
    parent = make(Section.DOCS, PageKind.PAGE, "parent", cat)
    child = make(Section.DOCS, PageKind.PAGE, "child", parent)
    with pytest.raises(publish.PublishError, match="children"):
        publish.soft_delete(parent, rebuild=False)
    publish.soft_delete(child, rebuild=False)
    child.refresh_from_db()
    assert child.is_deleted
    assert child.revisions.count() == 1  # nothing is destroyed
    assert nav.resolve_path("/docs/child") is None
    assert "child" not in [n["slug"] for _, n in nav.flatten(nav.build_tree(Section.DOCS))]
    # The slug stays taken until the row is restored or purged.
    with pytest.raises(IntegrityError), transaction.atomic():
        Page.objects.create(section=Section.DOCS, kind=PageKind.PAGE, slug="child", parent=parent)
    publish.undelete(child, rebuild=False)
    assert nav.resolve_path("/docs/child") == child
