"""devportal_import (PLAN.md §7.2, §7.5, §6.3)."""

import json
from urllib.parse import quote

import pytest
import yaml
from django.core.management import call_command

from devportal.adapters import markdown as md
from devportal.adapters import spec as spec_adapter
from devportal.models import (
    EditorAuditLog,
    Page,
    PageKind,
    PageRevision,
    PortalArtifact,
    PortalState,
    RevisionSource,
    Section,
)
from devportal.services import nav, publish
from devportal.services.seed import REPORT_ARTIFACT, SourceError, split_front_matter

from . import content_helpers
from .content_helpers import run_import

imported = content_helpers.imported  # a fixture
source = content_helpers.source  # a fixture

pytestmark = pytest.mark.django_db


def _kinds(section):
    counts = {}
    for kind in Page.objects.filter(section=section).values_list("kind", flat=True):
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def _snapshot():
    """Everything an import may write, for before/after comparisons."""
    return {
        "pages": list(Page.objects.order_by("id").values()),
        "revisions": PageRevision.objects.count(),
        "generation": PortalState.load().generation,
    }


# --- counts (F-2) -------------------------------------------------------------------------------


def test_counts_match_the_inventory(imported):
    _source, report = imported
    counts = report["counts"]
    assert counts["files"] == 152
    assert _kinds(Section.DOCS) == {"category": 5, "page": 64, "link": 1}
    assert _kinds(Section.REFERENCE) == {"category": 3, "page": 7, "endpoint": 61, "tag_group": 12, "api_config": 3}
    assert _kinds(Section.PAGE) == {"page": 4}
    published = Page.objects.exclude(kind=PageKind.CATEGORY).select_related("published_revision")
    assert sum(p.published_revision.hidden for p in published) == 11
    assert sum(p.published_revision.deprecated for p in published) == 1
    assert Page.objects.filter(kind=PageKind.LINK).count() == 1
    link = Page.objects.get(kind=PageKind.LINK)
    assert link.published_revision.link_url == "https://github.com/Sefaria/Sefaria-Project"
    assert link.published_revision.link_new_tab is True
    assert report["not_imported"] == ["custom_blocks/ReuseMe1.md"]
    assert len(report["files"]) == 152
    assert {f["path"] for f in report["files"]} >= {"custom_pages/contact-us.html"}


def test_every_endpoint_names_an_operation_in_the_spec(imported):  # noqa: ARG001
    ops = spec_adapter.operation_index()
    endpoints = Page.objects.filter(kind=PageKind.ENDPOINT)
    assert endpoints.count() == 61
    for page in endpoints:
        assert page.operation_id == page.slug
        assert page.operation_id in ops
        assert page.parent.kind == PageKind.TAG_GROUP


def test_tag_groups_keep_index_and_index_1_apart(imported):  # noqa: ARG001
    groups = Page.objects.filter(kind=PageKind.TAG_GROUP)
    assert groups.count() == 12
    slugs = set(groups.values_list("slug", flat=True))
    assert {"index", "index-1"} <= slugs
    assert Page.objects.get(slug="index", kind=PageKind.TAG_GROUP).published_revision.title == "Index"
    assert Page.objects.get(slug="get-shape").parent.slug == "index"
    assert Page.objects.get(slug="get-counts").parent.slug == "index-1"


def test_api_config_stubs_are_hidden(imported):  # noqa: ARG001
    stubs = Page.objects.filter(kind=PageKind.API_CONFIG)
    assert stubs.count() == 3
    assert all(p.published_revision.hidden for p in stubs)
    assert {p.published_revision.api_config for p in stubs} == {"getting-started", "authentication", "my-requests"}


def test_categories_keep_their_folder_names(imported):  # noqa: ARG001
    titles = [
        p.published_revision.title
        for p in Page.objects.filter(section=Section.DOCS, kind=PageKind.CATEGORY).order_by("position")
    ]
    assert titles == ["TECHNICAL DOCS", "local installation", "Dev Digest Archive", "SEFARIA RESEARCH", "about Sefaria"]


def test_contact_page_body_is_raw_html(imported):  # noqa: ARG001
    page = Page.objects.get(section=Section.PAGE, slug="contact-us")
    assert page.published_revision.body_md.startswith("<div>Use this form")
    assert "formstack.com/forms/developer_contact" in page.published_revision.body_md


