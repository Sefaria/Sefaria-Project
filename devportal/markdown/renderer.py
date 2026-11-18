"""Markdown to C4 HTML. See devportal/contracts/DIALECT.md for the dialect and the exact output of each construct."""

import re
from dataclasses import dataclass, field
from html import escape

from markdown_it import MarkdownIt
from markdown_it.common.utils import unescapeAll
from markdown_it.token import Token

from .components import component_rule
from .emoji import emoji_rule
from .frontmatter import split_front_matter
from .links import rewrite_link
from .plaintext import extract_text
from .sanitize import sanitize
from .slugger import Slugger

HTMLBLOCK_URL = "/_portal/htmlblock/{revision}/{index}"

# Code-tab labels for a fence's language when the info string gives no title (live's display names).
LANG_LABELS = {
    "bash": "Bash",
    "c": "C",
    "clojure": "Clojure",
    "cpp": "C++",
    "csharp": "C#",
    "css": "CSS",
    "curl": "cURL",
    "dart": "Dart",
    "docker": "Docker",
    "dockerfile": "Dockerfile",
    "go": "Go",
    "graphql": "GraphQL",
    "html": "HTML",
    "http": "HTTP",
    "java": "Java",
    "javascript": "JavaScript",
    "js": "JavaScript",
    "json": "JSON",
    "jsx": "JSX",
    "kotlin": "Kotlin",
    "markdown": "Markdown",
    "md": "Markdown",
    "node": "Node",
    "objectivec": "Objective-C",
    "php": "PHP",
    "powershell": "PowerShell",
    "py": "Python",
    "python": "Python",
    "r": "R",
    "ruby": "Ruby",
    "rust": "Rust",
    "scala": "Scala",
    "scss": "SCSS",
    "sh": "Shell",
    "shell": "Shell",
    "sql": "SQL",
    "swift": "Swift",
    "text": "Text",
    "ts": "TypeScript",
    "tsx": "TSX",
    "typescript": "TypeScript",
    "xml": "XML",
    "yaml": "YAML",
    "yml": "YAML",
}

# Blockquote callouts: a blockquote whose first line starts with one of these emoji (live's theme table).
CALLOUT_EMOJI = {
    "📘": "info",
    "ℹ️": "info",
    "🚧": "warn",
    "⚠️": "warn",
    "⚠": "warn",
    "👍": "okay",
    "✅": "okay",
    "❗️": "error",
    "❗": "error",
    "🛑": "error",
    "⁉️": "error",
    "‼️": "error",
}
CALLOUT_THEMES = ("default", "info", "warn", "error", "okay")
THEME_ALIASES = {"success": "okay", "warning": "warn", "danger": "error"}
THEME_ICONS = {"default": "📘", "info": "📘", "warn": "🚧", "error": "❗️", "okay": "👍"}
_CALLOUT_EMOJI_ORDER = sorted(CALLOUT_EMOJI, key=len, reverse=True)

_ALIGNS = ("left", "center", "right")
_WIDTH = re.compile(r"^\d+(\.\d+)?(px|%)?$")
_YOUTUBE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/|live/)|youtu\.be/)([\w-]{11})"
)
_TEXT_ALIGN = re.compile(r"text-align:\s*(left|center|right)")
_HTML_URL_ATTR = re.compile(r"""(\b(?:href|src)\s*=\s*)(["'])(.*?)\2""", re.IGNORECASE)


@dataclass
class RenderResult:
    html: str
    toc: list = field(default_factory=list)  # [{"level": 1..3, "id": str, "text": str}]
    text: str = ""
    htmlblocks: list = field(default_factory=list)  # raw HTML of each <HTMLBlock>, in order


# --- token helpers ------------------------------------------------------------------------------------------------


def inline_text(children):
    """Text content of inline children, as a browser's textContent would give it."""
    out = []
    for child in children or ():
        if child.type in ("text", "code_inline"):
            out.append(child.content)
        elif child.type in ("softbreak", "hardbreak"):
            out.append("\n")
        elif child.children:
            out.append(inline_text(child.children))
    return "".join(out)


def _attr_escape(value):
    return escape(str(value), quote=True)


