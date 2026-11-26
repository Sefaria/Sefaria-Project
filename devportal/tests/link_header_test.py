"""The `Link` header set live sends (PLAN.md §2.10, contract C9 rule `headers`, C10)."""

import pytest

from .machine_helpers import URLCONF, client, content, origin  # noqa: F401 - fixture

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]


def discovery(o):
    return [
        f'<{o}/.well-known/api-catalog>; rel="api-catalog"',
        f'<{o}>; rel="service-doc"',
        f'<{o}/.well-known/agent-skills/index.json>; rel="agent-skills"',
        f'<{o}/.well-known/mcp/server-card.json>; rel="mcp-server"',
    ]


def links(response):
    parts = response["Link"].split(", <")
    return [parts[0], *("<" + p for p in parts[1:])]


@pytest.mark.parametrize(
    "path",
    ["/docs/welcome", "/docs/shape-api", "/reference/getting-started", "/reference/get-v3-texts", "/page/contact-us"],
)
def test_html_pages_carry_five_relations(path):
    response = client().get(path)
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/html")
    assert links(response) == [*discovery(origin()), f'<{path}.md>; rel="alternate"; type="text/markdown"']


@pytest.mark.parametrize("path", ["/docs/welcome", "/reference/get-v3-texts", "/page/contact-us", "/reference/text"])
def test_markdown_pages_carry_canonical(path):
    response = client().get(f"{path}.md")
    assert links(response) == [*discovery(origin()), f'<{origin()}{path}>; rel="canonical"']


def test_markdown_404_carries_discovery_only():
    response = client().get("/docs/nonexistent.md")
    assert links(response) == discovery(origin())


@pytest.mark.parametrize(
    "path",
    [
        "/llms.txt",
        "/docs/llms.txt",
        "/reference/llms.txt",
        "/llms-full.txt",
        "/sitemap.xml",
        "/openapi/sefaria-api.json",
        "/.well-known/api-catalog",
        "/.well-known/agent-skills/index.json",
        "/.well-known/agent-skills/read-the-docs/SKILL.md",
        "/.well-known/mcp/server-card.json",
    ],
)
def test_machine_files_carry_discovery(path):
    response = client().get(path)
    assert response.status_code == 200
    assert links(response) == discovery(origin())


def test_ai_banner_is_lives_and_comes_first():
    """The visually hidden "For AI agents" banner, copied from live (checked 2026-11-18)."""
    html = client().get("/docs/welcome").content.decode("utf-8")
    banner = (
        f"For AI agents: the docs index is at {origin()}/llms.txt. "
        "Append .md to any documentation page URL to get its markdown version."
    )
    body = html.split("<body", 1)[1].split(">", 1)[1].lstrip()
    assert body.startswith(f'<div hidden aria-hidden="true">{banner}</div>')
