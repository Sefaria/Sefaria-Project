"""The server half of the round-2 client integration (PLAN.md §2.5; Integrator):

- prev/next (C3 `pager`) equals live's on every docs page of research/site/pages.json, in the payload and in
  the server HTML, and endpoint pages get theirs from the reference sidebar;
- endpoint payloads carry the C3 sidebar tree (`nav.tree`), and the endpoint page draws the sidebar without
  JavaScript, inside base.html (CSP nonce, header, data island);
- the endpoint page includes the prerendered article (`{% devportal_prerendered "endpoint" … %}`), fitted to the
  payload, and falls back to a plain article when the file is missing.
"""

import html as html_lib
import json
import re
from urllib.parse import unquote, urlparse

import jsonschema
import pytest
from django.test import override_settings
from referencing import Registry, Resource

from devportal.models import PortalState
from devportal.templatetags import devportal_assets
from devportal.views import pages

from . import content_helpers
from .portal_helpers import CONTRACTS, REPO_ROOT, portal_client

imported = content_helpers.imported  # a fixture
source = content_helpers.source  # a fixture

PAGES_JSON = json.loads((REPO_ROOT / "docs/dev-portal/research/site/pages.json").read_text(encoding="utf-8"))
ORIGIN = "https://developers.sefaria.org"


def _path(entry):
    return unquote(urlparse(entry["url"]).path)


# Every page of kind `doc` on live: the 59 docs pages, the reference guide and the contact page.
DOC_ENTRIES = [e for e in PAGES_JSON if e["status"] == 200 and _path(e) != "/"]


def _island(text):
    match = re.search(r'<script type="application/json" id="dp-data"[^>]*>(.*?)</script>', text, re.S)
    assert match, "no #dp-data island"
    return json.loads(match.group(1))


def _validator(schema_name):
    schemas = CONTRACTS / "schemas"
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in schemas.glob("*.schema.json")]
    registry = Registry().with_resources((d["$id"], Resource.from_contents(d)) for d in docs)
    schema = next(d for d in docs if d["$id"].endswith(f"/{schema_name}"))
    return jsonschema.Draft202012Validator(schema, registry=registry)


def _shown(pager):
    return [{"t": link["title"], "h": link["path"]} for link in (pager["prev"], pager["next"]) if link]


# ------------------------------------------------------------------------------------------------- pager


def test_pager_pages_skip_groups_categories_and_links():
    tree = {
        "categories": [
            {
                "items": [
                    {"kind": "page", "title": "A", "href": "/docs/a", "children": []},
                    {"kind": "link", "title": "L", "href": "https://x.example", "children": []},
                    {
                        "kind": "tag_group",
                        "title": "G",
                        "href": "/reference/g",
                        "children": [{"kind": "endpoint", "title": "E", "href": "/reference/e", "children": []}],
                    },
                ]
            },
            {"items": [{"kind": "page", "title": "B", "href": "/docs/b", "children": []}]},
        ]
    }
    assert [p["path"] for p in pages.pager_pages(tree)] == ["/docs/a", "/reference/e", "/docs/b"]
    assert pages.pager_for(tree, "/reference/e") == {
        "prev": {"title": "A", "path": "/docs/a"},
        "next": {"title": "B", "path": "/docs/b"},
    }
    assert pages.pager_for(tree, "/docs/a") == {"prev": None, "next": {"title": "E", "path": "/reference/e"}}
    assert pages.pager_for(tree, "/docs/a", has_next_pages=True) == {"prev": None, "next": None}
    assert pages.pager_for(tree, "/reference/g") == {"prev": None, "next": None}
    assert pages.pager_for(None, "/docs/a") == {"prev": None, "next": None}


