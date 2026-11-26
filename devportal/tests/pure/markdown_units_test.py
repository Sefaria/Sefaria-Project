"""Front matter, link rewriting, plain text and render options."""

import pytest

from devportal.markdown import extract_text, parse_front_matter, render, rewrite_link, rewrite_markdown_links
from devportal.markdown.frontmatter import split_front_matter

# --- front matter -------------------------------------------------------------------------------------------------


def test_front_matter_without_trailing_newline():
    assert split_front_matter("---\ntitle: A\n---") == ("title: A\n", "")
    assert parse_front_matter("---\ntitle: A\nhidden: true\n---") == ({"title": "A", "hidden": True}, "")


def test_front_matter_with_body():
    assert split_front_matter("---\ntitle: A\n---\n# B\n") == ("title: A\n", "# B\n")


def test_no_front_matter():
    assert split_front_matter("# B\n---\n") == (None, "# B\n---\n")
    assert split_front_matter("---\nnot closed") == (None, "---\nnot closed")
    assert parse_front_matter("x") == ({}, "x")


def test_thematic_break_after_front_matter_is_kept():
    _, body = split_front_matter("---\na: 1\n---\ntext\n\n---\n\nmore")
    assert body == "text\n\n---\n\nmore"


def test_render_ignores_front_matter():
    assert "title" not in render("---\ntitle: Secret\n---\nBody").html


def test_non_mapping_front_matter_is_an_error():
    with pytest.raises(ValueError, match="mapping"):
        parse_front_matter("---\n- a\n---\n")


# --- links --------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("doc:text-references", "/docs/text-references"),
        ("doc:node-titles#3-default-nodes", "/docs/node-titles#3-default-nodes"),
        ("ref:get-v3-texts", "/reference/get-v3-texts"),
        ("page:contact-us", "/page/contact-us"),
        ("https://developers.sefaria.org/docs/cli", "/docs/cli"),
        ("http://developers.sefaria.org/reference/x?a=1#b", "/reference/x?a=1#b"),
        ("https://developers.sefaria.org", "/"),
        ("https://DEVELOPERS.sefaria.org/x", "/x"),
        ("https://developers.sefaria.org.evil.example/x", "https://developers.sefaria.org.evil.example/x"),
        ("https://www.sefaria.org/texts", "https://www.sefaria.org/texts"),
        ("doc: shape-api", "doc: shape-api"),
        ("doc:", "doc:"),
        ("#anchor", "#anchor"),
        ("mailto:developers@sefaria.org", "mailto:developers@sefaria.org"),
    ],
)
def test_rewrite_link(url, expected):
    assert rewrite_link(url) == expected


def test_rewrite_markdown_links_only_touches_destinations():
    source = (
        "See [doc:x](doc:text-references) and [r][1] and `[c](doc:in-code)` and doc:bare and "
        "<https://developers.sefaria.org/docs/autolink>.\n\n"
        "```\n[f](doc:in-fence)\n```\n\n"
        '<a href="https://developers.sefaria.org/docs/raw">raw</a>\n\n'
        "![img](https://developers.sefaria.org/img.png)\n\n"
        "[1]: ref:get-shape\n"
    )
    new, changes = rewrite_markdown_links(source)
    assert new == (
        "See [doc:x](/docs/text-references) and [r][1] and `[c](doc:in-code)` and doc:bare and "
        "<https://developers.sefaria.org/docs/autolink>.\n\n"
        "```\n[f](doc:in-fence)\n```\n\n"
        '<a href="/docs/raw">raw</a>\n\n'
        "![img](/img.png)\n\n"
        "[1]: /reference/get-shape\n"
    )
    assert len(changes) == 4


def test_rewrite_markdown_links_is_idempotent_and_byte_preserving():
    source = "Line one  \r\nno links here\n\n[a](https://www.sefaria.org)"
    assert rewrite_markdown_links(source) == (source, [])


def test_custom_link_resolver():
    html = render("[a](doc:x)", link_resolver=lambda u: "/custom" + u).html
    assert 'href="/customdoc:x"' in html


# --- plain text ---------------------------------------------------------------------------------------------------


def test_plain_text():
    source = (
        "# Title\n\nPara with `code` and [link](https://x.org).\n\n* one\n* two\n\n"
        "```python\nhidden_code()\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n"
        '<Callout icon="🚧" theme="warn">\n  Callout body\n</Callout>\n\n'
        "<HTMLBlock>{`<p>frame only</p>`}</HTMLBlock>\n"
    )
    text = render(source).text
    assert text.split("\n") == ["Title", "Para with code and link.", "one", "two", "a", "b", "1", "2", "Callout body"]


def test_extract_text_collapses_whitespace_and_decodes_entities():
    assert extract_text("<p>a  &amp;\n b</p><p>&lt;c&gt;</p>") == "a &\nb\n<c>"


# --- options ------------------------------------------------------------------------------------------------------


def test_htmlblock_url_uses_revision_and_index():
    html = render("<HTMLBlock>{`a`}</HTMLBlock>\n\n<HTMLBlock>{`b`}</HTMLBlock>", revision=42).html
    assert 'src="/_portal/htmlblock/42/0"' in html
    assert 'src="/_portal/htmlblock/42/1"' in html
