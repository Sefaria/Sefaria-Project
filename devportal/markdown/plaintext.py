"""Plain text of rendered C4 HTML, for search.

Text of headings, paragraphs, list items, table cells, captions, callouts and inline code, one block per line, with
runs of whitespace collapsed. Code blocks, code-tab labels, callout icons, HTML-block frames and embeds are left out.
"""

import re
from html.parser import HTMLParser

_BLOCK = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "div", "table", "thead", "tbody", "tr", "th", "td",
    "figure", "figcaption", "ul", "ol", "pre", "hr", "br", "dl", "dt", "dd",
}  # fmt: skip
_SKIP = {"pre", "button", "iframe", "script", "style"}
_SKIP_CLASSES = {"dp-callout-icon"}
_WS = re.compile(r"[ \t\r\f\v ]+")
_VOID = {"br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"}


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.stack = []  # (tag, skipping)

    def _skipping(self):
        return any(s for _, s in self.stack)

    def handle_starttag(self, tag, attrs):
        if tag in _BLOCK:
            self.parts.append("\n")
        if tag in _VOID:
            return
        classes = set((dict(attrs).get("class") or "").split())
        self.stack.append((tag, tag in _SKIP or bool(classes & _SKIP_CLASSES)))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if tag in _BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skipping():
            self.parts.append(data)


def extract_text(html):
    parser = _Extractor()
    parser.feed(html)
    parser.close()
    lines = (_WS.sub(" ", line).strip() for line in "".join(parser.parts).split("\n"))
    return "\n".join(line for line in lines if line)
