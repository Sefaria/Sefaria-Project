"""The editor API (PLAN.md §2.11, contract C3): every endpoint, its shapes and its rules."""

import pytest

from .editor_helpers import EditorClient, assert_shape, editor_urls, make_docs_tree, make_user  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("editor_urls")]


@pytest.fixture
def staff():
    return make_user("editor-staff", staff=True)


@pytest.fixture
def client(staff):
    return EditorClient(staff)


@pytest.fixture
def tree():
    return make_docs_tree()


def content_of(payload):
    return dict(payload["content"])


# --- tree ---------------------------------------------------------------------------------------------------------


def test_tree_lists_hidden_and_unpublished_pages_in_order(client, tree):
    from devportal.services import publish  # noqa: PLC0415

    welcome = tree["welcome"]
    publish.create_revision(welcome, source="editor", base=welcome.published_revision, hidden=True)
    response = client.get("/_portal/editor/tree/docs")
    assert response.status_code == 200
    data = response.json()
    assert_shape("editor-tree", data)
    assert [n["title"] for n in data["nodes"]] == ["TECHNICAL DOCS", "GUIDES"]
    category = data["nodes"][0]
    assert category["slug"] is None
    node = category["children"][0]
    assert (node["slug"], node["hasDraft"], node["isPublished"], node["hidden"]) == ("welcome", True, True, True)
    assert node["children"][0]["slug"] == "child"
    assert response["Cache-Control"] == "no-store"


def test_tree_of_unknown_section_is_404(client):
    response = client.get("/_portal/editor/tree/blog")
    assert response.status_code == 404
    assert_shape("error-response", response.json())


def test_tree_shows_endpoint_method_and_overlay_label(client):
    from devportal.models import Page, PageRevision  # noqa: PLC0415

    cat = Page.objects.create(section="reference", kind="category", slug="api", origin="import")
    group = Page.objects.create(section="reference", kind="tag_group", slug="text", parent=cat, origin="import")
    ep = Page.objects.create(
        section="reference", kind="endpoint", slug="get-v3-texts", operation_id="get-v3-texts", parent=group
    )
    rev = PageRevision.objects.create(page=ep, number=1, source="import", title="Texts (v3)", sidebar_label="Texts")
    ep.published_revision = rev
    ep.save()
    data = client.get("/_portal/editor/tree/reference").json()
    assert_shape("editor-tree", data)
    endpoint = data["nodes"][0]["children"][0]["children"][0]
    assert (endpoint["title"], endpoint["method"], endpoint["operationId"]) == ("Texts", "get", "get-v3-texts")


# --- page get and create ------------------------------------------------------------------------------------------


def test_get_page_returns_the_newest_revision(client, tree):
    welcome = tree["welcome"]
    response = client.get(f"/_portal/editor/pages/{welcome.pk}")
    assert response.status_code == 200
    data = response.json()
    assert_shape("editor-page", data)
    assert data["revision"]["number"] == 1
    assert data["revision"]["isPublished"] is True
    assert data["content"]["bodyMd"] == "# Welcome\n\nFirst version.\n"
    assert data["page"]["path"] == "/docs/welcome"
    assert data["spec"] is None


def test_get_unknown_or_deleted_page_is_404(client, tree):
    from django.utils import timezone  # noqa: PLC0415

    assert client.get("/_portal/editor/pages/999999").status_code == 404
    child = tree["child"]
    child.deleted_at = timezone.now()
    child.save()
    assert client.get(f"/_portal/editor/pages/{child.pk}").status_code == 404


def test_create_child_page_derives_slug_and_audits(client, staff, tree):
    from devportal.models import EditorAuditLog, PortalState  # noqa: PLC0415

    generation = PortalState.load().generation
    request = {
        "section": "docs",
        "kind": "page",
        "parentId": tree["welcome"].pk,
        "position": None,
        "title": "Getting Started — Fast!",
        "slug": None,
    }
    assert_shape("editor-page-create-request", request)
    response = client.post("/_portal/editor/pages", request)
    assert response.status_code == 201, response.content
    data = response.json()
    assert_shape("editor-page", data)
    assert data["page"]["slug"] == "getting-started-fast"
    assert data["page"]["position"] == 1  # appended after "child"
    assert data["content"]["title"] == "Getting Started — Fast!"
    assert data["page"]["publishedRevision"] is None
    assert PortalState.load().generation > generation
    log = EditorAuditLog.objects.get(action="create")
    assert (log.user, log.page_id, log.path) == (staff, data["page"]["id"], "/docs/getting-started-fast")


