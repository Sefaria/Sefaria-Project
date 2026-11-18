"""devportal_check_links, devportal_rebuild, devportal_purge_e2e, devportal_fetch_source."""

import json
import shutil
import subprocess
from datetime import timedelta
from unittest import mock

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from devportal.models import Page, PageKind, PageRevision, PortalArtifact, Redirect, RevisionSource, Section
from devportal.services import publish, seed

from . import content_helpers

imported = content_helpers.imported  # a fixture
source = content_helpers.source  # a fixture

pytestmark = pytest.mark.django_db


def _break_a_link():
    page = Page.objects.get(section=Section.DOCS, slug="patot")
    rev = publish.create_revision(
        page,
        source=RevisionSource.EDITOR,
        base=page.published_revision,
        body_md="See [gone](/docs/no-such-page) and [old](doc:welcome).",
    )
    publish.publish(page, rev, rebuild=False)


def test_check_links_passes_on_the_import(imported, capsys):  # noqa: ARG001
    call_command("devportal_check_links")
    out = capsys.readouterr().out
    assert "unresolved 0" in out
    with pytest.raises(CommandError):  # images are still on files.readme.io until mirrored
        call_command("devportal_check_links", "--images")


def test_check_links_fails_on_a_broken_link(imported, capsys):  # noqa: ARG001
    _break_a_link()
    with pytest.raises(CommandError, match="2 link problem"):
        call_command("devportal_check_links")
    out = capsys.readouterr().out
    assert "docs/patot: /docs/no-such-page" in out
    assert "docs/patot: doc:welcome" in out


def test_links_to_hidden_pages_and_portal_routes_resolve(imported):  # noqa: ARG001
    from devportal.services import nav

    assert nav.classify_destination("/docs/accessibility-at-sefaria") == "ok"  # hidden (I-6)
    assert nav.classify_destination("/reference/get-v3-texts#parameters") == "ok"
    assert nav.classify_destination("/powered-by") == "ok"
    assert nav.classify_destination("/llms.txt") == "ok"
    assert nav.classify_destination("/#anchor") == "ok"
    assert nav.classify_destination("/docs/nope") == "unresolved"
    assert nav.classify_destination("https://developers.sefaria.org/docs/welcome") == "unresolved"
    assert nav.classify_destination("https://www.sefaria.org/texts") == "external"


def test_rebuild_command(imported, capsys):  # noqa: ARG001
    PortalArtifact.objects.filter(name="sitemap.xml").delete()
    call_command("devportal_rebuild")
    assert "sitemap.xml" in capsys.readouterr().out
    assert PortalArtifact.objects.filter(name="sitemap.xml").exists()


def test_purge_e2e_removes_only_old_e2e_pages():
    old = Page.objects.create(section=Section.PAGE, kind=PageKind.PAGE, slug="e2e-run1-a")
    rev = publish.create_revision(old, source=RevisionSource.EDITOR, title="A", hidden=True)
    publish.publish(old, rev, rebuild=False)
    Page.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=2))
    Redirect.objects.create(from_path="/page/e2e-run1-old", to_path="/page/e2e-run1-a")
    fresh = Page.objects.create(section=Section.PAGE, kind=PageKind.PAGE, slug="e2e-run2-b")
    keep = Page.objects.create(section=Section.PAGE, kind=PageKind.PAGE, slug="real-page")
    Page.objects.filter(pk=keep.pk).update(created_at=timezone.now() - timedelta(days=9))

    call_command("devportal_purge_e2e", "--dry-run")
    assert Page.objects.filter(pk=old.pk).exists()
    call_command("devportal_purge_e2e")
    assert not Page.objects.filter(pk=old.pk).exists()
    assert not PageRevision.objects.filter(page_id=old.pk).exists()
    assert not Redirect.objects.exists()
    assert Page.objects.filter(pk__in=[fresh.pk, keep.pk]).count() == 2


def test_advisory_lock_on_postgres():
    executed = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, sql, params):
            executed.append((sql, params))

        def fetchone(self):
            return (True,)

    conn = mock.Mock(vendor="postgresql")
    conn.cursor.return_value = Cursor()
    with seed._Lock(conn) as lock:  # noqa: SLF001
        assert lock.acquired
    assert executed == [
        ("SELECT pg_try_advisory_lock(%s)", [seed.ADVISORY_LOCK_KEY]),
        ("SELECT pg_advisory_unlock(%s)", [seed.ADVISORY_LOCK_KEY]),
    ]


# --- devportal_fetch_source, against a local repository (no network) ----------------------------


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)  # noqa: S603, S607


@pytest.fixture
def upstream(tmp_path, source):
    """A git repository shaped like Sefaria/developer-docs, on branch v1.0."""
    repo = tmp_path / "developer-docs"
    repo.mkdir()
    for tree in ("docs", "reference", "custom_pages", "custom_blocks"):
        shutil.copytree(source / tree, repo / tree)
    spec = json.loads((seed.spec_adapter.SPEC_PATH).read_text(encoding="utf-8"))
    (repo / "reference" / "sefaria-api.json").write_text(json.dumps(spec), encoding="utf-8")
    (repo / "docs" / "SEFARIA RESEARCH" / "patot.md").write_text("---\ntitle: Patot v2\n---\nNew body\n", "utf-8")
    _git("init", "-q", "-b", "v1.0", cwd=repo)
    _git("-c", "user.email=t@example.com", "-c", "user.name=t", "add", "-A", cwd=repo)
    _git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "snapshot", cwd=repo)
    return repo


def test_fetch_source_replaces_the_snapshot(upstream, source, capsys):
    call_command("devportal_fetch_source", "--ref", "v1.0", "--repo", str(upstream), "--dest", str(source), "--no-live")
    assert "Snapshot is now" in capsys.readouterr().out
    assert (source / "docs" / "SEFARIA RESEARCH" / "patot.md").read_text(encoding="utf-8").endswith("New body\n")
    assert not (source / "reference" / "sefaria-api.json").exists()
    info = json.loads((source / "SOURCE.json").read_text(encoding="utf-8"))
    assert info["ref"] == "v1.0"
    assert len(info["commit"]) == 40
    excluded = info["excluded"][0]
    assert excluded["normalized_sha256"] == seed.spec_adapter.spec_sha()
    assert "equal" in excluded["comparison"]
    assert (source / "live" / "sidebar-docs.json").exists()  # kept with --no-live
    # The refreshed snapshot imports, and the import now checks the spec by its parsed hash.
    report = seed.Importer(source, sync_spec=False).run()
    assert report["spec_check"]["status"] == "equal"
    assert Page.objects.get(slug="patot").published_revision.title == "Patot v2"


def test_fetch_source_fetches_live_sidebars_with_get(upstream, source):
    responses = []

    def fake_get(url, **kwargs):  # noqa: ARG001
        responses.append(url)
        return mock.Mock(status_code=200, json=list, content=b"[]")

    with mock.patch("requests.get", side_effect=fake_get):
        call_command("devportal_fetch_source", "--repo", str(upstream), "--dest", str(source))
    assert len(responses) == 3
    assert all("/sidebar?section=" in url for url in responses)
    assert (source / "live" / "sidebar-reference.json").read_bytes() == b"[]"
