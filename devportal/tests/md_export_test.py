"""`<page path>.md` against live (PLAN.md §2.10, F-17; Phase 4 must-pass `md_export_test`).

Each of the 60 files in `research/site/live-markdown/` and the endpoint sample is compared with what we
serve, after normalizing only `updatedAt`, the host and mirrored image URLs.

Two things keep some pages from being byte-equal, and both are registered below, page by page:

1. `DEVIATIONS`: our content differs from live's on purpose: the link fixes of PLAN.md §7.4 (I-7), and
   two spots where the source repository writes a construct differently from what ReadMe serves. They are
   applied to live's text before comparing, so any other difference still fails.
2. `FORMAT_ONLY`: live's `.md` is ReadMe's re-serialization of its stored document, while our body is
   the `Sefaria/developer-docs` source, which uses another Markdown style (`_em_` for `*em*`, `-` bullets
   for `*`, `\\_` escapes dropped, `<email>` autolinks written as links, table padding, trailing spaces,
   blank lines between list items). For these pages the front matter, the title and the excerpt must
   still be byte-equal, and the body must render to the same HTML through our renderer.

Every other page must be byte-equal. The test also fails when a page moves to a stricter tier, so the
lists stay exact.
"""

import pytest

from devportal.adapters.markdown import render

from .machine_helpers import (
    LIVE_ENDPOINT_SAMPLE,
    LIVE_MARKDOWN,
    LIVE_ORIGIN,
    URLCONF,
    client,
    content,  # noqa: F401 - fixture
    to_live_host,
    unmirror_images,
    without_updated_at,
)

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]

D = f"{LIVE_ORIGIN}/docs/"
I7 = "I-7 link fix (PLAN.md §7.4)"
SOURCE_FORM = "the source repository writes this differently from ReadMe's stored document"

# slug -> [(live's text, ours, reason)]
DEVIATIONS = {
    "welcome": [(f"({D}each-book-is-an-index)", f"({D}index-and-versions)", I7)],
    "the-structure-of-a-text-on-sefaria": [(f"({D}each-book-is-an-index)", f"({D}index-and-versions)", I7)],
    "the-structure-of-a-complex-text": [(f"({D}default-nodes)", f"({D}node-titles#3-default-nodes)", I7)],
    "september-2024": [(f"({D}the-schema-of-a-complex-text)", f"({D}the-structure-of-a-complex-text)", I7)],
    "node-titles": [(f"({D}the-schema-of-a-complex-text)", f"({D}the-structure-of-a-complex-text)", I7)],
    "technical-notes": [(f"({D}terms-for-internal-use)", f"({D}term-creation)", I7)],
    "api-wiki": [("(<doc: shape-api>)", f"({D}shape-api)", I7)],
    "june-2024": [
        (f"({D}the-schema-of-a-complex-text)", f"({D}the-structure-of-a-complex-text)", I7),
        (f"({D}the-schema-of-a-simple-text)", f"({D}the-structure-of-a-simple-text)", I7),
    ],
    "linker-v2": [(f"({LIVE_ORIGIN}/update/docs/linker-v3)", f"({D}linker-v3)", I7)],
    "linker-api": [("](sefaria.org/texts)", "](https://www.sefaria.org/texts)", I7)],
    "general-faq": [
        ("<corrections@sefaria.org.>", "[corrections@sefaria.org.](mailto:corrections@sefaria.org.)", SOURCE_FORM),
    ],
    "patot": [
        (
            "***Patot never splits a segment to complete a chunk***",
            "**_Patot never splits a segment to complete a chunk_**",
            SOURCE_FORM,
        ),
    ],
}