def test_create_inserts_at_position_and_dedupes_slugs(client, tree):
    from devportal.models import Page  # noqa: PLC0415

    body = {"section": "docs", "kind": "page", "parentId": tree["category"].pk, "position": 0, "title": "Welcome"}
    data = client.post("/_portal/editor/pages", {**body, "slug": None}).json()
    assert data["page"]["slug"] == "welcome-2"
    assert data["page"]["position"] == 0
    order = list(Page.objects.filter(parent=tree["category"]).order_by("position").values_list("slug", flat=True))
    assert order == ["welcome-2", "welcome"]


def test_create_rejects_endpoint_kind_taken_slug_and_bad_parent(client, tree):
    base = {"section": "docs", "parentId": tree["category"].pk, "position": None, "title": "X", "slug": None}
    response = client.post("/_portal/editor/pages", {**base, "kind": "endpoint"})
    assert response.status_code == 400
    assert_shape("error-response", response.json())
    response = client.post("/_portal/editor/pages", {**base, "kind": "page", "slug": "welcome"})
    assert response.status_code == 400
    assert response.json()["error"]["fields"] == {"slug": ["Another page in this section has that slug."]}
    # A page cannot be a root of the docs section.
    response = client.post("/_portal/editor/pages", {**base, "kind": "page", "parentId": None})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_move"
    # Depth limit: category > welcome > child > grandchild is the deepest allowed.
    grand = client.post("/_portal/editor/pages", {**base, "kind": "page", "parentId": tree["child"].pk}).json()
    response = client.post("/_portal/editor/pages", {**base, "kind": "page", "parentId": grand["page"]["id"]})
    assert response.status_code == 422


def test_create_category_and_custom_page(client):
    data = client.post(
        "/_portal/editor/pages",
        {"section": "docs", "kind": "category", "parentId": None, "position": None, "title": "NEW", "slug": None},
    ).json()
    assert data["page"]["kind"] == "category"
    assert data["page"]["slug"] is None and data["page"]["path"] is None
    data = client.post(
        "/_portal/editor/pages",
        {"section": "page", "kind": "page", "parentId": None, "position": None, "title": "About", "slug": "about"},
    ).json()
    assert data["page"]["path"] == "/page/about"


def test_requests_that_are_not_json_objects_are_400_or_415(client, tree):
    response = client.client.post(
        "/_portal/editor/pages", data="x", content_type="text/plain", HTTP_X_CSRFTOKEN=client.token
    )
    assert response.status_code == 415
    response = client.client.post(
        "/_portal/editor/pages", data="{", content_type="application/json", HTTP_X_CSRFTOKEN=client.token
    )
    assert response.status_code == 400
    assert client.post("/_portal/editor/pages", [1, 2]).status_code == 400


def test_wrong_method_is_a_json_405(client, tree):
    response = client.get("/_portal/editor/preview")
    assert response.status_code == 405
    assert response["Allow"] == "POST"
    assert_shape("error-response", response.json())
    assert client.post(f"/_portal/editor/pages/{tree['welcome'].pk}/revisions").status_code == 405


def test_unknown_editor_path_is_json_404(client):
    response = client.get("/_portal/editor/nothing-here")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --- draft and publish --------------------------------------------------------------------------------------------


def test_save_draft_then_publish(client, staff, tree):
    from devportal.models import EditorAuditLog, Page  # noqa: PLC0415

    welcome = tree["welcome"]
    page = client.get(f"/_portal/editor/pages/{welcome.pk}").json()
    content = content_of(page)
    content["bodyMd"] = "# Welcome\n\nSecond version.\n"
    content["excerpt"] = "Start here"
    request = {"baseRevision": 1, "content": content}
    assert_shape("editor-draft-save-request", request)
    response = client.put(f"/_portal/editor/pages/{welcome.pk}/draft", request)
    assert response.status_code == 200, response.content
    saved = response.json()
    assert_shape("editor-draft-save-response", saved)
    assert saved["revision"]["number"] == 2
    assert saved["revision"]["isDraft"] is True
    assert saved["revision"]["author"] == {"id": staff.pk, "name": staff.username}
    assert saved["page"]["publishedRevision"] == 1
    assert Page.objects.get(pk=welcome.pk).published_revision.body_md == "# Welcome\n\nFirst version.\n"

    response = client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": 2})
    assert response.status_code == 200, response.content
    published = response.json()
    assert_shape("editor-publish-response", published)
    assert published["page"]["publishedRevision"] == 2
    assert published["page"]["draftRevision"] is None
    assert published["url"].endswith("/docs/welcome")
    row = Page.objects.get(pk=welcome.pk)
    assert "Second version." in row.published_revision.rendered_html
    assert EditorAuditLog.objects.filter(action="publish", page=welcome).count() == 1