def _nested_lists(tok):
    """Every token list nested in a component token."""
    meta = tok.meta or {}
    if "tokens" in meta:
        yield meta["tokens"]
    for row in meta.get("rows", ()):
        for cell in row["cells"]:
            yield cell["tokens"]


def _walk(tokens, fn, depth=0):
    """Apply `fn(tokens, depth)` to `tokens` and every nested list; depth counts enclosing callouts."""
    fn(tokens, depth)
    for tok in tokens:
        if tok.type in ("dp_callout", "dp_table"):
            inner = depth + 1 if tok.type == "dp_callout" else depth
            for sub in _nested_lists(tok):
                _walk(sub, fn, inner)


# --- transforms ---------------------------------------------------------------------------------------------------


def _blockquote_callouts(tokens, _depth):
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if (
            tok.type == "blockquote_open"
            and i + 2 < len(tokens)
            and tokens[i + 1].type == "paragraph_open"
            and tokens[i + 2].type == "inline"
            and tokens[i + 2].children
            and tokens[i + 2].children[0].type == "text"
        ):
            first = tokens[i + 2].children[0]
            emoji = next((e for e in _CALLOUT_EMOJI_ORDER if first.content.startswith(e)), None)
            rest_of_line = first.content[len(emoji) :] if emoji else ""
            if emoji and (not rest_of_line or rest_of_line[0] in " \t"):
                _make_callout(tokens, i, emoji, rest_of_line.lstrip())
        i += 1


def _make_callout(tokens, i, emoji, title_start):
    bq, p_open, inline, p_close = tokens[i], tokens[i + 1], tokens[i + 2], tokens[i + 3]
    bq.meta = {"callout": {"theme": CALLOUT_EMOJI[emoji], "icon": emoji}}
    children = inline.children
    children[0].content = title_start
    brk = next((k for k, c in enumerate(children) if c.type in ("softbreak", "hardbreak")), None)
    title = children if brk is None else children[:brk]
    rest = [] if brk is None else children[brk + 1 :]
    if title and title[-1].type == "text":
        title[-1].content = title[-1].content.rstrip()
    new = []
    if inline_text(title).strip():
        h_open = Token("heading_open", "h3", 1, markup="###", block=True, map=p_open.map)
        h_inline = Token("inline", "", 0, children=title, content=inline_text(title), map=p_open.map)
        h_close = Token("heading_close", "h3", -1, markup="###", block=True)
        new += [h_open, h_inline, h_close]
    if rest:
        new += [p_open, Token("inline", "", 0, children=rest, content=inline_text(rest), map=p_open.map), p_close]
    tokens[i + 1 : i + 4] = new


def _image_paragraphs(tokens, _depth):
    """A paragraph holding only images becomes one block image per image."""
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok.type == "paragraph_open" and i + 2 < len(tokens) and tokens[i + 1].type == "inline":
            children = tokens[i + 1].children or []
            images = [c for c in children if c.type == "image"]
            others = [c for c in children if c.type != "image" and not (c.type == "text" and not c.content.strip())]
            others = [c for c in others if c.type not in ("softbreak", "hardbreak")]
            if images and not others:
                blocks = []
                for img in images:
                    b = Token("dp_image", "div", 0, block=True, map=tok.map)
                    b.meta = {
                        "attrs": {
                            "src": img.attrGet("src"),
                            "alt": inline_text(img.children),
                            "title": img.attrGet("title") or "",
                        },
                        "markdown": True,
                    }
                    blocks.append(b)
                tokens[i : i + 3] = blocks
                i += len(blocks)
                continue
        i += 1


def _table_cells(tokens, _depth):
    for tok in tokens:
        if tok.type in ("th_open", "td_open"):
            style = tok.attrGet("style")
            if style:
                del tok.attrs["style"]
                m = _TEXT_ALIGN.search(style)
                if m:
                    tok.attrSet("class", "dp-align-" + m.group(1))
            tok.attrSet("dir", "auto")


def _rewrite_attr(m, resolver):
    value = m.group(3)
    new = resolver(value)
    if new != value:
        value = escape(new, quote=True)
    return m.group(1) + m.group(2) + value + m.group(2)


