"""The page resolver, /_portal/page.json, the HTML shell, Link headers, the 404 page and its log,
and the site files (contract C9, C3 page payload, PLAN.md §2.4, §2.5, §2.10, I-14)."""

from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from devportal.models import NotFoundLog, PortalState, Redirect

from .portal_helpers import (
    REPO_ROOT,
    load_contract,
    make_page,
    page_payload_validator,
    portal_client,
    portal_origin,
    skip_unless_full_stack_runs,
)

C9 = load_contract("C9_urls.json")
VALIDATOR = page_payload_validator()


@pytest.fixture
def pages(db):
    make_page("docs", "welcome", title="Welcome to Sefaria's Technical Documentation", excerpt="Intro.")
    make_page("docs", "text-references", title="Text References")
    make_page("docs", "secret", title="Hidden", hidden=True)
    make_page("reference", "getting-started", title="Getting Started")
    make_page("page", "contact-us", title="Get in Touch")
    group = make_page("reference", "text", kind="tag_group", title="Text")
    make_page("reference", "get-v3-texts", kind="page", title="Texts (v3)", parent=group, position=2)
    make_page("reference", "get-text-early", kind="page", title="Early", parent=group, position=1, hidden=True)


def page_json(path, **params):
    response = portal_client().get("/_portal/page.json", {"path": path, **params})
    assert response.status_code == 200
    assert response["Content-Type"] == "application/json"
    payload = response.json()
    VALIDATOR.validate(payload)
    return payload


# Payloads ------------------------------------------------------------------------------------------


def test_home_payload(pages):
    payload = page_json("/")
    assert payload["kind"] == "home"
    assert payload["title"] == "Sefaria"
    assert payload["header"] == {"activeTab": "home"}
    assert payload["meta"]["canonicalUrl"] == f"{portal_origin()}/"
    assert payload["site"]["mcpUrl"] == f"{portal_origin()}/mcp"
    assert payload["site"]["demoApiKey"] is None


def test_doc_payload(pages):
    payload = page_json("/docs/welcome")
    assert payload["kind"] == "doc"
    assert payload["title"] == "Welcome to Sefaria's Technical Documentation"
    assert payload["section"] == "docs" and payload["slug"] == "welcome"
    assert payload["header"]["activeTab"] == "docs"
    assert payload["page"]["bodyHtml"] == "<p>Body</p>"
    assert payload["meta"]["description"] == "Intro."
    assert payload["meta"]["markdownUrl"] == f"{portal_origin()}/docs/welcome.md"
    assert payload["nav"]["url"] == "/_portal/nav/docs.json"
    assert payload["nav"]["tree"]["section"] == "docs"


def test_nav_tree_is_left_out_when_the_client_has_the_generation(pages):
    generation = PortalState.load().generation
    assert page_json("/docs/welcome", nav=str(generation))["nav"]["tree"] is None
    assert page_json("/docs/welcome", nav=str(generation + 1))["nav"]["tree"] is not None


def test_custom_page_payload(pages):
    payload = page_json("/page/contact-us")
    assert payload["nav"] is None
    assert payload["header"]["activeTab"] == "contact"


def test_hidden_pages_answer_at_their_url(pages):
    assert page_json("/docs/secret")["kind"] == "doc"


def test_tag_group_redirects_to_its_first_visible_child(pages):
    payload = page_json("/reference/text")
    assert payload == {
        "contractVersion": 1,
        "kind": "redirect",
        "path": "/reference/text",
        "status": 302,
        "location": "/reference/get-v3-texts",
    }


def test_notfound_payload_has_slug_suggestions(pages):
    payload = page_json("/docs/text-reference")
    assert payload["kind"] == "notfound"
    assert payload["title"] == "404 Not Found"
    assert payload["meta"]["robots"] == "noindex"
    assert payload["suggestions"][0] == {"title": "Text References", "path": "/docs/text-references"}
    assert len(payload["suggestions"]) == 3
    assert all(s["path"] != "/docs/secret" for s in payload["suggestions"])


@pytest.mark.parametrize("bad", ["", "docs", "//evil.example", "/" + "a" * 2048])
def test_page_json_rejects_paths_that_are_not_on_this_host(db, bad):
    response = portal_client().get("/_portal/page.json", {"path": bad})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_unknown_portal_endpoint_is_a_json_404(db):
    response = portal_client().get("/_portal/search-docs.0000000.json")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# Routes of C9 ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("case", C9["parity_examples"]["cases"], ids=lambda c: c["request"])