def test_stale_draft_save_is_409_with_latest(client, tree):
    welcome = tree["welcome"]
    content = content_of(client.get(f"/_portal/editor/pages/{welcome.pk}").json())
    assert (
        client.put(f"/_portal/editor/pages/{welcome.pk}/draft", {"baseRevision": 1, "content": content}).status_code
        == 200
    )
    response = client.put(f"/_portal/editor/pages/{welcome.pk}/draft", {"baseRevision": 1, "content": content})
    assert response.status_code == 409
    data = response.json()
    assert_shape("editor-conflict-response", data)
    assert data["error"]["code"] == "revision_conflict"
    assert data["latest"]["number"] == 2


def test_publish_of_an_old_revision_is_409(client, tree):
    welcome = tree["welcome"]
    content = content_of(client.get(f"/_portal/editor/pages/{welcome.pk}").json())
    client.put(f"/_portal/editor/pages/{welcome.pk}/draft", {"baseRevision": 1, "content": content})
    response = client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": 1})
    assert response.status_code == 409
    assert_shape("editor-conflict-response", response.json())


def test_draft_validation_errors(client, tree):
    welcome = tree["welcome"]
    content = content_of(client.get(f"/_portal/editor/pages/{welcome.pk}").json())
    for field, value in (("title", " "), ("linkUrl", "javascript:alert(1)"), ("hidden", "yes"), ("bodyMd", None)):
        response = client.put(
            f"/_portal/editor/pages/{welcome.pk}/draft", {"baseRevision": 1, "content": {**content, field: value}}
        )
        assert response.status_code == 400, field
        assert field in response.json()["error"]["fields"]


def test_endpoint_draft_keeps_spec_fields_and_takes_only_the_overlay(client):
    from devportal.models import Page, PageRevision  # noqa: PLC0415

    cat = Page.objects.create(section="reference", kind="category", slug="api", origin="import")
    group = Page.objects.create(section="reference", kind="tag_group", slug="text", parent=cat, origin="import")
    ep = Page.objects.create(
        section="reference", kind="endpoint", slug="get-v3-texts", operation_id="get-v3-texts", parent=group
    )
    rev = PageRevision.objects.create(page=ep, number=1, source="import", title="Texts (v3)")
    ep.published_revision = rev
    ep.save()
    data = client.get(f"/_portal/editor/pages/{ep.pk}").json()
    assert_shape("editor-page", data)
    assert data["spec"]["method"] == "get"
    assert data["spec"]["path"] == "/api/v3/texts/{tref}"
    content = content_of(data)
    content["title"] = "Hacked title"  # spec-owned: ignored
    content["deprecated"] = True  # spec-owned: ignored
    content["bodyMd"] = "Extra notes."
    content["endpoint"] = {"sidebarLabel": "Texts", "titleOverride": "Get texts", "descriptionOverrideMd": "**New**"}
    response = client.put(f"/_portal/editor/pages/{ep.pk}/draft", {"baseRevision": 1, "content": content})
    assert response.status_code == 200, response.content
    saved = PageRevision.objects.get(page=ep, number=2)
    assert (saved.title, saved.deprecated) == ("Texts (v3)", False)
    assert (saved.sidebar_label, saved.title_override, saved.description_override_md, saved.body_md) == (
        "Texts",
        "Get texts",
        "**New**",
        "Extra notes.",
    )
    data = client.get(f"/_portal/editor/pages/{ep.pk}").json()
    assert data["content"]["endpoint"]["titleOverride"] == "Get texts"


# --- move and delete ----------------------------------------------------------------------------------------------


def test_move_reorders_and_reparents(client, staff, tree):
    from devportal.models import EditorAuditLog, Page  # noqa: PLC0415

    generation = client.get("/_portal/editor/tree/docs").json()["generation"]
    request = {"parentId": tree["category"].pk, "position": 0, "baseGeneration": generation}
    assert_shape("editor-move-request", request)
    response = client.post(f"/_portal/editor/pages/{tree['child'].pk}/move", request)
    assert response.status_code == 200, response.content
    data = response.json()
    assert_shape("editor-tree", data)
    assert [n["slug"] for n in data["nodes"][0]["children"]] == ["child", "welcome"]
    assert data["generation"] > generation
    assert Page.objects.get(pk=tree["welcome"].pk).position == 1
    log = EditorAuditLog.objects.get(action="move")
    assert log.details["from_parent"] == tree["welcome"].pk
    assert log.details["to_parent"] == tree["category"].pk


