"""Revision history and restore through the editor API (PLAN.md §2.11): restore creates a new draft and never
rewrites history; stale restores are 409."""

import pytest

from .editor_helpers import EditorClient, assert_shape, editor_urls, make_docs_tree, make_user  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("editor_urls")]


@pytest.fixture
def client():
    return EditorClient(make_user("rev-staff", staff=True))


@pytest.fixture
def welcome():
    return make_docs_tree()["welcome"]


def save(client, page, base, body):
    content = client.get(f"/_portal/editor/pages/{page.pk}").json()["content"]
    content["bodyMd"] = body
    response = client.put(f"/_portal/editor/pages/{page.pk}/draft", {"baseRevision": base, "content": content})
    assert response.status_code == 200, response.content
    return response.json()["revision"]["number"]


def test_revisions_are_listed_newest_first_with_flags(client, welcome):
    save(client, welcome, 1, "two")
    save(client, welcome, 2, "three")
    response = client.get(f"/_portal/editor/pages/{welcome.pk}/revisions")
    assert response.status_code == 200
    data = response.json()
    assert_shape("editor-revisions", data)
    assert data["pageId"] == welcome.pk
    numbers = [(r["number"], r["source"], r["isPublished"], r["isDraft"]) for r in data["revisions"]]
    assert numbers == [(3, "editor", False, True), (2, "editor", False, False), (1, "import", True, False)]
    assert data["revisions"][-1]["author"] is None
    assert data["revisions"][0]["author"]["name"] == "rev-staff"


def test_restore_copies_into_a_new_draft_and_keeps_history(client, welcome):
    from devportal.models import EditorAuditLog, PageRevision  # noqa: PLC0415

    save(client, welcome, 1, "two")
    before = list(PageRevision.objects.filter(page=welcome).order_by("number").values_list("number", "body_md"))
    request = {"baseRevision": 2}
    assert_shape("editor-restore-request", request)
    response = client.post(f"/_portal/editor/pages/{welcome.pk}/revisions/1/restore", request)
    assert response.status_code == 200, response.content
    data = response.json()
    assert_shape("editor-draft-save-response", data)
    assert data["revision"]["number"] == 3
    assert data["revision"]["source"] == "restore"
    assert data["revision"]["isDraft"] is True
    after = list(PageRevision.objects.filter(page=welcome).order_by("number").values_list("number", "body_md"))
    assert after[:2] == before
    assert after[2] == (3, "# Welcome\n\nFirst version.\n")
    assert data["page"]["publishedRevision"] == 1  # the public page is untouched until a publish
    log = EditorAuditLog.objects.get(action="restore")
    assert log.details == {"restored": 1, "revision": 3}


def test_restore_then_publish(client, welcome):
    from devportal.models import Page  # noqa: PLC0415

    save(client, welcome, 1, "two")
    client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": 2})
    client.post(f"/_portal/editor/pages/{welcome.pk}/revisions/1/restore", {"baseRevision": 2})
    response = client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": 3})
    assert response.status_code == 200
    assert "First version." in Page.objects.get(pk=welcome.pk).published_revision.rendered_html


def test_stale_restore_is_409(client, welcome):
    save(client, welcome, 1, "two")
    response = client.post(f"/_portal/editor/pages/{welcome.pk}/revisions/1/restore", {"baseRevision": 1})
    assert response.status_code == 409
    data = response.json()
    assert_shape("editor-conflict-response", data)
    assert data["latest"]["number"] == 2


def test_restore_of_unknown_revision_is_404(client, welcome):
    response = client.post(f"/_portal/editor/pages/{welcome.pk}/revisions/9/restore", {"baseRevision": 1})
    assert response.status_code == 404


def test_revisions_are_never_modified(client, welcome):
    from devportal.models import PageRevision  # noqa: PLC0415

    first = PageRevision.objects.get(page=welcome, number=1)
    snapshot = (first.title, first.body_md, first.created_at)
    save(client, welcome, 1, "two")
    client.post(f"/_portal/editor/pages/{welcome.pk}/revisions/1/restore", {"baseRevision": 2})
    first.refresh_from_db()
    assert (first.title, first.body_md, first.created_at) == snapshot