def _resolve_links(resolver):
    def fn(tokens, _depth):
        for tok in tokens:
            for child in [tok, *(tok.children or [])]:
                if child.type == "link_open" and child.attrGet("href") is not None:
                    child.attrSet("href", resolver(child.attrGet("href")))
                elif child.type == "image" and child.attrGet("src") is not None:
                    child.attrSet("src", resolver(child.attrGet("src")))
                elif child.type in ("html_block", "html_inline"):
                    child.content = _HTML_URL_ATTR.sub(lambda m: _rewrite_attr(m, resolver), child.content)
            if tok.type in ("dp_image", "dp_embed") and tok.meta.get("attrs", {}).get("src"):
                tok.meta["attrs"]["src"] = resolver(tok.meta["attrs"]["src"])

    return fn


def _assign_ids(tokens, toc):
    """Heading ids in document order across nested components; TOC from levels 1-3 outside callouts."""
    slugger = Slugger()

    # Blockquote callouts nest by open/close tokens, not by meta lists.
    def visit_flat(toks, depth):
        level = depth
        stack = []
        for idx, tok in enumerate(toks):
            if tok.type == "blockquote_open":
                stack.append(bool(tok.meta))
                if tok.meta:
                    level += 1
            elif tok.type == "blockquote_close":
                if stack and stack.pop():
                    level -= 1
            elif tok.type == "heading_open":
                text = inline_text(toks[idx + 1].children)
                slug = slugger.slug(text)
                tok.meta = {"id": slug, "text": text}
                if int(tok.tag[1]) <= 3 and level == 0:
                    toc.append({"level": int(tok.tag[1]), "id": slug, "text": text.strip()})
            elif tok.type == "dp_callout":
                for sub in _nested_lists(tok):
                    visit_flat(sub, level + 1)
            elif tok.type == "dp_table":
                for sub in _nested_lists(tok):
                    visit_flat(sub, level)

    visit_flat(tokens, 0)


# --- rendering ----------------------------------------------------------------------------------------------------


def _image_html(md, env, attrs):
    src = attrs.get("src") or ""
    alt = attrs.get("alt") or ""
    if not isinstance(alt, str):
        alt = ""
    title = attrs.get("title") if isinstance(attrs.get("title"), str) else ""
    align = attrs.get("align") if attrs.get("align") in _ALIGNS else None
    width = attrs.get("width")
    width = width.strip() if isinstance(width, str) else (str(width) if isinstance(width, int) else None)
    if width and not _WIDTH.match(width):
        width = None
    border = attrs.get("border") is True
    framed = attrs.get("framed") is True
    caption = attrs.get("caption") if isinstance(attrs.get("caption"), str) else ""
    caption = caption.strip()

    classes = ["dp-img"]
    if align:
        classes.append("dp-img-align-" + align)
    if border:
        classes.append("dp-img-border")
    img = f'<img class="{" ".join(classes)}" src="{_attr_escape(src)}" alt="{_attr_escape(alt)}"'
    if title:
        img += f' title="{_attr_escape(title)}"'
    if width:
        img += f' width="{_attr_escape(width)}"'
    img += ' loading="lazy">'
    label = alt if (caption and alt) else "Expand image"
    html = (
        f'<span class="dp-img-lightbox" role="button" tabindex="0" aria-label="{_attr_escape(label)}">'
        f'<span class="dp-img-lightbox-inner">{img}</span></span>'
    )
    if caption or framed:
        fig_classes = ["dp-figure"]
        if framed:
            fig_classes += ["dp-figure-framed", "dp-figure-align-" + (align or "center")]
        cap = ""
        if caption:
            cap_tokens = md.parseInline(caption, env)[0].children
            cap = f'<figcaption dir="auto"><p>{md.renderer.renderInline(cap_tokens, md.options, env)}</p></figcaption>'
        html = f'<figure class="{" ".join(fig_classes)}">{html}{cap}</figure>'
    return f'<div class="dp-image">{html}</div>\n'