def test_parity_examples(pages, case):
    if case["request"] in ("/docs.md",):
        pytest.skip("owned by the agent-surface workstream")
    response = portal_client().get(case["request"])
    assert response.status_code == case["status"], case
    if "location" in case:
        assert response["Location"] == case["location"]


def test_portal_redirects_escape_the_main_sites_no_applink_tagging(pages):
    # WebSessionRedirectMiddleware tags HttpResponseRedirect/HttpResponsePermanentRedirect only.
    from django.http import HttpResponsePermanentRedirect, HttpResponseRedirect  # noqa: PLC0415

    response = portal_client().get("/docs", HTTP_REFERER="https://www.sefaria.org/texts")
    assert (response.status_code, response["Location"]) == (301, "/docs/welcome")
    assert not isinstance(response, HttpResponseRedirect | HttpResponsePermanentRedirect)


def test_versioned_fallback_keeps_the_query(pages):
    response = portal_client().get("/v1.0/docs/welcome?ref=x&b=2")
    assert response.status_code == 302
    assert response["Location"] == "/docs/welcome?ref=x&b=2"


def test_reference_trailing_slash_redirects(pages):
    response = portal_client().get("/reference/getting-started/")
    assert (response.status_code, response["Location"]) == (301, "/reference/getting-started")


def test_unicode_slug_redirect_is_percent_encoded(db):
    response = portal_client().get("/docs/%D7%A9%D7%9C%D7%95%D7%9D/")
    assert (response.status_code, response["Location"]) == (301, "/docs/%D7%A9%D7%9C%D7%95%D7%9D")


def test_redirect_table_is_consulted_before_the_404(pages):
    Redirect.objects.create(from_path="/docs/old-name", to_path="/docs/welcome", status=301)
    response = portal_client().get("/docs/old-name")
    assert (response.status_code, response["Location"]) == (301, "/docs/welcome")
    assert page_json("/docs/old-name")["location"] == "/docs/welcome"


def test_post_to_a_page_is_not_allowed(pages):
    assert portal_client().post("/docs/welcome").status_code == 405


# The HTML shell ------------------------------------------------------------------------------------


def test_html_page_embeds_the_payload_island_and_the_root(pages):
    response = portal_client().get("/docs/welcome")
    html = response.content.decode()
    assert response.status_code == 200
    assert html.startswith("<!doctype html>")
    assert '<html lang="en" dir="ltr" data-visual="html" data-dp-library-url=' in html
    assert "<title>Welcome to Sefaria&#x27;s Technical Documentation</title>" in html
    assert html.count('id="dp-root"') == 1 and html.count('id="dp-data"') == 1
    assert html.index('id="dp-root"') < html.index('id="dp-data"')
    body_start = html[html.index("<body") :]
    first = body_start[body_start.index(">") + 1 :].lstrip()
    assert first.startswith('<div hidden aria-hidden="true">For AI agents: the docs index is at ')
    assert "<p>Body</p>" in html
    assert response["Vary"] == "Accept"


def test_page_templates_render_without_request_context_processors(pages):
    # Rule Q4: nothing from the Sefaria context processors (e.g. base_props' propsJSON) reaches the page.
    html = portal_client().get("/docs/welcome").content.decode()
    assert "propsJSON" not in html and "DJANGO_DATA_VARS" not in html and "csrfmiddlewaretoken" not in html


def test_404_page_copies_live(pages):
    response = portal_client().get("/docs/text-reference")
    html = response.content.decode()
    assert response.status_code == 404
    assert "<title>404 Not Found</title>" in html
    assert '<h1 class="dp-notfound-title" data-visual-region="notFound">Page Not Found</h1>' in html
    assert "Maybe you were looking for one of these:" in html
    assert '<ul class="dp-notfound-list" data-visual-mask="notFoundSuggestions">' in html
    assert '<a class="dp-notfound-link" href="/docs/text-references">Text References</a>' in html


# Link headers (copied from live) -------------------------------------------------------------------


def _discovery(origin):
    return (
        f'<{origin}/.well-known/api-catalog>; rel="api-catalog", <{origin}>; rel="service-doc", '
        f'<{origin}/.well-known/agent-skills/index.json>; rel="agent-skills", '
        f'<{origin}/.well-known/mcp/server-card.json>; rel="mcp-server"'
    )


def test_link_header_on_a_doc_page(pages):
    response = portal_client().get("/docs/welcome")
    assert (
        response["Link"] == _discovery(portal_origin()) + ', </docs/welcome.md>; rel="alternate"; type="text/markdown"'
    )