def test_front_matter_fields(imported):  # noqa: ARG001
    rev = Page.objects.get(section=Section.DOCS, slug="the-structure-of-a-text-on-sefaria").published_revision
    assert rev.title == "The Structure of a Book in the Sefaria Library"
    assert rev.excerpt.startswith("Learn about the structure")
    assert rev.metadata["robots"] == "index"
    assert rev.next["pages"][0]["slug"] == "index-and-versions"  # fixed (§7.4)
    # Six pages carry `link: {new_tab: false}` with no URL: ordinary pages.
    assert Page.objects.get(section=Section.DOCS, slug="welcome").kind == PageKind.PAGE


# --- order --------------------------------------------------------------------------------------


def _live_flat(name):
    from .content_helpers import live_sidebar

    out = []

    def walk(pages, depth):
        for p in pages:
            out.append((depth, p["slug"], p["title"], p["type"], p["deprecated"]))
            walk(p["pages"], depth + 1)

    for category in live_sidebar(name):
        out.append((0, category["title"], category["title"], "category", False))
        walk(category["pages"], 1)
    return out


def _our_flat(section):
    kinds = {"page": "basic", "tag_group": "basic", "link": "link", "endpoint": "endpoint", "category": "category"}
    out = []
    for depth, node in nav.flatten(nav.build_tree(section)):
        if node["kind"] == "category":
            out.append((depth, node["title"], node["title"], "category", False))
            continue
        kind = "custom_page" if section == Section.PAGE else kinds[node["kind"]]
        out.append((depth, node["slug"], node["title"], kind, node["deprecated"]))
    return out


@pytest.mark.parametrize(("section", "name"), [("docs", "docs"), ("reference", "reference"), ("page", "custom_pages")])
def test_visible_trees_equal_live_sidebars(imported, section, name):  # noqa: ARG001
    assert _our_flat(section) == _live_flat(name)


def test_sidebar_artifacts_are_built(imported):  # noqa: ARG001
    for section in ("docs", "reference", "page"):
        artifact = PortalArtifact.objects.get(name=f"sidebar-{section}.json")
        assert json.loads(artifact.content) == nav.build_tree(section)


def test_file_missing_from_order_is_appended_and_reported(db, source):  # noqa: ARG001
    order = source / "docs" / "about Sefaria" / "_order.yaml"
    order.write_text("- guide-to-contributing\n", encoding="utf-8")
    report = run_import(source)
    assert report["not_in_order"] == ["docs/about Sefaria/general-faq"]
    slugs = list(
        Page.objects.filter(parent__slug="about Sefaria", parent__kind="category")
        .order_by("position")
        .values_list("slug", flat=True),
    )
    assert slugs == ["guide-to-contributing", "general-faq"]


# --- dates --------------------------------------------------------------------------------------


def test_content_updated_at_comes_from_live_sidebars(imported):  # noqa: ARG001
    welcome = Page.objects.get(section=Section.DOCS, slug="welcome")
    assert welcome.content_updated_at.isoformat() == "2026-11-12T11:51:58+00:00"
    hidden = Page.objects.get(section=Section.DOCS, slug="accessibility-at-sefaria")
    assert hidden.content_updated_at.isoformat() == "2026-11-12T11:52:55+00:00"  # the snapshot's commit date


# --- idempotence, local edits, changed source ---------------------------------------------------


def test_second_run_changes_nothing(imported):
    source_dir, _ = imported
    before = _snapshot()
    report = run_import(source_dir)
    assert report["changes"] == 0
    assert report["created"] == report["updated"] == report["moved"] == []
    assert report["unchanged"] == 160
    assert _snapshot() == before


def test_local_edit_is_kept_and_force_replaces_it(imported):
    source_dir, _ = imported
    page = Page.objects.get(section=Section.DOCS, slug="welcome")
    edit = publish.create_revision(
        page,
        source=RevisionSource.EDITOR,
        base=page.published_revision,
        body_md="Edited in the new editor.\n",
    )
    publish.publish(page, edit, rebuild=False)
    target = source_dir / "docs" / "TECHNICAL DOCS" / "welcome.md"
    target.write_text(target.read_text(encoding="utf-8") + "\nUpstream change.\n", encoding="utf-8")

    report = run_import(source_dir)
    page.refresh_from_db()
    assert page.published_revision_id == edit.pk
    kept = [k for k in report["kept_local_edits"] if k["page"] == "docs/welcome"]
    assert kept
    assert "Upstream change." in kept[0]["diff"]
    assert report["changes"] == 0

    report = run_import(source_dir, force=["docs/welcome"])
    page.refresh_from_db()
    assert report["forced"] == ["docs/welcome"]
    assert page.published_revision.source == RevisionSource.IMPORT
    assert page.published_revision.body_md.endswith("Upstream change.\n")