# Pages whose body differs from live's only in Markdown style (see the module docstring).
FORMAT_ONLY = {
    "accessibility-interns-and-the-passages-api-september-2025",
    "api-wiki",
    "async-task-api",
    "calendar-api-a-user-requested-feature-and-more",
    "categories",
    "category-creation",
    "cli",
    "commentaries",
    "contact-us",
    "django-middleware-innovation-mcps-january-2026-issue-7",
    "docker-compose-sefaria",
    "general-faq",
    "getting-evals-right-for-a-jewish-ai-chatbot",
    "guide-to-contributing",
    "how-to-format-citations-for-the-linker",
    "how-to-report-a-mistake",
    "index-and-versions",
    "june-2024",
    "lexicon-docs",
    "linear-programming-topic-curation-and-api-tips",
    "linker",
    "linker-api",
    "linker-v2",
    "linker-v3",
    "local-installation-instructions",
    "node-titles",
    "patot",
    "powered-by-sefaria-acceptance-criteria",
    "schemanode",
    "search-api",
    "sefaria-export-a-data-puzzle-and-deep-wiki",
    "september-2024",
    "sites-using-the-linker",
    "term-creation",
    "technical-notes",
    "text-formatting-beyond-the-segment-level",
    "text-references",
    "the-disambiguator",
    "the-index-schema",
    "the-sefaria-developer-community-archive",
    "the-sefaria-mcp",
    "the-structure-of-a-complex-text",
    "top-tech-tips-new-projects-and-more-march-2025-issue-4",
    "topic-ontology",
    "usage-of-our-name-and-logo",
    "workflowy",
}

CASES = [(f.stem, ("/page/" if f.stem == "contact-us" else "/docs/") + f.stem, f) for f in LIVE_MARKDOWN.glob("*.md")]
CASES.append(("get-v3-texts", "/reference/get-v3-texts", LIVE_ENDPOINT_SAMPLE))
CASES.sort()


def test_the_research_has_sixty_pages():
    assert len(list(LIVE_MARKDOWN.glob("*.md"))) == 60
    assert set(DEVIATIONS) | FORMAT_ONLY <= {slug for slug, _, _ in CASES}


def expected_text(slug, path):
    text = path.read_text(encoding="utf-8")
    for live, ours, _reason in DEVIATIONS.get(slug, []):
        assert live in text, f"{slug}: registered deviation {live!r} is no longer in live's text"
        text = text.replace(live, ours)
    return without_updated_at(text)


def served(path):
    response = client().get(f"{path}.md")
    assert response.status_code == 200, path
    assert response["Content-Type"] == "text/markdown; charset=utf-8"
    return without_updated_at(unmirror_images(to_live_host(response.content.decode("utf-8"))))


def split(document):
    """`(head, body)`: the front matter, title and excerpt; then the body."""
    _, front, rest = document.split("---\n", 2)
    head = "---\n" + front + "---\n"
    title, _, rest = rest.lstrip("\n").partition("\n\n")
    return head + "\n" + title, rest


@pytest.mark.parametrize(("slug", "path", "live_file"), CASES, ids=[c[0] for c in CASES])
def test_markdown_equals_live(slug, path, live_file):
    ours = served(path)
    expected = expected_text(slug, live_file)
    if slug not in FORMAT_ONLY:
        assert ours == expected
        return
    assert ours != expected, f"{slug} is now byte-equal to live: remove it from FORMAT_ONLY"
    our_head, our_body = split(ours)
    live_head, live_body = split(expected)
    assert our_head == live_head
    assert render(our_body).html == render(live_body).html


def test_front_matter_shape():
    text = client().get("/docs/welcome.md").content.decode("utf-8")
    lines = text.split("\n")
    assert lines[0] == "---"
    assert lines[1].startswith("updatedAt: ") and lines[1].endswith(".000Z")
    assert lines[2:7] == [
        "agentTools:",
        f"  projectIndex: {client_origin()}/llms.txt",
        "---",
        "",
        "# Welcome to Sefaria's Technical Documentation",
    ]


def client_origin():
    from .machine_helpers import origin  # noqa: PLC0415

    return origin()


