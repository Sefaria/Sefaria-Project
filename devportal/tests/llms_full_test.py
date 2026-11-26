"""`/llms-full.txt` (new; PLAN.md §2.10): the pages of `/llms.txt`, in its order, with their Markdown."""

import re

import pytest

from devportal.spec import load_spec

from .machine_helpers import URLCONF, client, content, origin  # noqa: F401 - fixture

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]


@pytest.fixture
def full():
    response = client().get("/llms-full.txt")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/plain; charset=utf-8"
    return response.content.decode("utf-8")


def test_same_order_as_llms_txt(full):
    index = client().get("/llms.txt").content.decode("utf-8")
    listed = re.findall(r"\]\((\S+\.md)\)", index)
    sources = re.findall(r"^Source: (\S+)$", full, flags=re.MULTILINE)
    assert sources == listed
    headings = re.findall(r"^## .*$", index, flags=re.MULTILINE)
    assert re.findall(r"^## (?:Docs|API Reference|Pages)\b.*$", full, flags=re.MULTILINE) == headings


def test_header(full):
    assert full.startswith("# Sefaria Documentation\n\n> Expand Digital Torah!")
    assert f"listed in {origin()}/llms.txt" in full


def test_each_page_is_inlined(full):
    for path in ("/docs/welcome", "/docs/topic-ontology", "/page/contact-us", "/reference/getting-started"):
        document = client().get(f"{path}.md").content.decode("utf-8")
        body = document.split("---\n", 2)[2].strip("\n")
        title, _, rest = body.partition("\n")
        assert f"{title}\nSource: {origin()}{path}.md\n{rest}" in full


def test_endpoints_carry_their_slice(full):
    assert load_spec().slice_json("get-v3-texts") in full
    assert full.count("\n# OpenAPI definition\n") == 61


def test_hidden_pages_are_left_out(full):
    assert "/docs/shape-api.md" not in full
    assert "/reference/authentication.md" not in full
    assert "\nSource: " + origin() + "/page/test-homepage.md" not in full
