"""The gallery views (PLAN.md §2.14, Phase 6; C9 gallery, gallery-project, gallery-charts, powered-by-api).

301 for a non-canonical project slug, 404 for an unknown or unpublished id, noindex for /powered-by/charts, and a
same-origin API. Runs under both settings modules: the projects come from a fixture file written per test (the
standalone source), and, where the powered_by app is installed, from its model.
"""

import json
import re
from pathlib import Path

import pytest
from django.apps import apps
from django.urls import path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from devportal.views import gallery

# Until the Integrator wires these into devportal/urls.py, the tests use their own URLconf.
urlpatterns = [
    path("powered-by", gallery.gallery_index),
    path("powered-by/charts", gallery.gallery_charts),
    path("powered-by/projects/<str:slug>", gallery.gallery_project),
    path("powered-by/<path:rest>", gallery.gallery_unknown),
]

pytestmark = [pytest.mark.django_db, pytest.mark.urls(__name__)]

REPO = Path(__file__).resolve().parents[2]
SCHEMAS = REPO / "devportal" / "contracts" / "schemas"
GALLERY_SRC = REPO / "devportal-ui" / "src" / "gallery"


def row(project_id, name, **extra):
    return {
        "id": project_id,
        "project_name": name,
        "project_desc": f"About {name}.",
        "project_why": None,
        "project_link": f"https://example.org/{project_id}",
        "project_source_code": None,
        "project_category": "Learning & Study Tools",
        "is_buggy": False,
        "is_published": True,
        **extra,
    }


ROWS = [
    row(141, "Torah MCP", project_why="Models misquote sources."),
    row(7, "Today’s Daf"),
    row(5, "תורה"),
    row(9, "Old App", is_buggy=True),
    row(12, "Secret Draft", is_published=False),
]


@pytest.fixture(autouse=True)
def fixture_projects(settings, tmp_path, monkeypatch):
    """Serve ROWS the way the standalone server does, whatever settings module runs the suite."""
    fixture = tmp_path / "projects.json"
    fixture.write_text(json.dumps({"projects": ROWS}), encoding="utf-8")
    settings.DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE = str(fixture)
    real = apps.is_installed
    monkeypatch.setattr(gallery.apps, "is_installed", lambda name: False if name == "powered_by" else real(name))
    return fixture


@pytest.fixture(scope="module")
def payload_validator():
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in SCHEMAS.glob("*.schema.json")]
    registry = Registry().with_resources((d["$id"], Resource.from_contents(d)) for d in docs)
    schema = next(d for d in docs if d["$id"].endswith("/page-payload.schema.json"))
    return Draft202012Validator(schema, registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER)


def _html(response):
    return response.content.decode()


def _island(response):
    match = re.search(r'<script\b[^>]*\bid="dp-data"[^>]*>(.*?)</script>', _html(response), re.S)
    assert match, "no #dp-data island"
    return json.loads(match.group(1))


def _robots(response):
    match = re.search(r'<meta name="robots" content="([^"]*)">', _html(response))
    return match.group(1) if match else None


# -- the browse page ---------------------------------------------------------------------------------------


def test_index_lists_the_published_projects_for_search_engines(client, payload_validator):
    response = client.get("/powered-by")
    assert response.status_code == 200
    html = _html(response)
    for project_id, slug, name in ((141, "141-torah-mcp", "Torah MCP"), (7, "7-todays-daf", "Today’s Daf")):
        assert f'href="/powered-by/projects/{slug}"' in html, project_id
        assert name in html
    assert 'href="/powered-by/projects/5"' in html  # a name with no latin letters is the bare id
    assert "About Torah MCP." in html
    assert "Secret Draft" not in html  # unpublished
    assert 'href="/powered-by/projects/9-old-app"' in html  # known issues are listed apart, still crawlable
    assert _robots(response) == "index, follow"
    payload = _island(response)
    payload_validator.validate(payload)
    assert payload["kind"] == "gallery"
    assert payload["view"] == "index"
    assert payload["projectId"] is None
    assert payload["site"]["analyticsSection"] == "gallery"
    assert payload["meta"]["canonicalUrl"] == "http://testserver/powered-by"