def test_pager_equals_live_on_every_docs_page(imported):  # noqa: ARG001
    assert len(DOC_ENTRIES) == 61
    mismatches = {}
    for entry in DOC_ENTRIES:
        path = _path(entry)
        if path in pages.PAGE_ELSEWHERE:  # sent elsewhere on the portal on purpose (the gallery)
            assert pages.resolve(path, ORIGIN)["kind"] == "redirect", path
            continue
        payload = pages.resolve(path, ORIGIN)
        assert payload["kind"] == "doc", path
        # A link to a page sent elsewhere on the portal (pages.PAGE_ELSEWHERE) points straight there.
        expected = [
            {"t": link["t"], "h": pages.PAGE_ELSEWHERE.get(unquote(link["h"]), unquote(link["h"]))}
            for link in entry["pagination"]
        ]
        if _shown(payload["pager"]) != expected:
            mismatches[path] = (_shown(payload["pager"]), expected)
    assert mismatches == {}


def test_server_html_renders_the_pager(imported):  # noqa: ARG001
    client = portal_client()
    text = client.get("/docs/the-sefaria-mcp").content.decode()
    nav = text[text.index('<nav class="dp-pagination"') :]
    nav = nav[: nav.index("</nav>")]
    assert 'href="/docs/sites-using-the-linker"' in nav and "dp-pagination__link--prev" in nav
    assert "dp-pagination__link--next" in nav
    assert _island(text)["pager"]["prev"]["path"] == "/docs/sites-using-the-linker"
    # Pages that list next.pages show none (the reference guide on live).
    assert '<nav class="dp-pagination"' not in client.get("/reference/getting-started").content.decode()


# --------------------------------------------------------------------------------------------- endpoints


def test_endpoint_payload_carries_the_sidebar_tree_and_live_pager(imported):  # noqa: ARG001
    tree_validator = _validator("sidebar-tree.schema.json")
    payload_validator = _validator("page-payload.schema.json")
    client = portal_client()
    generation = PortalState.load().generation
    for data in (
        _island(client.get("/reference/get-v3-texts").content.decode()),
        client.get("/_portal/page.json", {"path": "/reference/get-v3-texts"}).json(),
    ):
        assert list(payload_validator.iter_errors(data)) == []
        tree = data["nav"]["tree"]
        assert tree is not None and list(tree_validator.iter_errors(tree)) == []
        assert tree["section"] == "reference" and tree["generation"] == generation
        # As on live (research/reference/dom-outlines/get-v3-texts.outline.txt).
        assert data["pager"] == {
            "prev": {"title": "Frequently Asked Questions", "path": "/reference/others-have-asked"},
            "next": {"title": "Texts (v1)", "path": "/reference/get-v1-texts"},
        }
    # The client that already holds this generation's tree gets none (C3 `PageNav.tree`).
    cached = client.get("/_portal/page.json", {"path": "/reference/get-v3-texts", "nav": generation}).json()
    assert cached["nav"]["tree"] is None


def test_endpoint_page_is_a_full_portal_page_with_the_sidebar(imported):  # noqa: ARG001
    response = portal_client().get("/reference/get-v3-texts")
    assert response.status_code == 200
    text = response.content.decode()
    csp = response["Content-Security-Policy"]
    nonce = re.search(r"'nonce-([^']+)'", csp)[1]
    assert f'id="dp-data" nonce="{nonce}"' in text
    assert '<main class="dp-main" id="dp-main">' in text
    assert '<link rel="canonical" href="' in text and 'content="index"' in text
    sidebar = text[text.index('class="dp-docs__sidebar') : text.index("</nav>", text.index('class="dp-docs__sidebar'))]
    assert 'id="dp-sidebar"' in text
    assert 'href="/reference/get-v3-texts" aria-current="page"' in sidebar
    assert sidebar.count('class="dp-sidebar-link') > 40
    # The footer with prev/next, without JavaScript.
    assert 'aria-label="Previous Page: Frequently Asked Questions"' in text
    assert 'aria-label="Next Page: Texts (v1)"' in text


# --------------------------------------------------------------------------------- the prerendered article

PRERENDERED = (
    '<div class="dp-Endpoint-module__wrapper--x"><div class="dp-Endpoint-module__container--x">'
    '<article id="content" class="dp-Endpoint-module__article--x">'
    '<header class="dp-Article-module__headline--x" data-visual-region="headline">'
    '<h1 class="t"><span data-dp-slot="title">Spec title</span></h1>'
    '<div class="e" data-dp-slot="description"><div class="dp-md"><p>Spec description</p>\n</div></div></header>'
    '<div class="params">PARAMS</div></article>'
    '<div id="ReferencePlayground">PLAYGROUND</div></div></div>'
)


