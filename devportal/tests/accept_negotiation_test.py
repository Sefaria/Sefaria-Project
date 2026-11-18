"""`Accept: text/markdown` on page paths (PLAN.md §2.4, contract C9 rule `markdown_negotiation`)."""

import pytest

from devportal.views.machine import prefers_markdown

from .machine_helpers import URLCONF, client, content, origin  # noqa: F401 - fixture

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]


@pytest.mark.parametrize(
    ("accept", "expected"),
    [
        ("text/markdown", True),
        ("text/markdown, text/html;q=0.9", True),
        ("text/html;q=0.5, text/markdown;q=0.9", True),
        ("text/markdown, */*;q=0.1", True),
        ("text/html, text/markdown", False),  # a tie is HTML
        ("text/markdown;q=0.5, text/*", False),
        ("*/*", False),
        ("text/*", False),
        ("", False),
        (None, False),
        ("text/markdown;q=0", False),
        ("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", False),
        ("TEXT/MARKDOWN", True),
        ("text/markdown;q=abc, text/html;q=0.1", False),
    ],
)
def test_prefers_markdown(accept, expected):
    assert prefers_markdown(accept) is expected


def _md(path, accept="text/markdown"):
    return client().get(path, HTTP_ACCEPT=accept)


@pytest.mark.parametrize(
    "path", ["/docs/welcome", "/reference/getting-started", "/reference/get-v3-texts", "/page/contact-us"]
)
def test_page_answers_markdown(path):
    response = _md(path)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/markdown; charset=utf-8"
    assert "Accept" in response["Vary"]
    assert response.content == client().get(f"{path}.md").content
    assert f'<{origin()}{path}>; rel="canonical"' in response["Link"]


@pytest.mark.parametrize(
    "path", ["/docs/welcome", "/reference/getting-started", "/reference/get-v3-texts", "/page/contact-us"]
)
def test_page_answers_html_otherwise(path):
    for accept in ("text/html", "*/*", "text/html, text/markdown"):
        response = _md(path, accept)
        assert response.status_code == 200
        assert response["Content-Type"].startswith("text/html")
        assert "Accept" in response["Vary"]


def test_unknown_page_answers_markdown_404():
    response = _md("/docs/nonexistent")
    assert response.status_code == 404
    assert response["Content-Type"] == "text/markdown; charset=utf-8"
    assert "Page not found." in response.content.decode()
    assert "Accept" in response["Vary"]


def test_tag_group_answers_markdown():
    response = _md("/reference/text")
    assert response.status_code == 200
    assert response.content.decode().endswith("\n# Text\n\nOperations related to retrieving texts\n\n")


def test_home_redirects_to_llms_txt():
    response = _md("/")
    assert response.status_code == 302
    assert response["Location"] == f"{origin()}/llms.txt"
    assert "Accept" in response["Vary"]


def test_hidden_page_answers_markdown():
    response = _md("/docs/shape-api")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/markdown; charset=utf-8"


def test_md_url_does_not_vary():
    response = client().get("/docs/welcome.md", HTTP_ACCEPT="text/html")
    assert response["Content-Type"] == "text/markdown; charset=utf-8"