def test_move_with_stale_generation_is_409(client, tree):
    generation = client.get("/_portal/editor/tree/docs").json()["generation"]
    request = {"parentId": tree["other"].pk, "position": 0, "baseGeneration": generation - 1}
    response = client.post(f"/_portal/editor/pages/{tree['child'].pk}/move", request)
    assert response.status_code == 409
    data = response.json()
    assert_shape("editor-conflict-response", data)
    assert data["error"]["code"] == "tree_conflict"
    assert data["generation"] == generation


@pytest.mark.parametrize("case", ["under_itself", "to_root", "other_section", "too_deep"])
def test_invalid_moves_are_422(client, tree, case):
    from devportal.models import Page  # noqa: PLC0415

    generation = client.get("/_portal/editor/tree/docs").json()["generation"]
    page_id, parent_id = tree["welcome"].pk, tree["child"].pk
    if case == "to_root":
        parent_id = None
    elif case == "other_section":
        parent_id = Page.objects.create(section="page", kind="page", slug="about").pk
    elif case == "too_deep":
        # category > welcome > child > grandchild is full; "mover" brings a child of its own.
        parent_id = Page.objects.create(section="docs", kind="page", slug="g", parent=tree["child"]).pk
        page_id = Page.objects.create(section="docs", kind="page", slug="mover", parent=tree["other"]).pk
        Page.objects.create(section="docs", kind="page", slug="mover-child", parent_id=page_id)
    response = client.post(
        f"/_portal/editor/pages/{page_id}/move", {"parentId": parent_id, "position": 0, "baseGeneration": generation}
    )
    assert response.status_code == 422, response.content
    assert response.json()["error"]["code"] == "invalid_move"


def test_delete_soft_deletes_leaf_and_refuses_parents(client, tree):
    from devportal.models import EditorAuditLog, Page  # noqa: PLC0415

    response = client.delete(f"/_portal/editor/pages/{tree['welcome'].pk}")
    assert response.status_code == 400
    response = client.delete(f"/_portal/editor/pages/{tree['child'].pk}")
    assert response.status_code == 200
    assert_shape("editor-tree", response.json())
    assert Page.objects.get(pk=tree["child"].pk).deleted_at is not None
    assert EditorAuditLog.objects.filter(action="delete", page=tree["child"]).exists()
    assert client.get(f"/_portal/editor/pages/{tree['child'].pk}").status_code == 404


# --- preview ------------------------------------------------------------------------------------------------------


def test_preview_renders_on_the_server_and_lists_removals(client, tree):
    welcome = tree["welcome"]
    content = content_of(client.get(f"/_portal/editor/pages/{welcome.pk}").json())
    content["bodyMd"] = (
        '## Hello\n\n<Callout icon="🚧" theme="warn">\nCareful\n</Callout>\n\n'
        '<p onclick="x()" style="color:red">hi</p>\n\n<script>alert(1)</script>\n'
    )
    request = {"section": "docs", "kind": "page", "pageId": welcome.pk, "content": content}
    assert_shape("editor-preview-request", request)
    response = client.post("/_portal/editor/preview", request)
    assert response.status_code == 200, response.content
    data = response.json()
    assert_shape("editor-preview-response", data)
    assert 'class="dp-callout dp-callout-warn"' in data["bodyHtml"]
    assert "<script" not in data["bodyHtml"] and "onclick" not in data["bodyHtml"] and "style=" not in data["bodyHtml"]
    assert data["toc"] == [{"level": 2, "id": "hello", "text": "Hello"}]
    removals = " ".join(data["sanitizerRemovals"])
    assert "<script>" in removals and "onclick" in removals and "style" in removals


def test_preview_never_stores_anything(client, tree):
    from devportal.models import PageRevision  # noqa: PLC0415

    count = PageRevision.objects.count()
    content = content_of(client.get(f"/_portal/editor/pages/{tree['welcome'].pk}").json())
    client.post("/_portal/editor/preview", {"section": "docs", "kind": "page", "pageId": None, "content": content})
    assert PageRevision.objects.count() == count
