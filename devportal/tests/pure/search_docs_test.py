"""The search documents (PLAN §2.9, contract C3), built from the content snapshot and the spec. No Django."""

import json
from itertools import count
from pathlib import Path
from types import SimpleNamespace

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from devportal.markdown import parse_front_matter
from devportal.services import search_index
from devportal.services.search_index import (
    artifact_name,
    artifact_url,
    build_search_documents,
    search_documents_payload,
)
from devportal.spec import Overlay, load_spec

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "migration_source"
SCHEMAS = ROOT / "contracts" / "schemas"


def _validator():
    schemas = [json.loads(p.read_text(encoding="utf-8")) for p in SCHEMAS.glob("*.schema.json")]
    registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
    main = next(s for s in schemas if s["$id"].endswith("/search-documents.schema.json"))
    return Draft202012Validator(main, registry=registry)


def _page(ids, section, kind, slug, parent=None, *, operation_id=None, deleted=False):
    return SimpleNamespace(
        id=next(ids),
        section=section,
        kind=kind,
        slug=slug,
        parent_id=parent.id if parent is not None else None,
        operation_id=operation_id,
        deleted_at="2026-01-01" if deleted else None,
        url_path=None if kind == "category" else f"/{section}/{slug}",
    )


def _revision(front, body):
    return SimpleNamespace(
        title=front.get("title") or "",
        excerpt=front.get("excerpt") or "",
        body_md=body,
        hidden=bool(front.get("hidden", False)),
        deprecated=bool(front.get("deprecated", False)),
        title_override="",
        sidebar_label="",
        description_override_md="",
        renderer_version="",
        search_text="",
        rendered_toc=[],
    )


def _snapshot_pages():
    """(page, revision) pairs shaped like the import's tree: folder index.md files are the parents."""
    ids = count(1)
    pairs = []
    expected_visible, expected_hidden = set(), set()

    def walk(folder, section, parent):
        for path in sorted(folder.iterdir()):
            if path.is_dir():
                child_parent = parent
                own = path / "index.md"
                if own.exists():
                    front, body = parse_front_matter(own.read_text(encoding="utf-8"))
                    page = _add(front, body, section, path.name, parent, own)
                    child_parent = page
                walk(path, section, child_parent)
            elif path.suffix in (".md", ".html") and path.name != "index.md":
                front, body = parse_front_matter(path.read_text(encoding="utf-8"))
                _add(front, body, section, path.stem, parent, path)

    def _add(front, body, section, slug, parent, path):
        api = front.get("api") or {}
        if api.get("operationId"):
            kind, op = "endpoint", api["operationId"]
        elif (front.get("link") or {}).get("url"):
            kind, op = "link", None
        elif path.name == "index.md" and "Sefaria API" in path.parts:
            kind, op = "tag_group", None  # the 12 tag stubs (PLAN F-2)
        elif "ReadMeConfig" in path.parts:
            kind, op = "api_config", None
        else:
            kind, op = "page", None
        page = _page(ids, section, kind, slug, parent, operation_id=op)
        revision = _revision(front, body)
        pairs.append((page, revision))
        if kind == "page":
            hidden = revision.hidden or (parent is not None and parent.id in hidden_ids)
            if hidden:
                hidden_ids.add(page.id)
                expected_hidden.add(f"page:{page.id}")
            else:
                expected_visible.add(f"page:{page.id}")
        elif revision.hidden:
            hidden_ids.add(page.id)
        return page

    hidden_ids = set()
    for section, folder in (
        ("docs", SOURCE / "docs"),
        ("reference", SOURCE / "reference"),
        ("page", SOURCE / "custom_pages"),
    ):
        for top in sorted(p for p in folder.iterdir() if p.is_dir()) if section != "page" else [None]:
            if top is None:
                walk(folder, section, None)
                continue
            category = _page(ids, section, "category", top.name)
            pairs.append((category, _revision({"title": top.name}, "")))
            walk(top, section, category)
        if section != "page":
            for path in sorted(folder.glob("*.md")):
                front, body = parse_front_matter(path.read_text(encoding="utf-8"))
                _add(front, body, section, path.stem, None, path)
    return pairs, expected_visible, expected_hidden