def test_changed_source_makes_exactly_one_revision(imported):
    source_dir, _ = imported
    before = PageRevision.objects.count()
    target = source_dir / "docs" / "SEFARIA RESEARCH" / "patot.md"
    target.write_text(target.read_text(encoding="utf-8") + "\nOne more line.\n", encoding="utf-8")
    report = run_import(source_dir)
    assert report["updated"] == ["docs/patot"]
    assert PageRevision.objects.count() == before + 1
    page = Page.objects.get(section=Section.DOCS, slug="patot")
    assert page.published_revision.body_md.endswith("One more line.\n")
    assert page.published_revision.source == RevisionSource.IMPORT


def test_removed_page_is_reported_and_pruned(imported):
    source_dir, _ = imported
    (source_dir / "docs" / "SEFARIA RESEARCH" / "patot.md").unlink()
    report = run_import(source_dir)
    assert report["missing"] == ["docs/patot"]
    assert Page.objects.get(slug="patot").deleted_at is None
    report = run_import(source_dir, prune=True)
    assert report["pruned"] == ["docs/patot"]
    assert Page.objects.get(slug="patot").deleted_at is not None


def test_order_is_left_alone_after_an_editor_tree_change(imported):
    source_dir, _ = imported
    page = Page.objects.get(section=Section.DOCS, slug="patot")
    page.position = 99
    page.save()
    EditorAuditLog.objects.create(action=EditorAuditLog.Action.MOVE, page=page, section="docs", path="/docs/patot")
    report = run_import(source_dir)
    page.refresh_from_db()
    assert page.position == 99
    assert [o["page"] for o in report["order_not_applied"]] == ["docs/patot"]
    # Other sections still follow the source.
    ref = Page.objects.get(section=Section.REFERENCE, slug="get-shape")
    ref.position = 50
    ref.save()
    run_import(source_dir)
    ref.refresh_from_db()
    assert ref.position == 2


def test_dry_run_leaves_the_database_unchanged(db, source):  # noqa: ARG001
    before = _snapshot()
    report = run_import(source, dry_run=True)
    assert report["changes"] == 160
    assert _snapshot() == before
    assert not PortalArtifact.objects.exists()


def test_report_is_stored_as_an_artifact(imported):  # noqa: ARG001
    report = json.loads(PortalArtifact.objects.get(name=REPORT_ARTIFACT).content)
    assert report["counts"]["files"] == 152
    assert {f["slug"] for f in report["files"] if "link" in f["flags"]} == {"helpful-link-somewhere-else"}


def test_import_command_prints_the_report(db, source, capsys):  # noqa: ARG001
    call_command("devportal_import", "--source", str(source), "--no-sync-spec", "--dry-run")
    out = capsys.readouterr().out
    assert "files 152, hidden 11, deprecated 1, link 1" in out
    assert "DRY RUN" in out


# --- links (§7.4) -------------------------------------------------------------------------------


def test_each_link_fix_applies_its_expected_count(imported):
    source_dir, report = imported
    fixes = yaml.safe_load((source_dir / "link_fixes.yaml").read_text(encoding="utf-8"))["fixes"]
    assert len(report["link_fixes"]) == len(fixes)
    for fix in report["link_fixes"]:
        assert fix["applied"] == fix["expected"], fix
    assert [p["found"] for p in report["placeholder_links"]] == [1, 1]


def test_no_prefixed_link_remains_and_every_internal_link_resolves(imported):  # noqa: ARG001
    for page in Page.objects.exclude(published_revision=None):
        rev = page.published_revision
        for dest in md.link_destinations(rev.body_md):
            assert not dest.startswith(("doc:", "ref:", "page:")), (page.slug, dest)
            assert "developers.sefaria.org" not in dest, (page.slug, dest)
    report = nav.check_links()
    assert report["unresolved"] == []
    assert report["links"] > 400


