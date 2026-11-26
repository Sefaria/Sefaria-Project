"""The search documents built from the database (PLAN §2.9, I-6): the artifact builder and its lookup."""

import json
from pathlib import Path

import pytest
from django.utils import timezone
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from devportal.models import Page, PageKind, PageRevision, PortalArtifact, RevisionSource, Section
from devportal.services import search_index
from devportal.spec import load_spec
from devportal.tests.reference_fixtures import build_reference_tree

pytestmark = pytest.mark.django_db

SCHEMAS = Path(__file__).resolve().parents[1] / "contracts" / "schemas"


def _validator():
    schemas = [json.loads(p.read_text(encoding="utf-8")) for p in SCHEMAS.glob("*.schema.json")]
    registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
    main = next(s for s in schemas if s["$id"].endswith("/search-documents.schema.json"))
    return Draft202012Validator(main, registry=registry)


def _docs_page(slug, *, parent=None, hidden=False, body="Some body text.", title=None, position=0, kind=PageKind.PAGE):
    page = Page.objects.create(section=Section.DOCS, kind=kind, slug=slug, parent=parent, position=position)
    rev = PageRevision.objects.create(
        page=page, number=1, source=RevisionSource.IMPORT, title=title or slug, body_md=body, hidden=hidden
    )
    page.published_revision = rev
    page.save(update_fields=["published_revision"])
    return page


@pytest.fixture
def content():
    pages = build_reference_tree()
    category = _docs_page("TECHNICAL DOCS", kind=PageKind.CATEGORY, body="")
    pages["welcome"] = _docs_page("welcome", parent=category, title="Welcome", body="## What is Sefaria?\n\nA library.")
    pages["secret"] = _docs_page("secret", parent=category, hidden=True, position=1)
    pages["under-secret"] = _docs_page("under-secret", parent=pages["secret"])
    pages["deleted"] = _docs_page("deleted", parent=category, position=2)
    pages["deleted"].deleted_at = timezone.now()
    pages["deleted"].save(update_fields=["deleted_at"])
    texts_rev = pages["get-v3-texts"].published_revision
    texts_rev.title_override = "Texts, as the editor named it"
    texts_rev.save(update_fields=["title_override"])
    return pages


def test_build_from_database(content):
    payload = search_index.build_from_database(generation=3)
    assert not list(_validator().iter_errors(payload))
    docs = {d["id"]: d for d in payload["documents"]}
    page_ids = {d["id"] for d in payload["documents"] if d["kind"] == "page"}
    assert page_ids == {f"page:{content['welcome'].id}", f"page:{content['getting-started'].id}"}
    assert docs[f"page:{content['welcome'].id}"]["headings"] == ["What is Sefaria?"]
    endpoint_ids = [d["id"] for d in payload["documents"] if d["kind"] == "endpoint"]
    assert "op:get-v2-topics" not in endpoint_ids, "its endpoint page is hidden"
    assert len(endpoint_ids) == len(load_spec().operations()) - 1
    assert docs["op:get-v3-texts"]["title"] == "Texts, as the editor named it"
    assert payload["generation"] == 3
    assert payload["documents"][0]["section"] == "docs", "docs first, then the reference"


def test_artifact_builder_and_lookup(content):
    assert search_index.current_search_docs() is None
    built = search_index.build_artifact({"generation": 5})
    PortalArtifact.objects.create(name=search_index.SEARCH_DOCS_ARTIFACT, content=json.dumps(built), generation=5)
    sha, raw = search_index.current_search_docs()
    assert sha == built["sha"]
    assert json.loads(raw)["documents"] == built["documents"]
    assert search_index.artifact_url(sha) == f"/_portal/search-docs.{sha}.json"
