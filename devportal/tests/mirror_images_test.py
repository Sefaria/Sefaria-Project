"""devportal_mirror_images against a fake storage backend (PLAN.md §7.3, §7.5)."""

import pytest
from django.core.management import call_command

from devportal.adapters import storage as storage_adapter
from devportal.models import MediaAsset, Page, PageKind, PageRevision, RevisionSource, Section
from devportal.services import images, nav, publish

from . import content_helpers
from .content_helpers import HOSTILE_SVG, SAFE_SVG, FakeStorage, fake_fetch, png_bytes, run_import

imported = content_helpers.imported  # a fixture
source = content_helpers.source  # a fixture

pytestmark = pytest.mark.django_db


@pytest.fixture
def storage():
    fake = FakeStorage()
    storage_adapter.set_storage(fake)
    yield fake
    storage_adapter.set_storage(None)


def test_mirror_stores_40_assets_and_replaces_the_urls(imported, storage):  # noqa: ARG001
    calls = []
    report = images.mirror_images(fetch=fake_fetch(calls), rebuild=False)
    assert len(report.found) == 40
    assert len(report.created) == 40
    assert sum("files.readme.io" in u for u in report.found) == 39
    assert sum("i.imgur.com" in u for u in report.found) == 1
    assert report.refused == report.failed == []
    assert MediaAsset.objects.count() == 40
    assert len(storage.files) == 40
    assert all(name.startswith("developers/") for name in storage.files)
    types = sorted(a.content_type for a in MediaAsset.objects.all())
    assert types.count("image/svg+xml") == 3
    assert types.count("image/jpeg") == 2
    assert types.count("image/png") == 35
    # Every published page now points at the copies.
    assert nav.check_links()["external_images"] == []
    assert len(report.pages_updated) == len(set(report.pages_updated))
    for page in Page.objects.exclude(published_revision=None):
        assert "files.readme.io" not in page.published_revision.body_md, page.slug
    asset = MediaAsset.objects.get(source_url__contains="i.imgur.com")
    assert (asset.width, asset.height) == (3, 2)
    assert asset.url.startswith(FakeStorage.base + "developers/")


def test_second_run_is_a_no_op(imported, storage):  # noqa: ARG001
    images.mirror_images(fetch=fake_fetch([]), rebuild=False)
    revisions = PageRevision.objects.count()
    calls = []
    report = images.mirror_images(fetch=fake_fetch(calls), rebuild=False)
    assert calls == []
    assert report.found == report.created == report.pages_updated == []
    assert PageRevision.objects.count() == revisions
    assert MediaAsset.objects.count() == 40


def test_reimport_keeps_mirrored_urls(imported, storage):  # noqa: ARG001
    source_dir, _ = imported
    images.mirror_images(fetch=fake_fetch([]), rebuild=False)
    revisions = PageRevision.objects.count()
    report = run_import(source_dir)
    assert report["changes"] == 0
    assert PageRevision.objects.count() == revisions
    # A page whose source changes keeps pointing at the mirrored copy.
    target = source_dir / "docs" / "SEFARIA RESEARCH" / "patot.md"
    target.write_text(target.read_text(encoding="utf-8") + "\nMore.\n", encoding="utf-8")
    run_import(source_dir)
    body = Page.objects.get(slug="patot").published_revision.body_md
    assert "files.readme.io" not in body
    assert FakeStorage.base in body


def test_mirror_revision_is_not_mistaken_for_a_local_edit(imported, storage):  # noqa: ARG001
    from devportal.services.seed import Importer

    images.mirror_images(fetch=fake_fetch([]), rebuild=False)
    page = Page.objects.get(slug="patot")
    assert page.published_revision.source == RevisionSource.IMPORT
    assert not Importer.locally_edited(page)


def _page_with_image(url):
    page = Page.objects.create(section=Section.PAGE, kind=PageKind.PAGE, slug="img")
    rev = publish.create_revision(page, source=RevisionSource.EDITOR, title="I", body_md=f"![x]({url})\n")
    publish.publish(page, rev, rebuild=False)
    return page


def test_hostile_svg_is_refused(storage):
    page = _page_with_image("https://files.readme.io/evil.svg")
    report = images.mirror_images(fetch=lambda _url: HOSTILE_SVG, rebuild=False)
    assert [r["url"] for r in report.refused] == ["https://files.readme.io/evil.svg"]
    assert not MediaAsset.objects.exists()
    assert storage.files == {}
    page.refresh_from_db()
    assert "https://files.readme.io/evil.svg" in page.published_revision.body_md


@pytest.mark.parametrize(
    "svg",
    [
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        b'<use xlink:href="https://evil.example/a.svg#x"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/p)"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/s.css);</style></svg>',
        b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>',
    ],
)
def test_svg_checks(svg):
    with pytest.raises(images.RefusedImage):
        images.inspect(svg, "https://files.readme.io/a.svg")


def test_safe_svg_and_rasters_pass():
    assert images.inspect(SAFE_SVG, "https://x/a.svg")[0] == "image/svg+xml"
    assert images.inspect(png_bytes(), "https://x/a.png") == ("image/png", 3, 2)
    assert images.inspect(png_bytes(fmt="JPEG"), "https://x/a.jpg")[0] == "image/jpeg"
    with pytest.raises(images.RefusedImage):
        images.inspect(b"<html><script>x</script></html>", "https://x/a.png")
    with pytest.raises(images.RefusedImage):
        images.inspect(b"\x89PNG\r\n\x1a\nnot really", "https://x/a.png")


def test_download_failure_is_reported_and_leaves_the_page(storage):  # noqa: ARG001
    _page_with_image("https://files.readme.io/missing.png")

    def fetch(_url):
        msg = "404"
        raise OSError(msg)

    report = images.mirror_images(fetch=fetch, rebuild=False)
    assert [f["url"] for f in report.failed] == ["https://files.readme.io/missing.png"]
    assert report.pages_updated == []


def test_storage_names_are_content_derived():
    name = images.storage_name("ab" * 32, "https://files.readme.io/x/My File%20(1).png")
    assert name == "developers/abababababababab-My_File_1_.png"


def test_local_storage_fallback(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    settings.MEDIA_URL = "/media/"
    storage_adapter.set_storage(None)
    backend = storage_adapter.get_storage()
    assert backend.name == "local"
    url = backend.save("developers/abc-x.png", b"data", "image/png")
    assert url == "/media/developers/abc-x.png"
    assert (tmp_path / "developers" / "abc-x.png").read_bytes() == b"data"
    assert storage_adapter.is_media_url(url)


def test_command_runs(imported, storage, monkeypatch, capsys):  # noqa: ARG001
    monkeypatch.setattr(images, "fetch_url", fake_fetch([]))
    call_command("devportal_mirror_images")
    assert "external images: 40; stored 40" in capsys.readouterr().out