def test_index_social_urls_use_the_request_origin(client):
    html = _html(client.get("/powered-by", HTTP_HOST="developers.localhost"))
    assert '<link rel="canonical" href="http://developers.localhost/powered-by">' in html
    assert '<meta property="og:url" content="http://developers.localhost/powered-by">' in html
    assert (
        '<meta property="og:image" content="http://developers.localhost/static/bundles/devportal/gallery/og-image.png">'
        in html
    )
    assert "powered-by.sefaria.org" not in html


def test_index_answers_head(client):
    assert client.head("/powered-by").status_code == 200
    assert client.post("/powered-by").status_code == 405


def test_ga4_id_reaches_the_page_through_the_payload(client, settings):
    settings.DEVPORTAL_GA4 = {"default": "G-6SXQFSB219", "gallery": "G-44RHV2ZWQ1"}
    site = _island(client.get("/powered-by"))["site"]
    assert site["ga4"][site["analyticsSection"]] == "G-44RHV2ZWQ1"
    settings.DEVPORTAL_GA4 = {}
    assert _island(client.get("/powered-by"))["site"]["ga4"] == {}


# -- project pages -------------------------------------------------------------------------------------------


def test_canonical_project_page(client, payload_validator):
    response = client.get("/powered-by/projects/141-torah-mcp")
    assert response.status_code == 200
    html = _html(response)
    assert "<h1>Torah MCP</h1>" in html
    assert "Models misquote sources." in html
    assert 'href="https://example.org/141"' in html
    assert "<title>Torah MCP · Powered by Sefaria</title>" in html
    assert _robots(response) == "index, follow"
    payload = _island(response)
    payload_validator.validate(payload)
    assert (payload["view"], payload["projectId"]) == ("project", 141)
    assert payload["title"] == "Torah MCP · Powered by Sefaria"
    assert payload["meta"]["canonicalUrl"] == "http://testserver/powered-by/projects/141-torah-mcp"
    assert payload["meta"]["description"] == "About Torah MCP."


@pytest.mark.parametrize(
    ("slug", "target"),
    [
        ("141-old-name", "/powered-by/projects/141-torah-mcp"),
        ("141", "/powered-by/projects/141-torah-mcp"),
        ("141-Torah-MCP", "/powered-by/projects/141-torah-mcp"),
        ("7-today-s-daf", "/powered-by/projects/7-todays-daf"),
        ("5-torah", "/powered-by/projects/5"),
        ("9", "/powered-by/projects/9-old-app"),
    ],
)
def test_non_canonical_slug_is_a_permanent_redirect(client, slug, target):
    response = client.get(f"/powered-by/projects/{slug}")
    assert response.status_code == 301
    assert response["Location"] == target


def test_redirect_keeps_the_query_string(client):
    response = client.get("/powered-by/projects/141?ref=x")
    assert response.status_code == 301
    assert response["Location"] == "/powered-by/projects/141-torah-mcp?ref=x"


@pytest.mark.parametrize("slug", ["999999-nope", "999999", "12-secret-draft", "torah-mcp", "0-x", "-5", "x141", "١٤١"])
def test_unknown_or_unpublished_id_is_a_real_404(client, payload_validator, slug):
    response = client.get(f"/powered-by/projects/{slug}")
    assert response.status_code == 404
    html = _html(response)
    assert "Project not found" in html
    assert "Secret Draft" not in html
    assert _robots(response) == "noindex, nofollow"
    payload = _island(response)
    payload_validator.validate(payload)
    assert (payload["view"], payload["projectId"], payload["meta"]["robots"]) == ("project", None, "noindex")