@pytest.fixture(scope="module")
def spec():
    return load_spec()


@pytest.fixture(scope="module")
def snapshot(spec):
    pairs, visible, hidden = _snapshot_pages()
    documents = build_search_documents(pairs, spec, {})
    return SimpleNamespace(pairs=pairs, visible=visible, hidden=hidden, documents=documents)


def test_one_document_per_visible_page(snapshot):
    page_ids = {d["id"] for d in snapshot.documents if d["kind"] == "page"}
    assert snapshot.visible, "the snapshot has visible pages"
    assert page_ids == snapshot.visible


def test_hidden_pages_are_left_out(snapshot):
    assert snapshot.hidden, "the snapshot has hidden pages (I-6)"
    ids = {d["id"] for d in snapshot.documents}
    assert not (ids & snapshot.hidden)
    hidden_paths = {p.url_path for p, r in snapshot.pairs if f"page:{p.id}" in snapshot.hidden}
    assert not hidden_paths & {d["path"] for d in snapshot.documents if d["kind"] == "page"}


def test_links_categories_and_config_stubs_have_no_document(snapshot):
    kinds = {p.id: p.kind for p, _ in snapshot.pairs}
    for doc in snapshot.documents:
        if doc["kind"] == "page":
            assert kinds[int(doc["id"].split(":")[1])] == "page"


def test_one_document_per_operation(snapshot, spec):
    ops = [d for d in snapshot.documents if d["kind"] == "endpoint"]
    assert len(spec.operations()) == 61
    assert [d["id"] for d in ops] == [f"op:{op.operation_id}" for op in spec.operations()]
    for doc, op in zip(ops, spec.operations(), strict=True):
        assert doc["method"] == op.method
        assert doc["section"] == "reference"
        assert doc["path"] == f"/reference/{op.operation_id}"
        assert op.path in doc["body"]


def test_documents_match_the_contract(snapshot):
    payload = search_documents_payload(snapshot.documents, generation=7)
    errors = sorted(_validator().iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors[:5]]
    ids = [d["id"] for d in payload["documents"]]
    assert len(ids) == len(set(ids))
    assert payload["generation"] == 7


def test_page_document_fields(snapshot):
    welcome = next(d for d in snapshot.documents if d["path"] == "/docs/welcome")
    assert welcome["title"] == "Welcome to Sefaria's Technical Documentation"
    assert welcome["excerpt"].startswith("Explore Sefaria's technical documentation")
    assert welcome["section"] == "docs"
    assert welcome["body"]
    assert "<" not in welcome["body"]
    assert welcome["params"] == [] and welcome["responses"] == [] and welcome["method"] is None
    with_headings = [d for d in snapshot.documents if d["kind"] == "page" and d["headings"]]
    assert with_headings, "headings come from the rendered table of contents"
    sections = {d["section"] for d in snapshot.documents if d["kind"] == "page"}
    assert sections == {"docs", "reference", "page"}


def test_params_and_responses_are_included(snapshot):
    by_id = {d["id"]: d for d in snapshot.documents}
    texts = by_id["op:get-v3-texts"]
    names = [p["name"] for p in texts["params"]]
    assert "tref" in names and "version" in names
    version = next(p for p in texts["params"] if p["name"] == "version")
    assert "two possible forms" in version["description"]
    assert "`" not in version["description"], "descriptions are plain text"
    name = by_id["op:get-name"]
    assert any(
        r["status"] == "200" and "canonical ref for the submitted text" in r["description"] for r in name["responses"]
    ), "response schema field descriptions are searchable (live's 'Response Body • 200' rows)"
    find_refs = by_id["op:post-find-refs"]
    assert find_refs["method"] == "post"
    assert "text" in [p["name"] for p in find_refs["params"]], "request body fields count as parameters"


