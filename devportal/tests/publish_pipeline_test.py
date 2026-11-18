"""The editor's path through the publish pipeline (PLAN.md §2.11 "Publishing"): a saved draft changes nothing a
visitor sees; a publish renders on the server, bumps the generation, rebuilds the artifacts and shows the change.
HTML sent by a client is never stored."""

import pytest

from .editor_helpers import EditorClient, editor_urls, make_docs_tree, make_user  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("editor_urls")]


@pytest.fixture
def staff_client():
    return EditorClient(make_user("pipe-staff", staff=True))


@pytest.fixture
def welcome():
    return make_docs_tree()["welcome"]


def _save(client, page, base, body, **changes):
    content = client.get(f"/_portal/editor/pages/{page.pk}").json()["content"]
    content.update(bodyMd=body, **changes)
    response = client.put(f"/_portal/editor/pages/{page.pk}/draft", {"baseRevision": base, "content": content})
    assert response.status_code == 200, response.content
    return response.json()["revision"]["number"]


def test_draft_is_invisible_until_published(staff_client, welcome, django_capture_on_commit_callbacks):
    from devportal.models import PortalArtifact, PortalState  # noqa: PLC0415

    public = EditorClient(None, csrf=False)
    number = _save(staff_client, welcome, 1, "# Welcome\n\nA brand new sentence.\n", title="Welcome v2")
    assert "A brand new sentence." not in public.get("/docs/welcome").content.decode()

    generation = PortalState.load().generation
    with django_capture_on_commit_callbacks(execute=True):
        response = staff_client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": number})
    assert response.status_code == 200
    assert response.json()["generation"] == PortalState.load().generation > generation
    html = public.get("/docs/welcome").content.decode()
    assert "A brand new sentence." in html
    assert "Welcome v2" in html
    sidebar = PortalArtifact.objects.get(name="sidebar-docs.json").content
    assert "Welcome v2" in sidebar


def test_hidden_flag_hides_the_page_after_publish(staff_client, welcome):
    public = EditorClient(None, csrf=False)
    number = _save(staff_client, welcome, 1, "Body", hidden=True)
    staff_client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": number})
    from devportal.models import Page  # noqa: PLC0415

    assert Page.objects.get(pk=welcome.pk).published_revision.hidden is True
    # A hidden page keeps its URL (as on live) but leaves the sidebar.
    assert public.get("/docs/welcome").status_code == 200


def test_client_html_is_never_stored_or_rendered(staff_client, welcome):
    from devportal.models import Page  # noqa: PLC0415

    number = _save(staff_client, welcome, 1, '<img src=x onerror="alert(1)"><script>alert(2)</script>\n\nSafe text\n')
    staff_client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": number})
    rendered = Page.objects.get(pk=welcome.pk).published_revision.rendered_html
    assert "onerror" not in rendered and "<script" not in rendered
    assert "Safe text" in rendered


def test_publishing_twice_is_harmless(staff_client, welcome):
    number = _save(staff_client, welcome, 1, "x")
    assert staff_client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": number}).status_code == 200
    assert staff_client.post(f"/_portal/editor/pages/{welcome.pk}/publish", {"revision": number}).status_code == 200