@pytest.mark.parametrize("path", ["/powered-by/nope", "/powered-by/projects", "/powered-by/charts/x"])
def test_other_gallery_paths_are_a_real_404(client, payload_validator, path):
    response = client.get(path)
    assert response.status_code == 404
    assert "<h1>Page not found</h1>" in _html(response)
    assert _robots(response) == "noindex, nofollow"
    payload_validator.validate(_island(response))


def test_known_issues_project_has_a_page(client):
    response = client.get("/powered-by/projects/9-old-app")
    assert response.status_code == 200
    assert "This project has known issues." in _html(response)


# -- the charts page -------------------------------------------------------------------------------------------


def test_charts_is_noindex(client, payload_validator):
    response = client.get("/powered-by/charts")
    assert response.status_code == 200
    assert _robots(response) == "noindex, nofollow"
    payload = _island(response)
    payload_validator.validate(payload)
    assert (payload["view"], payload["meta"]["robots"]) == ("charts", "noindex")
    assert payload["title"] == "Powered by Sefaria in numbers"


def test_charts_is_not_linked_from_the_gallery(client):
    for url in ("/powered-by", "/powered-by/projects/141-torah-mcp"):
        assert "/powered-by/charts" not in _html(client.get(url))


# -- the API is same-origin ---------------------------------------------------------------------------------------


def test_gallery_fetches_the_same_origin_api():
    api = (GALLERY_SRC / "lib" / "api.ts").read_text(encoding="utf-8")
    assert re.search(r"export const PROJECTS_URL = '/api/powered-by';", api)
    for source in GALLERY_SRC.rglob("*.ts*"):
        if "__tests__" in source.parts or "__fixtures__" in source.parts:
            continue
        text = source.read_text(encoding="utf-8")
        assert "sefaria.org/api/powered-by" not in text, source
        assert "powered-by.sefaria.org" not in text, source


@pytest.mark.urls("devportal.dev.urls_standalone")
def test_standalone_api_answers_from_the_fixture(client, fixture_projects):
    response = client.get("/api/powered-by")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/json")
    assert [p["id"] for p in response.json()["projects"]] == [r["id"] for r in ROWS]


# -- slugs match the gallery's slug.ts -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Torah MCP", "torah-mcp"),
        ("Today’s Daf", "todays-daf"),
        ("Sefaria Desktop (Unofficial)", "sefaria-desktop-unofficial"),
        ("Café  — Zohar!", "cafe-zohar"),
        ("תורה", ""),
    ],
)
def test_slugify_matches_slug_ts(name, slug):
    assert gallery.slugify(name) == slug


@pytest.mark.parametrize(("slug", "project_id"), [("141-torah-mcp", 141), ("141", 141), ("141-anything-else", 141)])
def test_parse_slug_reads_the_leading_id(slug, project_id):
    assert gallery.parse_slug(slug) == project_id


@pytest.mark.parametrize("slug", ["", "torah-mcp", "-5", "0-x", "x141", "1.5-x", "141\n"])
def test_parse_slug_rejects(slug):
    assert gallery.parse_slug(slug) is None


# -- the real model, where installed ---------------------------------------------------------------------------------


@pytest.mark.skipif(not apps.is_installed("powered_by"), reason="the standalone settings do not install powered_by")
def test_reads_published_projects_from_the_model(client, monkeypatch):
    from powered_by.models import Project

    monkeypatch.setattr(gallery.apps, "is_installed", apps.is_installed)
    common = {"submission_source": "manual", "project_link": "https://example.com"}
    shown = Project.objects.create(project_name="Model Project", is_published=True, **common)
    hidden = Project.objects.create(project_name="Hidden Draft", is_published=False, **common)
    html = _html(client.get("/powered-by"))
    assert f'href="/powered-by/projects/{shown.pk}-model-project"' in html
    assert "Hidden Draft" not in html
    assert client.get(f"/powered-by/projects/{shown.pk}-model-project").status_code == 200
    assert client.get(f"/powered-by/projects/{shown.pk}").status_code == 301
    assert client.get(f"/powered-by/projects/{hidden.pk}-hidden-draft").status_code == 404
