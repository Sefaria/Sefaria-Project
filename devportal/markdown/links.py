"""Internal link rewriting (PLAN §7.2 step 3).

`rewrite_link(url)` maps one destination:

    doc:<slug>[#frag]                              -> /docs/<slug>[#frag]
    ref:<slug>[#frag]                              -> /reference/<slug>[#frag]
    page:<slug>[#frag]                             -> /page/<slug>[#frag]
    http(s)://developers.sefaria.org/<path>        -> /<path>

Anything else is returned unchanged. `rewrite_markdown_links(source)` applies it to link destinations in Markdown
source only (inline links and images, reference definitions, and `href`/`src` in raw HTML and components), never
inside code, link text, autolinks or bare URLs, and leaves every other byte alone. The renderer applies
`rewrite_link` again to every rendered `href` and `src`, so a destination that was not rewritten at import still
works.
"""

import re

from markdown_it import MarkdownIt

_PREFIXES = (("doc:", "/docs/"), ("ref:", "/reference/"), ("page:", "/page/"))
_DEV_HOST = re.compile(r"^https?://developers\.sefaria\.org(?=/|$|\?|#)", re.IGNORECASE)


def rewrite_link(url):
    if url is None:
        return url
    stripped = url.strip()
    for prefix, target in _PREFIXES:
        if stripped.startswith(prefix):
            rest = stripped[len(prefix) :]
            malformed = rest.startswith((" ", "%20")) or "/" in rest.split("#", 1)[0]
            if rest and not malformed:
                return target + rest
            return url
    m = _DEV_HOST.match(stripped)
    if m:
        rest = stripped[m.end() :]
        if not rest.startswith("/"):
            rest = "/" + rest
        return rest
    return url


# --- source rewriting -------------------------------------------------------------------------------------------

_md = MarkdownIt("commonmark", {"html": True}).enable("table")

# `](dest` or `](<dest>` of an inline link or image. The destination ends at whitespace or `)`.
_INLINE = re.compile(r"\]\(\s*(<[^>\n]*>|[^\s)]+)")
# `[label]: dest` reference definition at the start of a line.
_REFDEF = re.compile(r"^( {0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)", re.MULTILINE)
# href="..." / src='...' in raw HTML or a component.
_ATTR = re.compile(r"""(\b(?:href|src)\s*=\s*)(["'])(.*?)\2""", re.IGNORECASE)
_CODE_SPAN = re.compile(r"(`+)(?:.|\n)*?(?<!`)\1(?!`)")


def _code_line_ranges(source):
    """Line ranges `[start, end)` that are code blocks or fences."""
    ranges = []
    for tok in _md.parse(source):
        if tok.type in ("fence", "code_block") and tok.map:
            ranges.append(tuple(tok.map))
    return ranges


def _rewrite_segment(text, counter):
    def sub_dest(dest):
        inner = dest[1:-1] if dest.startswith("<") and dest.endswith(">") else dest
        new = rewrite_link(inner)
        if new != inner:
            counter.append((inner, new))
            return f"<{new}>" if dest.startswith("<") else new
        return dest

    text = _INLINE.sub(lambda m: m.group(0)[: m.start(1) - m.start(0)] + sub_dest(m.group(1)), text)
    text = _REFDEF.sub(lambda m: m.group(1) + sub_dest(m.group(2)), text)
    return _ATTR.sub(lambda m: m.group(1) + m.group(2) + sub_dest(m.group(3)) + m.group(2), text)


def _rewrite_prose(text, counter):
    """Rewrite outside inline code spans."""
    out = []
    pos = 0
    for m in _CODE_SPAN.finditer(text):
        out.append(_rewrite_segment(text[pos : m.start()], counter))
        out.append(m.group(0))
        pos = m.end()
    out.append(_rewrite_segment(text[pos:], counter))
    return "".join(out)


def rewrite_markdown_links(source):
    """Return `(new_source, changes)`; `changes` lists `(old, new)` for every rewritten destination."""
    lines = source.splitlines(keepends=True)
    code = [False] * len(lines)
    for start, end in _code_line_ranges(source):
        for i in range(start, min(end, len(lines))):
            code[i] = True
    changes = []
    out = []
    chunk = []
    for line, is_code in zip(lines, code, strict=True):
        if is_code:
            if chunk:
                out.append(_rewrite_prose("".join(chunk), changes))
                chunk = []
            out.append(line)
        else:
            chunk.append(line)
    if chunk:
        out.append(_rewrite_prose("".join(chunk), changes))
    return "".join(out), changes