def _install_rules(md, options):
    def heading_open(self, tokens, idx, opts, env):
        tok = tokens[idx]
        meta = tok.meta or {}
        if not meta.get("text", "").strip():
            return ""
        return (
            f'<{tok.tag} class="dp-heading dp-heading-{tok.tag[1]}" id="{_attr_escape(meta["id"])}" dir="auto">'
            '<span class="dp-heading-text">'
        )

    def heading_close(self, tokens, idx, opts, env):
        tok = tokens[idx]
        # find the matching open token
        j = idx - 1
        while j >= 0 and tokens[j].type != "heading_open":
            j -= 1
        meta = tokens[j].meta or {}
        if not meta.get("text", "").strip():
            return ""
        return (
            f'</span><a class="dp-heading-anchor" href="#{_attr_escape(meta["id"])}" '
            f'aria-label="{_attr_escape("Skip link to " + meta["text"])}"></a></{tok.tag}>\n'
        )

    def paragraph_open(self, tokens, idx, opts, env):
        if tokens[idx].hidden:
            return ""
        return '<p dir="auto">'

    def list_item_open(self, tokens, idx, opts, env):
        return '<li dir="auto">'

    def blockquote_open(self, tokens, idx, opts, env):
        callout = (tokens[idx].meta or {}).get("callout")
        if not callout:
            return "<blockquote>\n"
        return _callout_open(callout["theme"], callout["icon"])

    def table_open(self, tokens, idx, opts, env):
        return '<div class="dp-table"><div class="dp-table-inner"><table>\n'

    def table_close(self, tokens, idx, opts, env):
        return "</table></div></div>\n"

    def code_inline(self, tokens, idx, opts, env):
        return f'<code class="dp-code">{escape(tokens[idx].content, quote=False)}</code>'

    def fence(self, tokens, idx, opts, env):
        tok = tokens[idx]
        info = unescapeAll(tok.info).strip()
        parts = info.split(None, 1)
        lang = parts[0] if parts else ""
        title = parts[1].strip() if len(parts) > 1 else ""
        return _code_html(tok.content, lang, title)

    def code_block(self, tokens, idx, opts, env):
        return _code_html(tokens[idx].content, "", "")

    def image(self, tokens, idx, opts, env):
        tok = tokens[idx]
        attrs = {"src": tok.attrGet("src"), "alt": inline_text(tok.children), "title": tok.attrGet("title") or ""}
        html = _image_html(md, env, attrs)
        # inline image: same lightbox markup without the block wrapper
        return html[len('<div class="dp-image">') : -len("</div>\n")]

    def dp_image(self, tokens, idx, opts, env):
        tok = tokens[idx]
        return _image_html(md, env, tok.meta["attrs"])

    def dp_callout(self, tokens, idx, opts, env):
        attrs = tokens[idx].meta["attrs"]
        theme = attrs.get("theme") if isinstance(attrs.get("theme"), str) else "default"
        theme = THEME_ALIASES.get(theme, theme)
        if theme not in CALLOUT_THEMES:
            theme = "default"
        icon = attrs.get("icon") if isinstance(attrs.get("icon"), str) else THEME_ICONS[theme]
        inner = self.render(tokens[idx].meta["tokens"], opts, env)
        return _callout_open(theme, icon) + inner + "</blockquote>\n"

    def dp_embed(self, tokens, idx, opts, env):
        attrs = tokens[idx].meta["attrs"]
        url = attrs.get("url") or attrs.get("href") or ""
        url = url if isinstance(url, str) else ""
        title = attrs.get("title") if isinstance(attrs.get("title"), str) and attrs.get("title") else ""
        m = _YOUTUBE.search(url)
        if m:
            src = "https://www.youtube-nocookie.com/embed/" + m.group(1)
            return (
                '<div class="dp-embed"><div class="dp-embed-media">'
                f'<iframe class="dp-embed-iframe" src="{src}" width="854" height="480" '
                f'title="{_attr_escape(title or "YouTube embed")}" '
                'allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen="" '
                'loading="lazy"></iframe></div></div>\n'
            )
        return (
            f'<div class="dp-embed dp-embed-link"><a href="{_attr_escape(url)}">'
            f"{escape(title or url, quote=False)}</a></div>\n"
        )

    def dp_htmlblock(self, tokens, idx, opts, env):
        index = tokens[idx].meta["index"]
        src = options["htmlblock_url"].format(revision=options["revision"], index=index)
        return (
            '<div class="dp-htmlblock"><iframe class="dp-htmlblock-frame" '
            'sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" '
            f'src="{_attr_escape(src)}" title="HTML block {index + 1}" loading="lazy"></iframe></div>\n'
        )

    def dp_table(self, tokens, idx, opts, env):
        meta = tokens[idx].meta
        align = meta["align"]
        out = ['<div class="dp-table"><div class="dp-table-inner"><table>\n']
        for section in ("thead", "tbody"):
            rows = [row for row in meta["rows"] if row["section"] == section]
            if not rows:
                continue
            out.append(f"<{section}>\n")
            for row in rows:
                out.append("<tr>\n")
                for col, cell in enumerate(row["cells"]):
                    a = align[col] if col < len(align) and align[col] in _ALIGNS else None
                    cls = f' class="dp-align-{a}"' if a else ""
                    toks = cell["tokens"]
                    # Live: a cell with exactly one top-level paragraph shows it without <p>.
                    paras = [k for k, t in enumerate(toks) if t.type == "paragraph_open" and t.level == 0]
                    if len(paras) == 1:
                        toks[paras[0]].hidden = True
                        toks[paras[0] + 2].hidden = True
                    body = self.render(toks, opts, env).strip("\n")
                    out.append(f'<{cell["tag"]}{cls} dir="auto">{body}</{cell["tag"]}>\n')
                out.append("</tr>\n")
            out.append(f"</{section}>\n")
        out.append("</table></div></div>\n")
        return "".join(out)

    rules = {
        "heading_open": heading_open,
        "heading_close": heading_close,
        "paragraph_open": paragraph_open,
        "list_item_open": list_item_open,
        "blockquote_open": blockquote_open,
        "table_open": table_open,
        "table_close": table_close,
        "code_inline": code_inline,
        "fence": fence,
        "code_block": code_block,
        "image": image,
        "dp_image": dp_image,
        "dp_callout": dp_callout,
        "dp_embed": dp_embed,
        "dp_htmlblock": dp_htmlblock,
        "dp_table": dp_table,
    }
    for name, fn in rules.items():
        md.add_render_rule(name, fn)


