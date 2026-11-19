"""HTML normalization for golden comparisons. Specification: devportal/contracts/NORMALIZE.md.

`normalize(html) -> str`. Run the shared self-test with `python -m devportal.contracts.normalize`.
"""

import json
import pathlib
import re
import sys
from html import escape
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
BLOCK = {
    "address", "article", "aside", "blockquote", "body", "button", "dd", "details", "dialog", "div", "dl", "dt",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr",
    "html", "iframe", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot",
    "th", "thead", "tr", "ul",
}  # fmt: skip
PRESERVE = {"pre", "textarea"}
EDITOR_ATTRIBUTES = {"contenteditable", "draggable", "spellcheck", "translate"}
EDITOR_ATTRIBUTE_PREFIXES = ("data-pm-", "data-node-view-", "data-dp-editor-", "data-dp-src")
EDITOR_CLASS_PREFIXES = ("ProseMirror", "dp-editor-")
CASES = pathlib.Path(__file__).with_name("normalize_cases.json")

_WS_ONLY = re.compile(r"^[ \t\n\f\r]*$")


class _Node:
    __slots__ = ("attrs", "children", "parent", "tag", "text")

    def __init__(self, tag=None, attrs=None, text=None, parent=None):
        self.tag = tag
        self.attrs = attrs or []
        self.text = text
        self.children = []
        self.parent = parent


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node(tag="#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = _Node(tag=tag, attrs=attrs, parent=self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.cur = self.cur.parent

    def handle_endtag(self, tag):
        node = self.cur
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:
            self.cur = node.parent

    def handle_data(self, data):
        self.cur.children.append(_Node(text=data, parent=self.cur))


def _is_block(node):
    return node is None or (node.tag is not None and node.tag in BLOCK)


def _clean_attrs(attrs):
    out = {}
    for name, value in attrs:
        name = name.lower()
        if name in EDITOR_ATTRIBUTES or name.startswith(EDITOR_ATTRIBUTE_PREFIXES):
            continue
        value = "" if value is None else value
        if name == "class":
            tokens = sorted({t for t in value.split() if not t.startswith(EDITOR_CLASS_PREFIXES)})
            if not tokens:
                continue
            value = " ".join(tokens)
        out.setdefault(name, value)
    return sorted(out.items())


def _merge_text(children):
    merged = []
    for child in children:
        if child.tag is None and merged and merged[-1].tag is None:
            merged[-1] = _Node(text=merged[-1].text + child.text, parent=child.parent)
        else:
            merged.append(child)
    return merged


def _serialize(node, preserve):
    children = _merge_text(node.children)
    out = []
    for i, child in enumerate(children):
        if child.tag is None:
            text = child.text.replace("\r\n", "\n").replace("\r", "\n")
            if not preserve and _WS_ONLY.match(text):
                prev_ = children[i - 1] if i > 0 else None
                next_ = children[i + 1] if i + 1 < len(children) else None
                if _is_block(prev_) or _is_block(next_):
                    continue
            if preserve and i == 0 and node.tag == "pre" and text.startswith("\n"):
                text = text[1:]
            out.append(escape(text, quote=False))
            continue
        attrs = "".join(f' {k}="{escape(v, quote=True)}"' for k, v in _clean_attrs(child.attrs))
        if child.tag in VOID:
            out.append(f"<{child.tag}{attrs}>")
        else:
            inner = _serialize(child, preserve or child.tag in PRESERVE)
            out.append(f"<{child.tag}{attrs}>{inner}</{child.tag}>")
    return "".join(out)


def normalize(html):
    builder = _Builder()
    builder.feed(html)
    builder.close()
    return _serialize(builder.root, False)


def self_test():
    """Run the shared cases. Returns a list of failure messages (empty when all pass)."""
    failures = []
    for case in json.loads(CASES.read_text())["cases"]:
        got = normalize(case["input"])
        if got != case["expected"]:
            failures.append(f"{case['name']}: expected {case['expected']!r}, got {got!r}")
        if normalize(got) != got:
            failures.append(f"{case['name']}: not idempotent")
    return failures


if __name__ == "__main__":
    problems = self_test()
    for p in problems:
        sys.stderr.write(p + "\n")
    sys.stderr.write("normalize self-test: " + ("FAILED\n" if problems else "ok\n"))
    sys.exit(1 if problems else 0)