def test_links_are_absolute_on_the_request_host():
    text = client().get("/docs/welcome.md").content.decode("utf-8")
    assert f"[Contact us]({client_origin()}/page/contact-us)" in text
    assert "](/" not in text


def test_code_is_left_alone():
    from devportal.services.md_export import absolutize_links  # noqa: PLC0415

    source = "[a](/docs/x)\n\n```md\n[b](/docs/y)\n```\n\n`[c](/docs/z)` and <a href='/page/p'>p</a>\n"
    out = absolutize_links(source, "https://h")
    assert "[a](https://h/docs/x)" in out
    assert "[b](/docs/y)" in out
    assert "`[c](/docs/z)`" in out
    assert "href='https://h/page/p'" in out


def test_endpoint_ends_with_the_spec_slice():
    from devportal.spec import load_spec  # noqa: PLC0415

    text = client().get("/reference/get-shape.md").content.decode("utf-8")
    assert text.endswith("```json\n" + load_spec().slice_json("get-shape") + "\n```")
    assert "\n# OpenAPI definition\n\n```json\n" in text


def test_endpoint_overlay_markdown():
    from devportal.models import Page  # noqa: PLC0415
    from devportal.services import publish  # noqa: PLC0415

    page = Page.objects.get(section="reference", slug="get-shape")
    publish.create_revision(
        page,
        source="editor",
        base=page.published_revision,
        title_override="Shape!",
        description_override_md="Overridden [see](/docs/welcome).",
        body_md="Extra notes.\n",
    )
    publish.publish(Page.objects.get(pk=page.pk), rebuild=False)
    text = client().get("/reference/get-shape.md").content.decode("utf-8")
    body = text.split("---\n", 2)[2]
    expected_start = (
        f"\n# Shape!\n\nOverridden [see]({client_origin()}/docs/welcome).\n\nExtra notes.\n\n# OpenAPI definition"
    )
    assert body.startswith(expected_start)


def test_tag_group_and_api_config_and_link_pages():
    body = lambda p: client().get(p).content.decode("utf-8").split("---\n", 2)[2]  # noqa: E731
    assert body("/reference/text.md") == "\n# Text\n\nOperations related to retrieving texts\n\n"
    auth = body("/reference/authentication.md")
    assert auth.startswith(
        "\n# Authentication\n\nSet up the welcome page for your API to help users make their first call.\n\n"
        "# OpenAPI definition\n\nThis is the part of the API’s OpenAPI definition that covers servers and "
        "authentication. Each endpoint page has its own operation.\n\n```json\n{\n"
    )
    assert auth.endswith("  ]\n}\n```")
    assert body("/reference/my-requests.md") == (
        "\n# My Requests\n\nSet up the welcome page for your API to help users make their first call.\n\n"
    )
    assert body("/docs/helpful-link-somewhere-else.md") == "\n# Sefaria GitHub\n\n"


def test_hidden_pages_answer():
    response = client().get("/docs/shape-api.md")
    assert response.status_code == 200
    assert "\n# " in response.content.decode("utf-8")


def test_unknown_page_is_lives_404_document():
    response = client().get("/docs/nonexistent.md")
    assert response.status_code == 404
    assert response["Content-Type"] == "text/markdown; charset=utf-8"
    o = client_origin()
    assert response.content.decode("utf-8") == (
        f"---\nagentTools:\n  projectIndex: {o}/llms.txt\n---\n\n"
        f"Page not found. The full index is at {o}/llms.txt. Use the agentTools in the front matter above to "
        "search the docs or browse the index.\n"
    )


def test_hebrew_slug():
    response = client().get(
        "/docs/%D7%90%D7%99%D7%9A-%D7%9C%D7%99%D7%A6%D7%95%D7%A8-%D7%9E%D7%A8%D7%90%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%9C%D7%94%D7%A4%D7%A0%D7%99%D7%94.md"
    )
    assert response.status_code == 200
