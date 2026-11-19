"""The sanitizer's allow-list (PLAN §2.6) and hostile Markdown (PLAN §6.7 S-8)."""

import re
from html.parser import HTMLParser

import pytest

from devportal.markdown import render, sanitize
from devportal.markdown.sanitize import ALLOWED_TAGS, HTMLBLOCK_SANDBOX

# --- allow-list ---------------------------------------------------------------------------------------------------


def test_renderer_output_survives_sanitizing_unchanged():
    source = (
        '# H\n\n<Callout icon="🚧" theme="warn">\n  ### T\n\n  Body\n</Callout>\n\n'
        "```python\nx = 1\n```\n\n| a | b |\n| :- | -: |\n| 1 | 2 |\n\n"
        '<Image src="https://files.readme.io/x.png" align="center" width="70% " caption="Cap" border={true} '
        "framed={true} />\n\n"
        '<Embed url="https://www.youtube.com/watch?v=JUSW7y4wYUQ" />\n\n'
        "<HTMLBlock>{`<b>x</b>`}</HTMLBlock>\n\n> 🚧 Title\n\n![](https://files.readme.io/y.png)\n"
    )
    raw = render(source, sanitize_output=False).html
    assert sanitize(raw) == render(source).html
    from devportal.contracts.normalize import normalize

    assert normalize(sanitize(raw)) == normalize(raw)


@pytest.mark.parametrize(
    "tag", sorted(ALLOWED_TAGS - {"iframe", "img", "br", "hr", "table", "thead", "tbody", "tr", "th", "td", "li"})
)
def test_allowed_tags_are_kept(tag):
    assert f"<{tag}>" in sanitize(f"<div><{tag}>x</{tag}></div>")


def test_class_keeps_only_dp_tokens():
    assert sanitize('<p class="evil dp-a  dp-b x-dp">x</p>') == '<p class="dp-a dp-b">x</p>'
    assert sanitize('<p class="evil">x</p>') == "<p>x</p>"


@pytest.mark.parametrize(
    ("value", "kept"),
    [("auto", True), ("rtl", True), ("ltr", True), ("sideways", False)],
)
def test_dir_values(value, kept):
    assert (f'dir="{value}"' in sanitize(f'<p dir="{value}">x</p>')) is kept


def test_id_only_on_headings():
    assert sanitize('<h2 id="a">x</h2>') == '<h2 id="a">x</h2>'
    assert sanitize('<p id="a">x</p>') == "<p>x</p>"


@pytest.mark.parametrize(
    "url",
    ["https://www.sefaria.org/x", "http://example.org", "mailto:a@b.org", "/docs/x", "#frag", "relative/path"],
)
def test_allowed_urls(url):
    assert f'href="{url}"' in sanitize(f'<a href="{url}">x</a>')


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        " javascript:alert(1)",
        "java\tscript:alert(1)",
        "vbscript:x",
        "data:text/html;base64,PHNjcmlwdD4=",
        "file:///etc/passwd",
        "doc:unresolved",
    ],
)
def test_refused_urls(url):
    out = sanitize(f'<a href="{url}">x</a><img src="{url}">')
    assert "href" not in out
    assert "src" not in out


@pytest.mark.parametrize(
    "src",
    [
        "https://sefaria.formstack.com/forms/developer_contact",
        "https://www.youtube-nocookie.com/embed/JUSW7y4wYUQ",
        "/_portal/htmlblock/12/0",
    ],
)
def test_allowed_iframes(src):
    assert f'src="{src}"' in sanitize(f'<iframe src="{src}"></iframe>')


@pytest.mark.parametrize(
    "src",
    [
        "https://www.youtube.com/embed/x",
        "https://sefaria.formstack.com.evil.example/x",
        "https://evil.example/?https://www.youtube-nocookie.com/",
        "//www.youtube-nocookie.com/embed/x",
        "/_portal/htmlblock/1/0/../../admin",
        "/_portal/other",
        "javascript:alert(1)",
        "",
    ],
)
def test_refused_iframes_are_removed_entirely(src):
    assert "iframe" not in sanitize(f'<p>a</p><iframe src="{src}">fallback</iframe><p>b</p>')


def test_htmlblock_frame_always_gets_the_fixed_sandbox():
    out = sanitize('<iframe src="/_portal/htmlblock/1/0" sandbox="allow-scripts allow-same-origin"></iframe>')
    assert re.findall(r'sandbox="([^"]*)"', out) == [HTMLBLOCK_SANDBOX]
    assert "allow-scripts" not in out


def test_author_sandbox_on_external_frames_is_dropped():
    out = sanitize('<iframe src="https://www.youtube-nocookie.com/embed/x" sandbox="allow-top-navigation"></iframe>')
    assert "sandbox" not in out


def test_iframe_allow_attribute_is_filtered():
    out = sanitize('<iframe src="https://www.youtube-nocookie.com/embed/x" allow="fullscreen; camera; usb"></iframe>')
    assert 'allow="fullscreen"' in out


def test_no_rel_or_target_added_or_kept():
    assert sanitize('<a href="https://x.org" target="_blank" rel="opener">x</a>') == '<a href="https://x.org">x</a>'


# --- hostile Markdown (S-8) ---------------------------------------------------------------------------------------