def test_overlay_titles_and_descriptions_are_used(spec):
    ids = count(1)
    group = _page(ids, "reference", "tag_group", "text")
    page = _page(ids, "reference", "endpoint", "get-v3-texts", group, operation_id="get-v3-texts")
    revision = _revision({"title": "get-v3-texts"}, "## Extra notes\n\nSee the zebra example.")
    revision.title_override = "Texts, the overlay title"
    pairs = [(group, _revision({"title": "Text"}, "")), (page, revision)]
    docs = {d["id"]: d for d in build_search_documents(pairs, spec, {})}
    doc = docs["op:get-v3-texts"]
    assert doc["title"] == "Texts, the overlay title"
    assert "zebra" in doc["body"]
    assert doc["headings"] == ["Extra notes"]

    overlays = {
        "get-v3-texts": Overlay(title_override="From the overlays map", description_override_md="Override **text**.")
    }
    doc = {d["id"]: d for d in build_search_documents(pairs, spec, overlays)}["op:get-v3-texts"]
    assert doc["title"] == "From the overlays map"
    assert doc["excerpt"] == "Override text."


def test_hidden_endpoint_and_hidden_ancestor(spec):
    ids = count(1)
    group = _page(ids, "reference", "tag_group", "topic")
    hidden_op = _page(ids, "reference", "endpoint", "get-v2-topics", group, operation_id="get-v2-topics")
    category = _page(ids, "docs", "category", "SECRET")
    parent = _page(ids, "docs", "page", "parent", category)
    child = _page(ids, "docs", "page", "child", parent)
    deleted = _page(ids, "docs", "page", "gone", category, deleted=True)
    under_deleted = _page(ids, "docs", "page", "orphan", deleted)
    unpublished = _page(ids, "docs", "page", "draft-only", category)
    pairs = [
        (group, _revision({"title": "Topic"}, "")),
        (hidden_op, _revision({"title": "x", "hidden": True}, "")),
        (category, _revision({"title": "SECRET"}, "")),
        (parent, _revision({"title": "Parent", "hidden": True}, "Body")),
        (child, _revision({"title": "Child"}, "Body")),
        (deleted, _revision({"title": "Gone"}, "Body")),
        (under_deleted, _revision({"title": "Orphan"}, "Body")),
        (unpublished, None),
    ]
    ids_out = {d["id"] for d in build_search_documents(pairs, spec, {})}
    assert "op:get-v2-topics" not in ids_out
    assert "op:get-v3-texts" in ids_out, "operations without a page row are kept by default"
    assert not {f"page:{p.id}" for p in (parent, child, deleted, under_deleted, unpublished)} & ids_out
    only_paged = build_search_documents(pairs, spec, {}, include_unpaged_operations=False)
    assert [d for d in only_paged if d["kind"] == "endpoint"] == []


def test_cached_render_is_used_when_present(spec):
    ids = count(1)
    page = _page(ids, "docs", "page", "cached")
    revision = _revision({"title": "Cached"}, "# Source text")
    revision.renderer_version = "c4-1"
    revision.search_text = "Rendered once"
    revision.rendered_toc = [{"level": 2, "id": "a", "text": "Cached heading"}]
    doc = build_search_documents([(page, revision)], spec, {}, include_unpaged_operations=False)[0]
    assert doc["body"] == "Rendered once"
    assert doc["headings"] == ["Cached heading"]


def test_sha_names_the_file_and_tracks_content(snapshot):
    payload = search_documents_payload(snapshot.documents, generation=1)
    again = search_documents_payload(snapshot.documents, generation=2)
    assert payload["sha"] == again["sha"], "the sha hashes the documents, not the generation"
    changed = [dict(snapshot.documents[0], title="Changed"), *snapshot.documents[1:]]
    assert search_documents_payload(changed, generation=1)["sha"] != payload["sha"]
    assert artifact_name(payload["sha"]) == f"search-docs.{payload['sha']}.json"
    assert artifact_url(payload["sha"]) == f"/_portal/search-docs.{payload['sha']}.json"


def test_importing_the_module_needs_no_django():
    assert search_index.SEARCH_DOCS_ARTIFACT == "search-docs"
