"""The publish pipeline and the artifacts (PLAN.md §2.5, §2.11 "Publishing")."""

import json
from unittest import mock

import pytest

from devportal.adapters import markdown as md
from devportal.adapters import tasks as task_runner
from devportal.models import Page, PageKind, PageRevision, PortalArtifact, PortalState, RevisionSource, Section
from devportal.services import nav, publish

from . import content_helpers

imported = content_helpers.imported  # a fixture
source = content_helpers.source  # a fixture

pytestmark = pytest.mark.django_db


def test_render_goes_through_the_markdown_adapter():
    page = Page.objects.create(section=Section.PAGE, kind=PageKind.PAGE, slug="p")
    rev = publish.create_revision(page, source=RevisionSource.EDITOR, title="P", body_md="Hello <b>x</b>")
    with mock.patch.object(md, "render", return_value=md.Rendered(html="<p>H</p>", toc=[{"id": "h"}], text="H")):
        publish.publish(page, rev, rebuild=False)
    rev.refresh_from_db()
    assert (rev.rendered_html, rev.rendered_toc, rev.search_text) == ("<p>H</p>", [{"id": "h"}], "H")
    assert rev.renderer_version == md.renderer_version()


def test_fallback_renderer_escapes():
    if md.renderer_available():
        pytest.skip("devportal.markdown is installed; the fallback is not used")
    result = md.render("<script>x</script>\n\nsecond")
    assert result.html == "<p>&lt;script&gt;x&lt;/script&gt;</p><p>second</p>"
    assert md.renderer_version() == md.FALLBACK_RENDERER_VERSION


def test_rebuild_rerenders_revisions_from_another_renderer(imported):  # noqa: ARG001
    page = Page.objects.get(section=Section.DOCS, slug="welcome")
    PageRevision.objects.filter(pk=page.published_revision_id).update(renderer_version="old", rendered_html="stale")
    assert publish.stale_render_count() == 1
    report = publish.rebuild_artifacts()
    assert report["rerendered"] == 1
    page.published_revision.refresh_from_db()
    assert page.published_revision.rendered_html != "stale"
    assert publish.stale_render_count() == 0


def test_artifact_registry_and_rebuild(imported):  # noqa: ARG001
    calls = []

    @publish.register_artifact_builder("test-artifact.txt", content_type="text/plain")
    def build(context):
        calls.append(context["generation"])
        return "hello"

    try:
        report = publish.rebuild_artifacts(rerender=False)
        assert "test-artifact.txt" in report["changed"]
        art = PortalArtifact.objects.get(name="test-artifact.txt")
        assert (art.content, art.content_type) == ("hello", "text/plain")
        report = publish.rebuild_artifacts(rerender=False)
        assert "test-artifact.txt" in report["unchanged"]
        assert calls == [PortalState.load().generation] * 2
    finally:
        publish._BUILDERS.pop("test-artifact.txt")  # noqa: SLF001


def test_a_failing_builder_does_not_stop_the_others(imported):  # noqa: ARG001
    @publish.register_artifact_builder("broken.json")
    def broken(_context):
        msg = "boom"
        raise RuntimeError(msg)

    try:
        report = publish.rebuild_artifacts(rerender=False)
        assert report["errors"] == {"broken.json": "RuntimeError: boom"}
        assert {"sidebar-docs.json", "sitemap.xml"} <= set(report["changed"] + report["unchanged"])
    finally:
        publish._BUILDERS.pop("broken.json")  # noqa: SLF001


def test_sitemap_lists_visible_pages_like_live(imported):  # noqa: ARG001
    from .content_helpers import LIVE_MACHINE

    xml = PortalArtifact.objects.get(name="sitemap.xml").content
    ours = [loc.replace(nav.SITEMAP_ORIGIN, "") for loc in _locs(xml)]
    live = [
        loc.replace("https://developers.sefaria.org", "") for loc in _locs((LIVE_MACHINE / "sitemap.xml").read_text())
    ]
    assert len(ours) == 129
    assert sorted(ours) == sorted(live)
    assert "/docs/accessibility-at-sefaria" not in ours  # hidden (I-6)
    assert "/reference/text" not in ours  # tag groups redirect
    assert "/docs/helpful-link-somewhere-else" not in ours  # link pages point elsewhere


def _locs(xml):
    import re

    return re.findall(r"<loc>(.*?)</loc>", xml)


def test_sidebar_tree_shape(imported):  # noqa: ARG001
    tree = json.loads(PortalArtifact.objects.get(name="sidebar-reference.json").content)
    api = next(c for c in tree if c["title"] == "Sefaria API")
    text = api["pages"][0]
    assert (text["kind"], text["slug"], text["path"]) == ("tag_group", "text", "/reference/text")
    first = text["pages"][0]
    assert first["method"] == "get"
    assert first["title"] == "Texts (v3)"
    assert next(p for p in text["pages"] if p["slug"] == "get-v1-texts")["deprecated"] is True


def test_endpoint_sidebar_label_overrides_the_title(imported):  # noqa: ARG001
    page = Page.objects.get(slug="get-shape")
    rev = publish.create_revision(page, source=RevisionSource.EDITOR, base=page.published_revision, sidebar_label="S")
    publish.publish(page, rev, rebuild=False)
    flat = {n["slug"]: n["title"] for _, n in nav.flatten(nav.build_tree(Section.REFERENCE))}
    assert flat["get-shape"] == "S"


def test_rebuild_runs_inline_without_celery(settings):
    settings.CELERY_ENABLED = False
    task = mock.Mock(return_value="done")
    assert task_runner.run(task, 1) == "done"
    task.delay.assert_not_called()


def test_rebuild_is_queued_with_celery(settings):
    settings.CELERY_ENABLED = True
    task = mock.Mock()
    assert task_runner.run(task, 1) is None
    task.delay.assert_called_once_with(1)
    task.assert_not_called()


def test_publish_schedules_one_rebuild_after_commit(django_capture_on_commit_callbacks):
    page = Page.objects.create(section=Section.PAGE, kind=PageKind.PAGE, slug="p")
    rev = publish.create_revision(page, source=RevisionSource.EDITOR, title="P", body_md="x")
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        publish.publish(page, rev)
    assert len(callbacks) == 1
    tree = json.loads(PortalArtifact.objects.get(name="sidebar-page.json").content)
    assert [p["slug"] for p in tree[0]["pages"]] == ["p"]
