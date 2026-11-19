"""Block rules for the ReadMe components used in the corpus: Callout, Image, Embed, Table, HTMLBlock.

Each rule recognises a component that starts a line (indent of at most three columns) and produces one block token
whose `meta` carries the parsed attributes and, where the component has Markdown inside, the already-parsed child
tokens (`meta["tokens"]`). Anything that does not match the expected shape is left to the ordinary HTML-block rule,
so it ends up in the sanitizer like any other raw HTML.
"""

import json
import re
import textwrap

COMPONENTS = ("Callout", "Image", "Embed", "Table", "HTMLBlock")
_START = re.compile(r"<(Callout|Image|Embed|Table|HTMLBlock)(?=[\s/>]|$)")
_NAME = re.compile(r"[A-Za-z_][\w-]*")


def scan_tag(src, pos):
    """Scan a JSX-style open tag starting at `src[pos] == '<'`.

    Returns `(name, attrs, end, self_closing)` with `end` just past `>`, or `None` if the tag is malformed.
    Attribute values: `"str"`, `'str'`, `{expr}` (JSON-decoded when possible, `true`/`false` as booleans) or bare
    (boolean `True`).
    """
    m = _NAME.match(src, pos + 1)
    if not m:
        return None
    name = m.group(0)
    i = m.end()
    attrs = {}
    n = len(src)
    while i < n:
        while i < n and src[i].isspace():
            i += 1
        if i >= n:
            return None
        if src.startswith("/>", i):
            return name, attrs, i + 2, True
        if src[i] == ">":
            return name, attrs, i + 1, False
        am = _NAME.match(src, i)
        if not am:
            return None
        key = am.group(0)
        i = am.end()
        while i < n and src[i] in " \t":
            i += 1
        if i < n and src[i] == "=":
            i += 1
            while i < n and src[i] in " \t":
                i += 1
            if i >= n:
                return None
            q = src[i]
            if q in "\"'":
                end = src.find(q, i + 1)
                if end < 0:
                    return None
                attrs[key] = src[i + 1 : end]
                i = end + 1
            elif q == "{":
                depth = 0
                j = i
                in_str = None
                while j < n:
                    c = src[j]
                    if in_str:
                        if c == "\\":
                            j += 1
                        elif c == in_str:
                            in_str = None
                    elif c in "\"'`":
                        in_str = c
                    elif c == "{":
                        depth += 1
                    elif c == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                if j >= n:
                    return None
                attrs[key] = _expr_value(src[i + 1 : j])
                i = j + 1
            else:
                return None
        else:
            attrs[key] = True
    return None


def _expr_value(expr):
    expr = expr.strip()
    if expr == "true":
        return True
    if expr == "false":
        return False
    try:
        return json.loads(expr)
    except ValueError:
        return expr


def _line_text(state, line):
    return state.src[state.bMarks[line] + state.tShift[line] : state.eMarks[line]]


def _block_text(state, start, end):
    """Source text of lines `[start, end)`, relative to the current block indent."""
    return state.getLines(start, end, state.blkIndent, False)


def _find_close(state, start, end, name):
    """First line index in `[start, end)` whose text ends with `</name>`, counting nested opens."""
    depth = 0
    open_re = re.compile(r"<" + name + r"(?=[\s>])")
    close = "</" + name + ">"
    for line in range(start, end):
        text = _line_text(state, line)
        depth += len(open_re.findall(text))
        depth -= text.count(close)
        if depth <= 0 and close in text:
            return line
    return None


def _dedent(text):
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return textwrap.dedent("\n".join(lines))


def component_rule(state, start_line, end_line, silent):
    if state.sCount[start_line] - state.blkIndent >= 4:
        return False
    first = _line_text(state, start_line)
    m = _START.match(first)
    if not m:
        return False
    name = m.group(1)
    handler = _HANDLERS[name]
    return handler(state, start_line, end_line, silent)


def _tag_from(state, start_line, end_line):
    """Scan the open tag starting at `start_line`; it may span lines. Returns `(tag, last_line_of_tag)`."""
    text = _block_text(state, start_line, min(end_line, start_line + 60)).lstrip(" ")
    tag = scan_tag(text, 0)
    if tag is None:
        return None, None
    return tag, start_line + text[: tag[2]].count("\n")