def test_link_header_on_home_and_text_files_has_no_alternate(pages):
    for path in ("/", "/robots.txt"):
        assert portal_client().get(path)["Link"] == _discovery(portal_origin()), path


def test_link_header_on_a_404_under_a_section_points_at_its_md(pages):
    response = portal_client().get("/docs/api")
    assert response["Link"].endswith(', </docs/api.md>; rel="alternate"; type="text/markdown"')


def test_json_and_images_carry_no_link_header(pages):
    assert "Link" not in portal_client().get("/_portal/page.json", {"path": "/"})
    assert "Link" not in portal_client().get("/favicon.ico")


# 404 log ---------------------------------------------------------------------------------------------


def test_404s_are_counted_with_the_referrer(pages):
    client = portal_client()
    client.get("/docs/nope")
    client.get("/docs/nope", HTTP_REFERER="https://example.org/x")
    entry = NotFoundLog.objects.get(path="/docs/nope")
    assert entry.count == 2
    assert entry.last_referrer == "https://example.org/x"


def test_client_side_notfound_is_logged_too(pages):
    page_json("/docs/also-missing")
    assert NotFoundLog.objects.get(path="/docs/also-missing").count == 1


def test_pages_and_redirects_are_not_logged(pages):
    client = portal_client()
    client.get("/docs/welcome")
    client.get("/docs")
    client.get("/_portal/nothing")
    assert not NotFoundLog.objects.exists()


def test_404_log_is_rate_limited_per_client(pages):
    from django.core.cache import cache  # noqa: PLC0415

    from devportal import middleware  # noqa: PLC0415

    cache.clear()
    client = portal_client(REMOTE_ADDR="198.51.100.7")
    for i in range(middleware.NOT_FOUND_LOG_PER_IP_PER_MINUTE + 5):
        assert client.get(f"/docs/flood-{i}").status_code == 404
    assert NotFoundLog.objects.count() <= middleware.NOT_FOUND_LOG_PER_IP_PER_MINUTE
    cache.clear()


# Site files ------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "content_type"),
    [
        ("/favicon.ico", "image/x-icon"),
        ("/apple-touch-icon.png", "image/png"),
        ("/icon-192.png", "image/png"),
        ("/icon-512.png", "image/png"),
    ],
)
def test_icons_are_live_copies(db, path, content_type):
    response = portal_client().get(path)
    assert response.status_code == 200
    assert response["Content-Type"] == content_type
    expected = (REPO_ROOT / "devportal" / "static" / "devportal" / path.lstrip("/")).read_bytes()
    assert response.content == expected
    assert len(expected) > 1000


def test_web_manifest_uses_the_request_host(db):
    response = portal_client().get("/site.webmanifest")
    assert response["Content-Type"].startswith("application/manifest+json")
    data = response.json()
    assert data["name"] == "Sefaria"
    assert [i["src"] for i in data["icons"]] == [
        f"{portal_origin()}/icon-192.png?v=e9b1b3beada0",
        f"{portal_origin()}/icon-512.png?v=e9b1b3beada0",
    ]


def test_login_redirects_to_the_library_host(db):
    with override_settings(
        DOMAIN_MODULES={"en": {"library": "https://www.example.org", "developers": portal_origin()}}
    ):
        _check_login(portal_client())


def _check_login(client):
    assert client.get("/login")["Location"] == "https://www.example.org/login"
    location = client.get("/login", {"next": "/docs/welcome"})["Location"]
    assert location == "https://www.example.org/login?next=" + f"{portal_origin()}/docs/welcome".replace(
        ":", "%3A"
    ).replace("/", "%2F")
    for hostile in ("https://evil.example/", "//evil.example", "/\\evil.example"):
        assert client.get("/login", {"next": hostile})["Location"] == "https://www.example.org/login"


def test_server_error_page_needs_no_database():
    from django.test import RequestFactory  # noqa: PLC0415

    from devportal.views.errors import server_error  # noqa: PLC0415

    skip_unless_full_stack_runs()  # the template engine loads reader's tag libraries under sefaria.settings
    response = server_error(RequestFactory().get("/"))
    assert response.status_code == 500
    assert b"Something went wrong" in response.content


def test_updated_at_is_rfc3339(pages):
    from devportal.models import Page  # noqa: PLC0415

    Page.objects.filter(slug="welcome").update(content_updated_at=timezone.now() - timedelta(days=2))
    assert page_json("/docs/welcome")["page"]["updatedAt"].endswith("Z")
