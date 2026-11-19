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


_COMPONENT_OPEN = re.compile(r"^[ \t]*<(Callout|Table)(?=[\s>]|$)")


def _component_spans(lines):
    """Line ranges `[start, end)` of `<Callout>` and `<Table>` blocks.

    The renderer dedents a component's body before parsing it (components.py), so indentation inside a
    component is not an indented code block. Code ranges inside a component are computed on its dedented body.
    """
    spans = []
    i = 0
    while i < len(lines):
        m = _COMPONENT_OPEN.match(lines[i])
        if not m:
            i += 1
            continue
        name = m.group(1)
        depth = 0
        for j in range(i, len(lines)):
            depth += len(re.findall(rf"<{name}(?=[\s>]|$)", lines[j]))
            depth -= lines[j].count(f"</{name}>")
            if depth <= 0 and f"</{name}>" in lines[j]:
                spans.append((i, j + 1))
                i = j + 1
                break
        else:
            i += 1
    return spans


_CELL_OPEN = re.compile(r"<(td|th)\b[^>]*>", re.IGNORECASE)
_CELL_CLOSE = re.compile(r"</(td|th)>", re.IGNORECASE)


def _component_regions(lines, spans):
    """Line ranges whose text the renderer parses as their own dedented Markdown document.

    A `<Callout>` body is one region. A `<Table>` is parsed cell by cell (components.py), so each multi-line
    `<td>`/`<th>` body is one region.
    """
    regions = []
    for start, end in spans:
        if _COMPONENT_OPEN.match(lines[start]).group(1) == "Callout":
            regions.append((start + 1, end - 1))
            continue
        cell_start = None
        for i in range(start + 1, end - 1):
            line = lines[i]
            if cell_start is None and _CELL_OPEN.search(line) and not _CELL_CLOSE.search(line):
                cell_start = i + 1
            elif cell_start is not None and _CELL_CLOSE.search(line):
                regions.append((cell_start, i))
                cell_start = None
    return regions


def _code_line_ranges(source):
    """Line ranges `[start, end)` that are code blocks or fences, as the renderer would parse them."""
    lines = source.splitlines(keepends=True)
    spans = _component_spans(lines)
    masked = list(lines)
    for start, end in spans:
        for i in range(start + 1, end - 1):
            masked[i] = "\n" if lines[i].endswith("\n") else ""
    ranges = []
    for tok in _md.parse("".join(masked)):
        if tok.type in ("fence", "code_block") and tok.map:
            start, end = tok.map
            if not any(s <= start < e for s, e in spans):
                ranges.append((start, end))
    for start, end in _component_regions(lines, spans):
        inner = lines[start:end]
        if not any(x.strip() for x in inner):
            continue
        indent = min(len(x) - len(x.lstrip(" \t")) for x in inner if x.strip())
        dedented = "".join(x[indent:] if x.strip() else x for x in inner)
        for tok in _md.parse(dedented):
            if tok.type in ("fence", "code_block") and tok.map:
                ranges.append((start + tok.map[0], start + tok.map[1]))
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
