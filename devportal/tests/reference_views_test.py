"""The API reference views (PLAN.md §2.4, §2.7; C9 reference-root and reference-page)."""

import json
import re
from pathlib import Path

import pytest
from django.urls import path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from devportal.models import PageKind
from devportal.tests.reference_fixtures import build_reference_tree, make_page
from devportal.views import reference

# Until the Integrator wires these into devportal/urls.py, the tests use their own URLconf.
urlpatterns = [
    path("reference", reference.reference_root),
    path("reference/<str:slug>", reference.reference_page),
]

pytestmark = [pytest.mark.django_db, pytest.mark.urls(__name__)]

SCHEMAS = Path(__file__).resolve().parents[1] / "contracts" / "schemas"


@pytest.fixture(scope="module")
def payload_validator():
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in SCHEMAS.glob("*.schema.json")]
    registry = Registry().with_resources((d["$id"], Resource.from_contents(d)) for d in docs)
    schema = next(d for d in docs if d["$id"].endswith("/page-payload.schema.json"))
    return Draft202012Validator(schema, registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER)


@pytest.fixture
def tree():
    return build_reference_tree()


@pytest.fixture(autouse=True)
def no_bundle(tmp_path):
    """These tests read the server's own endpoint markup, the page without a prerendered article; a local
    static/bundles/devportal build must not change it (integration_round2_test.py covers the prerendered page)."""
    from django.test import override_settings

    from devportal.templatetags import devportal_assets

    devportal_assets.clear_caches()
    with override_settings(DEVPORTAL_BUNDLE_DIR=str(tmp_path / "no-bundle")):
        yield
    devportal_assets.clear_caches()


def _island(response):
    match = re.search(r'<script\b[^>]*\bid="dp-data"[^>]*>(.*?)</script>', response.content.decode(), re.S)
    assert match, "no #dp-data island"
    return json.loads(match.group(1))


def test_reference_root_is_a_permanent_redirect(client):
    response = client.get("/reference")
    assert response.status_code == 301
    assert response["Location"] == "/reference/getting-started"


@pytest.mark.parametrize(
    ("group", "target"),
    [
        ("text", "/reference/get-v3-texts"),
        ("index", "/reference/get-v2-index"),
        ("index-1", "/reference/get-author-indexes"),
        ("misc", "/reference/post-find-refs"),
    ],
)
def test_tag_group_redirects_302_to_its_first_child(client, tree, group, target):
    response = client.get(f"/reference/{group}")
    assert response.status_code == 302
    assert response["Location"] == target


def test_index_and_index_1_are_separate_groups(client, tree):
    assert tree["index"].kind == tree["index-1"].kind == PageKind.TAG_GROUP
    assert tree["index"].published_revision.title == tree["index-1"].published_revision.title == "Index"
    assert client.get("/reference/index")["Location"] != client.get("/reference/index-1")["Location"]
    assert client.get("/reference/get-shape").status_code == 200
    assert client.get("/reference/get-index-titles").status_code == 200


def test_tag_group_skips_hidden_unpublished_and_deleted_children(client, tree):
    # get-v2-topics is hidden: the first visible child of "topic" is get-topic-slug.
    assert client.get("/reference/topic")["Location"] == "/reference/get-topic-slug"
    from django.utils import timezone

    tree["get-topic-slug"].deleted_at = timezone.now()
    tree["get-topic-slug"].save()
    make_page(
        PageKind.ENDPOINT,
        "x-draft",
        parent=tree["topic"],
        position=0,
        operation_id="get-recommend-topics",
        published=False,
    )
    assert client.get("/reference/topic")["Location"] == "/reference/get-all-topics"


def test_tag_group_without_visible_children_is_404(client, tree):
    make_page(PageKind.TAG_GROUP, "empty", parent=tree["Sefaria API"], position=99, title="Empty")
    assert client.get("/reference/empty").status_code == 404


def test_hidden_endpoint_still_answers_at_its_url(client, tree):
    assert client.get("/reference/get-v2-topics").status_code == 200


def test_unknown_slug_and_category_are_404(client, tree):
    assert client.get("/reference/no-such-page").status_code == 404
    assert client.get("/reference/Sefaria%20API").status_code == 404