def test_specific_fixes_landed(imported):  # noqa: ARG001
    body = Page.objects.get(slug="the-structure-of-a-complex-text").published_revision.body_md
    assert "](/docs/node-titles#3-default-nodes)" in body
    body = Page.objects.get(slug="linker-api").published_revision.body_md
    assert "](https://www.sefaria.org/texts)" in body
    nxt = Page.objects.get(slug="general-faq").published_revision.next
    assert nxt["pages"][0]["slug"] == "guide-to-contributing"


def test_links_in_code_are_not_rewritten(db, source):  # noqa: ARG001
    target = source / "docs" / "SEFARIA RESEARCH" / "patot.md"
    extra = "\n```\n[x](doc:welcome)\n```\n\nSee `[y](doc:welcome)` and [z](doc:welcome) <https://developers.sefaria.org/docs/x>\n"
    target.write_text(target.read_text(encoding="utf-8") + extra, encoding="utf-8")
    run_import(source)
    body = Page.objects.get(slug="patot").published_revision.body_md
    assert "```\n[x](doc:welcome)\n```" in body
    assert "`[y](doc:welcome)`" in body
    assert "[z](/docs/welcome)" in body
    assert "<https://developers.sefaria.org/docs/x>" in body


def test_a_link_fix_that_no_longer_matches_fails_the_import(db, source):  # noqa: ARG001
    target = source / "docs" / "TECHNICAL DOCS" / "welcome.md"
    target.write_text(target.read_text(encoding="utf-8").replace("doc:each-book-is-an-index", "doc:x"), "utf-8")
    with pytest.raises(SourceError, match="welcome.md"):
        run_import(source)
    assert not Page.objects.exists()


def test_an_endpoint_stub_must_match_the_spec(db, source):  # noqa: ARG001
    stub = source / "reference" / "Sefaria API" / "ref" / "get-ref.md"
    stub.write_text(stub.read_text(encoding="utf-8").replace("operationId: get-ref", "operationId: get-nope"), "utf-8")
    with pytest.raises(SourceError, match="get-ref"):
        run_import(source)


# --- names and parsing --------------------------------------------------------------------------


def test_hebrew_slugs_and_folders_with_spaces(imported):  # noqa: ARG001
    slug = "איך-ליצור-מראי-מקורות-להפניה"
    page = Page.objects.get(section=Section.DOCS, slug=slug)
    assert page.parent.slug == "linker"
    encoded = "/docs/" + quote(slug)
    assert nav.resolve_path(encoded) == page
    assert nav.public_path(page) == encoded
    assert Page.objects.get(kind=PageKind.CATEGORY, slug="local installation").children.count() == 6


def test_front_matter_without_a_trailing_newline_parses(db, source):  # noqa: ARG001
    data, body = split_front_matter("---\ntitle: X\nhidden: false\n---")
    assert data == {"title": "X", "hidden": False}
    assert body == ""
    stub = source / "reference" / "Sefaria API" / "ref" / "get-ref.md"
    assert not stub.read_text(encoding="utf-8").endswith("\n")  # the source has such files
    run_import(source)
    assert Page.objects.get(slug="get-ref").published_revision.body_md == ""


def test_every_published_page_is_rendered(imported):  # noqa: ARG001
    version = md.renderer_version()
    for page in Page.objects.exclude(kind=PageKind.CATEGORY).select_related("published_revision"):
        rev = page.published_revision
        assert rev.renderer_version == version, page.slug
        assert bool(rev.rendered_html) == bool(rev.body_md.strip()), page.slug


def test_titles_and_excerpts_equal_live_pages(imported):  # noqa: ARG001
    """The h1 and excerpt of every captured docs page equal the imported revision's (research/site/pages.json)."""
    from .content_helpers import REPO_ROOT

    captured = json.loads((REPO_ROOT / "docs/dev-portal/research/site/pages.json").read_text(encoding="utf-8"))
    checked = 0
    for entry in captured:
        path = entry["url"].replace("https://developers.sefaria.org", "")
        page = nav.resolve_path(path) if path.startswith("/docs/") else None
        if page is None:
            continue
        rev = page.published_revision
        assert rev.title == entry["h1"], page.slug
        assert " ".join(rev.excerpt.split()) == " ".join((entry.get("excerpt") or "").split()), page.slug
        checked += 1
    assert checked == 59  # the 60 visible docs pages, less the link page