def _callout_open(theme, icon):
    return (
        f'<blockquote class="dp-callout dp-callout-{theme}">'
        f'<span class="dp-callout-icon" aria-hidden="true">{escape(icon, quote=False)}</span>'
    )


def _code_html(content, lang, title):
    code_attrs = ' class="dp-code"'
    if lang:
        code_attrs += f' data-lang="{_attr_escape(lang)}"'
    pre = f'<pre class="dp-pre"><code{code_attrs}>{escape(content, quote=False)}</code></pre>'
    if not lang:
        return pre + "\n"
    label = title or LANG_LABELS.get(lang.lower(), lang)
    return (
        '<div class="dp-codetabs"><div class="dp-codetabs-toolbar">'
        f'<button type="button" class="dp-codetabs-tab dp-active" value="{_attr_escape(lang)}">'
        f"{escape(label, quote=False)}</button></div>"
        f'<div class="dp-codetabs-inner">{pre}</div></div>\n'
    )


def make_parser(options):
    md = MarkdownIt("gfm-like", {"html": True, "typographer": False, "xhtmlOut": False, "breaks": True})
    md.linkify.set({"fuzzy_link": False})
    md.block.ruler.before(
        "html_block",
        "dp_component",
        component_rule,
        {"alt": ["paragraph", "reference", "blockquote", "list"]},
    )
    md.core.ruler.push("dp_emoji", emoji_rule)
    _install_rules(md, options)
    return md


def render(
    source,
    *,
    link_resolver=rewrite_link,
    revision="0",
    htmlblock_url=HTMLBLOCK_URL,
    sanitize_output=True,
):
    """Render one page's Markdown (front matter, if present, is ignored) to a `RenderResult`."""
    raw, body = split_front_matter(source)
    if raw is not None:
        source = body
    options = {"revision": str(revision), "htmlblock_url": htmlblock_url}
    md = make_parser(options)
    env = {}
    tokens = md.parse(source, env)
    _walk(tokens, _blockquote_callouts)
    _walk(tokens, _image_paragraphs)
    _walk(tokens, _table_cells)
    if link_resolver is not None:
        _walk(tokens, _resolve_links(link_resolver))
    toc = []
    _assign_ids(tokens, toc)
    html = md.renderer.render(tokens, md.options, env)
    if sanitize_output:
        html = sanitize(html)
    return RenderResult(html=html, toc=toc, text=extract_text(html), htmlblocks=list(env.get("dp_htmlblocks", [])))