@pytest.fixture
def prerender_bundle(tmp_path):
    root = tmp_path / "devportal"
    (root / "prerender").mkdir(parents=True)
    (root / "prerender" / "endpoint-get-v3-texts.html").write_text(PRERENDERED, encoding="utf-8")
    (root / "prerender" / "manifest.json").write_text(
        json.dumps({"endpoint": {"get-v3-texts": "endpoint-get-v3-texts.html"}}), encoding="utf-8"
    )
    devportal_assets.clear_caches()
    with override_settings(DEVPORTAL_BUNDLE_DIR=str(root), DEVPORTAL_VITE_DEV_SERVER=""):
        yield root
    devportal_assets.clear_caches()


@pytest.fixture
def empty_bundle(tmp_path):
    devportal_assets.clear_caches()
    with override_settings(DEVPORTAL_BUNDLE_DIR=str(tmp_path / "none"), DEVPORTAL_VITE_DEV_SERVER=""):
        yield
    devportal_assets.clear_caches()


def test_endpoint_page_includes_the_prerendered_article(imported, prerender_bundle):  # noqa: ARG001
    from devportal.models import Page

    page = Page.objects.get(section="reference", slug="get-v3-texts")
    revision = page.published_revision
    revision.title_override = "Texts <v3>"
    revision.description_override_md = "Overlay **description**."
    revision.body_md = "Extra notes."
    revision.save()
    text = portal_client().get("/reference/get-v3-texts").content.decode()
    assert "PARAMS" in text and "PLAYGROUND" in text
    assert 'data-dp-prerender="missing"' not in text
    assert '<span data-dp-slot="title">Texts &lt;v3&gt;</span>' in text
    assert "Spec description" not in text and "<strong>description</strong>" in text
    article = text[text.index('<article id="content"') : text.index("</article>")]
    assert article.index("</header>") < article.index("Extra notes.") < article.index("PARAMS")
    assert article.index("PARAMS") < article.index('<footer class="dp-docs-footer"')
    assert 'aria-label="Next Page: Texts (v1)"' in article
    assert '<div class="dp-endpoint-footer dp-endpoint-footer--article">' in article
    # Live's second copy of the footer, shown once the columns stack: the columns' last child, after the playground.
    columns_end = text[text.index("PLAYGROUND") : text.index("</main>")]
    stacked = '<div class="dp-endpoint-footer dp-endpoint-footer--stacked"><footer class="dp-docs-footer">'
    assert stacked in columns_end
    assert columns_end.index(stacked) < columns_end.index("</div></div>", columns_end.index("Next Page: Texts (v1)"))
    assert text.count('aria-label="Pagination Controls"') == 2
    # The sidebar comes before the prerendered columns, inside the page's <main>.
    assert text.index('id="dp-sidebar"') < text.index("dp-Endpoint-module__wrapper") < text.index("</main>")
    island = _island(text)
    assert island["page"]["title"] == "Texts <v3>" and "Extra notes." in island["page"]["bodyHtml"]


def test_endpoint_page_without_the_prerendered_file_falls_back(imported, empty_bundle):  # noqa: ARG001
    text = portal_client().get("/reference/get-v3-texts").content.decode()
    article = text[text.index('<article id="content"') : text.index("</article>")]
    assert 'data-dp-prerender="missing"' in article
    assert '<h1 class="dp-endpoint-title">Texts (v3)</h1>' in article
    assert html_lib.escape("https://www.sefaria.org/api/v3/texts/{tref}") in article or (
        "/api/v3/texts/{tref}" in article
    )
    assert 'aria-label="Next Page: Texts (v1)"' in article
    # One footer, always shown (no playground to stack under).
    assert '<div class="dp-endpoint-footer">' in article and "dp-endpoint-footer--" not in text
    assert 'id="dp-sidebar"' in text
