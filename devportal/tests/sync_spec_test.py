"""devportal_sync_spec (PLAN.md §2.7): an added and a removed operation, new tag groups, slice hashes."""

import copy
import json
from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from devportal.management.commands.devportal_sync_spec import SYNC_HIDDEN_KEY, sync_spec
from devportal.models import Page, PageKind, PortalState, Section
from devportal.spec import Spec, load_spec
from devportal.tests.reference_fixtures import build_reference_tree

pytestmark = pytest.mark.django_db


def _spec_with(changes):
    doc = copy.deepcopy(load_spec().document)
    changes(doc)
    return Spec(doc)


def _add_op(doc, path, op_id, tag, summary):
    doc["paths"][path] = {
        "get": {"operationId": op_id, "tags": [tag], "summary": summary, "responses": {"200": {"description": "ok"}}}
    }


def _remove_op(doc, op_id):
    for path, item in list(doc["paths"].items()):
        if item.get("get", {}).get("operationId") == op_id:
            del doc["paths"][path]


def _endpoint(op_id):
    return Page.objects.get(kind=PageKind.ENDPOINT, operation_id=op_id)


def _children(group):
    return list(group.children.order_by("position", "id").values_list("slug", flat=True))


def test_empty_database_gets_all_61_endpoints_grouped_by_tag():
    report = sync_spec()
    assert len(report.created) == 61
    assert Page.objects.filter(kind=PageKind.ENDPOINT).count() == 61
    groups = Page.objects.filter(kind=PageKind.TAG_GROUP).order_by("position")
    first_use = list(dict.fromkeys(op.tag for op in load_spec().operations()))  # groups appear as tags are met
    assert [g.published_revision.title for g in groups] == first_use
    assert sorted(first_use) == sorted(load_spec().tag_names())
    text = Page.objects.get(kind=PageKind.TAG_GROUP, slug="text")
    assert _children(text)[:3] == ["get-v3-texts", "get-v1-texts", "get-versions"]
    page = _endpoint("get-v3-texts")
    assert page.published_revision.title == "Texts (v3)"
    assert page.spec_slice_sha == load_spec().slice_sha("get-v3-texts")
    assert page.spec_updated_at is not None
    state = PortalState.load()
    assert state.spec_sha == load_spec().sha
    assert state.generation == 1

    # Idempotent.
    again = sync_spec()
    assert again.tree_changed is False
    assert again.lines() == ["endpoint pages are in sync with the spec"]
    assert PortalState.load().generation == 1


def test_an_added_and_a_removed_operation():
    tree = build_reference_tree()
    sync_spec()  # the fixture tree holds 15 of the 61; the rest are created
    generation = PortalState.load().generation

    def changes(doc):
        _add_op(doc, "/api/new-index-thing", "get-new-index-thing", "Index", "New Index Thing")
        _add_op(doc, "/api/widgets", "get-widgets", "Widgets", "Widgets")
        _remove_op(doc, "get-shape")

    later = timezone.now() + timedelta(hours=1)
    report = sync_spec(_spec_with(changes), now=later)
    assert report.created == ["get-new-index-thing", "get-widgets"]
    assert report.new_groups == ["widgets"]
    assert report.hidden == ["get-shape"]

    # Added to an existing tag: appended to the last group holding that tag (index-1, not index).
    added = _endpoint("get-new-index-thing")
    assert added.parent == tree["index-1"]
    assert _children(tree["index-1"])[-1] == "get-new-index-thing"
    assert added.published_revision.title == "New Index Thing"
    assert added.spec_updated_at == later

    # A new tag gets a new group at the end, next to the other groups.
    widgets = Page.objects.get(kind=PageKind.TAG_GROUP, slug="widgets")
    assert widgets.parent == tree["Sefaria API"]
    assert widgets.position > max(
        g.position for g in Page.objects.filter(kind=PageKind.TAG_GROUP).exclude(pk=widgets.pk)
    )
    assert widgets.published_revision.title == "Widgets"
    assert _children(widgets) == ["get-widgets"]

    # Removed: hidden, not deleted; the overlay survives.
    shape = _endpoint("get-shape")
    assert shape.deleted_at is None
    assert shape.published_revision.hidden is True
    assert shape.published_revision.number == 2
    assert shape.published_revision.metadata[SYNC_HIDDEN_KEY] is True
    assert PortalState.load().generation == generation + 1

    # The operation comes back: shown again.
    report = sync_spec(_spec_with(lambda doc: None))
    assert report.shown == ["get-shape"]
    shape.refresh_from_db()
    assert shape.published_revision.hidden is False
    assert SYNC_HIDDEN_KEY not in shape.published_revision.metadata


def test_staff_hidden_page_is_not_unhidden():
    tree = build_reference_tree()
    assert tree["get-v2-topics"].published_revision.hidden is True
    report = sync_spec()
    assert "get-v2-topics" not in report.shown
    assert _endpoint("get-v2-topics").published_revision.hidden is True


def test_slice_change_updates_hash_and_time():
    sync_spec()
    before = _endpoint("get-v1-texts")
    later = timezone.now() + timedelta(days=1)

    def changes(doc):
        doc["paths"]["/api/texts/{tref}"]["get"]["summary"] = "Texts (old)"

    report = sync_spec(_spec_with(changes), now=later)
    assert report.spec_changed == ["get-v1-texts"]
    after = _endpoint("get-v1-texts")
    assert after.spec_slice_sha != before.spec_slice_sha
    assert after.spec_updated_at == later
    assert _endpoint("get-v3-texts").spec_updated_at < later


def test_slug_collision_and_soft_deleted_pages():
    build_reference_tree()
    deleted = _endpoint("get-versions")
    deleted.deleted_at = timezone.now()
    deleted.save()

    def changes(doc):
        _add_op(doc, "/api/getting-started", "getting-started", "Misc", "Clash")

    report = sync_spec(_spec_with(changes))
    assert "get-versions" in report.deleted_in_spec
    assert _endpoint("get-versions").deleted_at is not None
    assert _endpoint("getting-started").slug == "getting-started-1"


def test_command_dry_run_and_spec_option(tmp_path):
    doc = copy.deepcopy(load_spec().document)
    _add_op(doc, "/api/widgets", "get-widgets", "Widgets", "Widgets")
    spec_file = tmp_path / "openAPI.json"
    spec_file.write_text(json.dumps(doc), encoding="utf-8")

    out = StringIO()
    call_command("devportal_sync_spec", "--spec", str(spec_file), "--dry-run", stdout=out)
    assert "dry run" in out.getvalue()
    assert "created endpoint pages (62)" in out.getvalue()
    assert not Page.objects.filter(section=Section.REFERENCE).exists()

    out = StringIO()
    call_command("devportal_sync_spec", "--spec", str(spec_file), stdout=out)
    assert "created tag groups (12)" in out.getvalue()
    assert _endpoint("get-widgets").parent.slug == "widgets"