def _push(state, token_type, tag, start_line, next_line, meta):
    token = state.push(token_type, tag, 0)
    token.block = True
    token.map = [start_line, next_line]
    token.meta = meta
    state.line = next_line
    return token


def _callout(state, start_line, end_line, silent):
    tag, _tag_end = _tag_from(state, start_line, end_line)
    if tag is None or tag[3]:
        return False
    close = _find_close(state, start_line, end_line, "Callout")
    if close is None:
        return False
    if silent:
        return True
    _name, attrs, end_pos, _ = tag
    body = _block_text(state, start_line, close + 1)
    body = body.lstrip(" ")[end_pos:]
    body = body[: body.rfind("</Callout>")]
    inner = _dedent(body)
    tokens = state.md.parse(inner, state.env)
    _push(state, "dp_callout", "blockquote", start_line, close + 1, {"attrs": attrs, "tokens": tokens})
    return True


def _self_closing(token_type, tag_name):
    def rule(state, start_line, end_line, silent):
        tag, tag_end = _tag_from(state, start_line, end_line)
        if tag is None:
            return False
        _name, attrs, _end_pos, self_closing = tag
        next_line = tag_end + 1
        if not self_closing:
            close = _find_close(state, start_line, end_line, tag_name)
            if close is None:
                return False
            next_line = close + 1
        if silent:
            return True
        _push(state, token_type, "div", start_line, next_line, {"attrs": attrs})
        return True

    return rule


_CELL = re.compile(r"<(/?)(thead|tbody|tr|th|td)\b([^>]*)>", re.IGNORECASE)


def _table(state, start_line, end_line, silent):
    tag, _tag_end = _tag_from(state, start_line, end_line)
    if tag is None or tag[3]:
        return False
    close = _find_close(state, start_line, end_line, "Table")
    if close is None:
        return False
    if silent:
        return True
    _name, attrs, end_pos, _ = tag
    body = _block_text(state, start_line, close + 1).lstrip(" ")[end_pos:]
    body = body[: body.rfind("</Table>")]
    rows = []
    section = "tbody"
    row = None
    cell = None
    for m in _CELL.finditer(body):
        closing, name = m.group(1) == "/", m.group(2).lower()
        if name in ("thead", "tbody"):
            section = name if not closing else "tbody"
        elif name == "tr":
            if not closing:
                row = {"section": section, "cells": []}
                rows.append(row)
            else:
                row = None
        elif not closing:
            cell = {"tag": name, "start": m.end()}
        elif cell is not None and cell["tag"] == name:
            if row is None:
                row = {"section": section, "cells": []}
                rows.append(row)
            content = _dedent(body[cell["start"] : m.start()])
            row["cells"].append({"tag": name, "tokens": state.md.parse(content, state.env)})
            cell = None
    align = attrs.get("align")
    if not isinstance(align, list):
        align = []
    _push(state, "dp_table", "table", start_line, close + 1, {"attrs": attrs, "align": align, "rows": rows})
    return True


def _unescape_template(text):
    out = []
    i = 0
    while i < len(text):
        c = text[i]
        if c == "\\" and i + 1 < len(text) and text[i + 1] in "`\\$":
            out.append(text[i + 1])
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def _htmlblock(state, start_line, end_line, silent):
    close = _find_close(state, start_line, end_line, "HTMLBlock")
    if close is None:
        return False
    body = _block_text(state, start_line, close + 1).lstrip(" ")
    m = re.match(r"<HTMLBlock(\s[^>]*)?>\s*\{`", body)
    end = body.rfind("`}</HTMLBlock>")
    if not m or end < m.end():
        return False
    if silent:
        return True
    html = _unescape_template(body[m.end() : end])
    blocks = state.env.setdefault("dp_htmlblocks", [])
    blocks.append(html)
    _push(state, "dp_htmlblock", "div", start_line, close + 1, {"index": len(blocks) - 1, "html": html})
    return True


_HANDLERS = {
    "Callout": _callout,
    "Image": _self_closing("dp_image", "Image"),
    "Embed": _self_closing("dp_embed", "Embed"),
    "Table": _table,
    "HTMLBlock": _htmlblock,
}
