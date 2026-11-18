"""Changing a slug in the editor's settings leaves a 301 from the old path (PLAN.md §2.11, §2.3.3 Redirect)."""

import pytest

from .editor_helpers import EditorClient, assert_shape, editor_urls, make_docs_tree, make_user  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("editor_urls")]


@pytest.fixture
def client():
    return EditorClient(make_user("slug-staff", staff=True))


@pytest.fixture
def tree():
    return make_docs_tree()


def test_slug_change_creates_a_redirect_and_the_old_path_redirects(client, tree):
    from devportal.models import EditorAuditLog, Redirect  # noqa: PLC0415

    welcome = tree["welcome"]
    request = {"slug": "start-here"}
    assert_shape("editor-page-settings-request", request)
    response = client.patch(f"/_portal/editor/pages/{welcome.pk}", request)
    assert response.status_code == 200, response.content
    data = response.json()
    assert_shape("editor-page", data)
    assert data["page"]["slug"] == "start-here"
    assert data["page"]["path"] == "/docs/start-here"
    redirect = Redirect.objects.get(from_path="/docs/welcome")
    assert (redirect.to_path, redirect.status, redirect.reason) == ("/docs/start-here", 301, "slug_change")
    log = EditorAuditLog.objects.get(action="change_slug")
    assert log.details == {"old": "/docs/welcome", "new": "/docs/start-here"}

    public = EditorClient(None, csrf=False)
    response = public.get("/docs/welcome")
    assert response.status_code == 301
    assert response["Location"].endswith("/docs/start-here")
    assert public.get("/docs/start-here").status_code == 200


def test_second_change_updates_earlier_redirects_and_never_shadows(client, tree):
    from devportal.models import Redirect  # noqa: PLC0415

    welcome = tree["welcome"]
    client.patch(f"/_portal/editor/pages/{welcome.pk}", {"slug": "start-here"})
    client.patch(f"/_portal/editor/pages/{welcome.pk}", {"slug": "begin"})
    assert dict(Redirect.objects.values_list("from_path", "to_path")) == {
        "/docs/welcome": "/docs/begin",
        "/docs/start-here": "/docs/begin",
    }
    # Back to the first slug: the redirect from that path goes away, so it cannot loop.
    client.patch(f"/_portal/editor/pages/{welcome.pk}", {"slug": "welcome"})
    redirects = dict(Redirect.objects.values_list("from_path", "to_path"))
    assert "/docs/welcome" not in redirects
    assert redirects == {"/docs/start-here": "/docs/welcome", "/docs/begin": "/docs/welcome"}


def test_unchanged_slug_creates_nothing(client, tree):
    from devportal.models import Redirect  # noqa: PLC0415

    response = client.patch(f"/_portal/editor/pages/{tree['welcome'].pk}", {"slug": "welcome"})
    assert response.status_code == 200
    assert not Redirect.objects.exists()


@pytest.mark.parametrize("slug", ["", "has space", "a/b", "q?", "frag#x", "x" * 201])
def test_invalid_slugs_are_400(client, tree, slug):
    response = client.patch(f"/_portal/editor/pages/{tree['welcome'].pk}", {"slug": slug})
    assert response.status_code == 400
    assert "slug" in response.json()["error"]["fields"]


def test_unicode_slug_is_allowed(client, tree):
    response = client.patch(f"/_portal/editor/pages/{tree['welcome'].pk}", {"slug": "ברוכים-הבאים"})
    assert response.status_code == 200
    assert response.json()["page"]["slug"] == "ברוכים-הבאים"


def test_taken_slug_is_400_and_category_slugs_are_not_editable(client, tree):
    from devportal.models import Redirect  # noqa: PLC0415

    response = client.patch(f"/_portal/editor/pages/{tree['welcome'].pk}", {"slug": "child"})
    assert response.status_code == 400
    assert_shape("error-response", response.json())
    assert "slug" in response.json()["error"]["fields"]
    response = client.patch(f"/_portal/editor/pages/{tree['category'].pk}", {"slug": "anything"})
    assert response.status_code == 400
    assert not Redirect.objects.exists()


def test_extra_settings_fields_are_rejected(client, tree):
    response = client.patch(f"/_portal/editor/pages/{tree['welcome'].pk}", {"slug": "a", "section": "page"})
    assert response.status_code == 400
