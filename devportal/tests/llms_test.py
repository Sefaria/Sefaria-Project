"""`/llms.txt`, `/docs/llms.txt`, `/reference/llms.txt` against live (PLAN.md §2.10; Phase 4 `llms_test`)."""

import pytest

from devportal.models import Page, PortalArtifact
from devportal.services import llms

from .machine_helpers import LIVE_MACHINE, URLCONF, client, content, origin, to_live_host  # noqa: F401 - fixture

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]

FILES = [
    ("/llms.txt", "llms.txt"),
    ("/docs/llms.txt", "wk_docs_llms.txt"),
    ("/reference/llms.txt", "wk_reference_llms.txt"),
]


@pytest.mark.parametrize(("path", "live_file"), FILES)
def test_equals_live(path, live_file):
    response = client().get(path)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/plain; charset=utf-8"
    text = response.content.decode("utf-8")
    assert to_live_host(text) == (LIVE_MACHINE / live_file).read_text(encoding="utf-8")


def test_links_point_at_markdown_on_the_request_host():
    text = client().get("/llms.txt").content.decode("utf-8")
    assert f"]({origin()}/docs/welcome.md)" in text
    assert "developers.sefaria.org" not in text


@pytest.mark.parametrize("name", list(llms.ARTIFACTS.values()))
def test_artifacts_are_built_by_the_publish_pipeline(name):
    artifact = PortalArtifact.objects.get(name=name)
    assert llms.ORIGIN in artifact.content
    assert artifact.content_type == "text/plain; charset=utf-8"


def test_served_without_an_artifact():
    expected = client().get("/llms.txt").content
    PortalArtifact.objects.filter(name__startswith="llms").delete()
    assert client().get("/llms.txt").content == expected


def test_hidden_pages_and_their_children_are_left_out():
    """I-6. Hiding a parent hides its subtree; the artifact builder and the view agree."""
    from devportal.services import publish  # noqa: PLC0415

    parent = Page.objects.get(section="docs", slug="the-index-schema")
    publish.create_revision(parent, source="editor", base=parent.published_revision, hidden=True)
    publish.publish(Page.objects.get(pk=parent.pk), rebuild=False)
    publish.rebuild_artifacts(rerender=False)
    text = client().get("/llms.txt").content.decode("utf-8")
    assert "/docs/the-index-schema.md" not in text
    assert "/docs/schemanode.md" not in text  # its child
    assert "/docs/index-and-versions.md" in text
    for slug in ("shape-api", "categories-api", "accessibility-at-sefaria"):
        assert f"/docs/{slug}.md" not in text
    assert "/reference/authentication.md" not in text
    assert "/page/test-homepage.md" not in text


def test_link_pages_are_left_out():
    text = client().get("/docs/llms.txt").content.decode("utf-8")
    assert "Sefaria GitHub" not in text


def test_truncate():
    assert llms.truncate("short") == "short"
    text = ("word " * 60).strip()
    cut = llms.truncate(text)
    assert cut.endswith("word\N{HORIZONTAL ELLIPSIS}")
    assert len(cut) <= 201
    assert llms.one_line("a\n\nb ") == "a  b"