HOSTILE = {
    "script tag": "<script>alert(1)</script>",
    "script inline": "Text <script>alert(1)</script> more",
    "script uppercase": "<SCRIPT SRC=//evil.example/x.js></SCRIPT>",
    "img onerror": '<img src="x" onerror="alert(1)">',
    "svg onload": '<svg onload="alert(1)"><circle r="1"/></svg>',
    "event handler on p": '<p onclick="alert(1)" onmouseover="alert(1)">x</p>',
    "javascript link md": "[x](javascript:alert(1))",
    "javascript link html": '<a href="javascript:alert(1)">x</a>',
    "javascript entity-encoded": '<a href="&#106;avascript:alert(1)">x</a>',
    "javascript autolink": "<javascript:alert(1)>",
    "javascript reference link": "[x][r]\n\n[r]: javascript:alert(1)",
    "data link": "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "style attribute": '<p style="position:fixed;top:0;left:0;width:100%;height:100%">x</p>',
    "style tag": "<style>body{display:none}</style>",
    "unknown component": '<Cards columns={3}><Accordion title="x" onClick={alert}>text</Accordion></Cards>',
    "unknown component block": '<Recipe slug="x" onLoad={() => alert(1)} />',
    "nested html in callout": (
        '<Callout icon="🚧" theme="warn">\n  <script>alert(1)</script>\n'
        '  <a href="javascript:alert(1)" onmouseover="alert(1)">x</a>\n  <img src=x onerror=alert(1)>\n</Callout>'
    ),
    "nested html in table cell": (
        '<Table align={["left"]}>\n  <tbody>\n    <tr>\n      <td>\n        <img src=x onerror=alert(1)> '
        '<span style="color:red" onclick="alert(1)">cell</span> <script>alert(1)</script>\n      </td>\n'
        "    </tr>\n  </tbody>\n</Table>"
    ),
    "nested html in pipe table": "| a |\n| - |\n| <img src=x onerror=alert(1)> <script>alert(1)</script> |",
    "iframe to anywhere": '<iframe src="https://evil.example/"></iframe>',
    "iframe srcdoc": '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    "object embed form": '<object data="x.swf"></object><embed src="x.swf"><form action="/x"><input></form>',
    "meta refresh": '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    "base tag": '<base href="https://evil.example/">',
    "link stylesheet": '<link rel="stylesheet" href="https://evil.example/x.css">',
    "image component javascript": '<Image src="javascript:alert(1)" caption="<img src=x onerror=alert(1)>" />',
    "image component quote breakout": '<Image src="x.png" alt="a&quot; onerror=&quot;alert(1)" />',
    "embed javascript": '<Embed url="javascript:alert(1)" />',
    "callout icon injection": '<Callout icon="<img src=x onerror=alert(1)>" theme="warn">\n  x\n</Callout>',
    "callout theme injection": '<Callout icon="🚧" theme="warn&quot; onclick=&quot;alert(1)">\n  x\n</Callout>',
    "code fence language injection": '```python" onmouseover="alert(1)\nx\n```',
    "heading forged id": '<h2 id="x" onclick="alert(1)">x</h2>',
    "mathml": '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    "comment": "<!-- <script>alert(1)</script> -->",
    "htmlblock with script": "<HTMLBlock>{`<script>alert(1)</script><img src=x onerror=alert(1)>`}</HTMLBlock>",
    "template": "<template><script>alert(1)</script></template>",
    "noscript": "<noscript><img src=x onerror=alert(1)></noscript>",
    "textarea breakout": "<textarea></textarea><script>alert(1)</script>",
}

_SAFE_URL = re.compile(r"^(https?:|mailto:|/|#|[^:/?#]*([/?#]|$))", re.IGNORECASE)
_IFRAME_SRC = ("https://sefaria.formstack.com/", "https://www.youtube-nocookie.com/", "/_portal/htmlblock/")


class _Audit(HTMLParser):
    """Collect every structural problem in sanitized HTML. Text content may say anything; markup may not."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.problems = []

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED_TAGS:
            self.problems.append(f"tag <{tag}>")
        for name, value in attrs:
            value = value or ""
            if name.startswith("on") or name in ("style", "srcdoc", "formaction", "xlink:href"):
                self.problems.append(f"attribute {name} on <{tag}>")
            if name in ("href", "src") and not _SAFE_URL.match(value.strip()):
                self.problems.append(f"url {value!r} on <{tag}>")
            if name == "class" and not all(c.startswith("dp-") for c in value.split()):
                self.problems.append(f"class {value!r}")
            if tag == "iframe" and name == "src" and not value.startswith(_IFRAME_SRC):
                self.problems.append(f"iframe src {value!r}")
            if tag == "iframe" and name == "sandbox" and value != HTMLBLOCK_SANDBOX:
                self.problems.append(f"iframe sandbox {value!r}")

    handle_startendtag = handle_starttag

    def handle_comment(self, data):
        self.problems.append("comment")


def audit(html):
    parser = _Audit()
    parser.feed(html)
    parser.close()
    return parser.problems


def test_audit_catches_problems():
    bad = '<script></script><p onclick="x" style="y" class="z"><a href="javascript:x">a</a></p><iframe src="https://e.x"></iframe><!--c-->'
    assert len(audit(bad)) == 7


@pytest.mark.parametrize("name", sorted(HOSTILE), ids=sorted(HOSTILE))
def test_hostile_markdown_is_neutralized(name):
    html = render(HOSTILE[name]).html
    assert audit(html) == [], html


def test_unknown_component_keeps_its_text_but_not_its_tags():
    html = render('<Cards columns={3}><Accordion title="x">text survives</Accordion></Cards>').html
    assert "text survives" in html
    assert "cards" not in html.lower()
    assert "accordion" not in html.lower()


def test_htmlblock_body_never_reaches_the_page():
    result = render("<HTMLBlock>{`<script>alert(1)</script><p>hi</p>`}</HTMLBlock>")
    assert "alert" not in result.html
    assert "<p>hi</p>" not in result.html
    assert result.htmlblocks == ["<script>alert(1)</script><p>hi</p>"]
    assert f'sandbox="{HTMLBLOCK_SANDBOX}"' in result.html