@pytest.mark.parametrize("op_id", ["get-v1-texts", "get-topic-slug"])
def test_the_two_deprecated_operations(client, tree, payload_validator, op_id):
    response = client.get(f"/reference/{op_id}")
    assert response.status_code == 200
    html = response.content.decode()
    assert "dp-endpoint-deprecated" in html
    data = _island(response)
    payload_validator.validate(data)
    assert data["operation"]["deprecated"] is True


def test_endpoint_page(client, tree, payload_validator):
    response = client.get("/reference/get-v3-texts")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/html; charset=utf-8"
    html = response.content.decode()
    assert "<title>Texts (v3)</title>" in html
    assert '<h1 class="dp-endpoint-title" dir="auto">Texts (v3)</h1>' in html
    assert "dp-endpoint-deprecated" not in html
    assert "The most up-to-date way to retrieve texts from Sefaria via the API" in html
    data = _island(response)
    payload_validator.validate(data)
    assert data["kind"] == "endpoint"
    assert data["title"] == data["page"]["title"] == data["page"]["sidebarLabel"] == "Texts (v3)"
    assert data["path"] == "/reference/get-v3-texts"
    assert data["pageId"] == tree["get-v3-texts"].pk
    assert data["operation"] == {
        "operationId": "get-v3-texts",
        "method": "get",
        "path": "/api/v3/texts/{tref}",
        "tags": ["Text"],
        "deprecated": False,
        "specUrl": "/static/bundles/devportal/spec/get-v3-texts.json",
        "specSha": data["operation"]["specSha"],
    }
    assert len(data["operation"]["specSha"]) == 64
    assert data["page"]["bodyHtml"] == ""
    assert data["meta"]["canonicalUrl"] == "http://testserver/reference/get-v3-texts"
    assert data["meta"]["markdownUrl"] == "http://testserver/reference/get-v3-texts.md"


def test_endpoint_overlay(client, tree, payload_validator):
    rev = tree["get-versions"].published_revision
    rev.title_override = "All versions"
    rev.sidebar_label = "Versions list"
    rev.description_override_md = "Overlay **description**."
    rev.body_md = "Extra notes."
    rev.save()
    response = client.get("/reference/get-versions")
    html = response.content.decode()
    assert "<title>All versions</title>" in html
    assert "Overlay" in html and "Extra notes." in html
    assert "The versions API takes a title" not in html
    data = _island(response)
    payload_validator.validate(data)
    assert data["title"] == data["page"]["title"] == "All versions"
    assert data["page"]["sidebarLabel"] == "Versions list"
    assert "Overlay" in data["page"]["descriptionHtml"]
    assert "Extra notes." in data["page"]["bodyHtml"]
    assert reference.published_overlays()["get-versions"].title_override == "All versions"


def test_endpoint_whose_operation_left_the_spec_is_404(client, tree):
    make_page(PageKind.ENDPOINT, "get-gone", parent=tree["misc"], position=5, operation_id="get-gone")
    assert client.get("/reference/get-gone").status_code == 404


def test_hand_written_reference_page_is_not_handled_here(client, tree, monkeypatch):
    # Delegated to the docs-page view of devportal.views.pages; a 404 while that view does not exist.
    calls = []

    class FakePages:
        @staticmethod
        def doc_page(request, *, section, slug):
            from django.http import HttpResponse

            calls.append((section, slug))
            return HttpResponse("doc")

    real_import = reference.importlib.import_module
    monkeypatch.setattr(
        reference.importlib,
        "import_module",
        lambda name: FakePages if name == "devportal.views.pages" else real_import(name),
    )
    assert client.get("/reference/getting-started").content == b"doc"
    assert calls == [("reference", "getting-started")]


def test_payload_for_page_json(tree, payload_validator):
    assert reference.reference_payload(None) == {
        "contractVersion": 1,
        "path": "/reference",
        "kind": "redirect",
        "status": 301,
        "location": "/reference/getting-started",
    }
    redirect = reference.reference_payload("index-1")
    payload_validator.validate(redirect)
    assert (redirect["status"], redirect["location"]) == (302, "/reference/get-author-indexes")
    endpoint = reference.reference_payload("get-topic-slug")
    payload_validator.validate(endpoint)
    assert endpoint["operation"]["deprecated"] is True
    assert reference.reference_payload("getting-started") is None
    assert reference.reference_payload("nope") is None


def test_head_is_allowed_and_post_is_not(client, tree):
    assert client.head("/reference/get-v3-texts").status_code == 200
    assert client.post("/reference/get-v3-texts").status_code == 405
