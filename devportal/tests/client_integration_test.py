"""The server half of the client integration (PLAN.md §2.5): without JavaScript, a docs page already shows
its sidebar and table of contents, the sidebar tree is the C3 shape the client renders, and the HTML-block
frames the article points at exist.
"""

import json
import re

import jsonschema
from referencing import Registry, Resource

from devportal.models import PortalState

from . import content_helpers
from .portal_helpers import CONTRACTS, portal_client

imported = content_helpers.imported  # a fixture
source = content_helpers.source  # a fixture

HEBREW_CITATIONS = "/docs/%D7%90%D7%99%D7%9A-%D7%9C%D7%99%D7%A6%D7%95%D7%A8-%D7%9E%D7%A8%D7%90%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9C%D7%94%D7%A4%D7%A0%D7%99%D7%94"


def _tree_validator():
    schemas = CONTRACTS / "schemas"
    common = json.loads((schemas / "common.schema.json").read_text(encoding="utf-8"))
    tree = json.loads((schemas / "sidebar-tree.schema.json").read_text(encoding="utf-8"))
    registry = Registry().with_resource(common["$id"], Resource.from_contents(common))
    return jsonschema.Draft202012Validator(tree, registry=registry)


def _island(html):
    match = re.search(r'<script type="application/json" id="dp-data"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(match.group(1))


def test_docs_page_shows_sidebar_and_toc_without_javascript(imported):  # noqa: ARG001
    html = portal_client().get("/docs/welcome").content.decode()
    sidebar = html[html.index('class="dp-docs__sidebar"') : html.index('<article id="content"')]
    assert 'id="dp-sidebar"' in html  # the mobile sub-nav button's aria-controls
    assert sidebar.count('class="dp-sidebar-link') > 10
    assert 'href="/docs/welcome" aria-current="page"' in sidebar
    assert ">TECHNICAL DOCS<" in sidebar
    toc = html[html.index('<nav class="dp-toc"') :]
    assert toc.count('class="dp-toc-link"') >= 3


def test_island_and_nav_endpoint_carry_the_c3_sidebar_tree(imported):  # noqa: ARG001
    validator = _tree_validator()
    client = portal_client()
    generation = PortalState.load().generation
    for path in ("/docs/welcome", "/reference/getting-started"):
        tree = _island(client.get(path).content.decode())["nav"]["tree"]
        assert list(validator.iter_errors(tree)) == []
        assert tree["generation"] == generation and tree["categories"]
    for section in ("docs", "reference"):
        response = client.get(f"/_portal/nav/{section}.json")
        assert response.status_code == 200
        assert list(validator.iter_errors(response.json())) == []
    assert client.get("/_portal/nav/page.json").status_code == 404


def test_htmlblock_frames_point_at_their_revision(imported):  # noqa: ARG001
    client = portal_client()
    html = client.get(HEBREW_CITATIONS).content.decode()
    frames = re.findall(r'class="dp-htmlblock-frame" src="(/_portal/htmlblock/[0-9]+/[0-9]+)"', html)
    assert frames
    for src in frames:
        assert client.get(src).status_code == 200


def test_page_json_answers_endpoint_pages_for_client_navigation(imported):  # noqa: ARG001
    client = portal_client()
    payload = client.get("/_portal/page.json", {"path": "/reference/get-v3-texts"}).json()
    assert payload["kind"] == "endpoint"
    assert payload["nav"]["url"] == "/_portal/nav/reference.json"
    tag_group = client.get("/_portal/page.json", {"path": "/reference/text"}).json()
    assert tag_group["kind"] == "redirect" and tag_group["location"].startswith("/reference/")
    assert client.get("/_portal/page.json", {"path": "/reference/getting-started"}).json()["kind"] == "doc"
