"""The sanitizer: nh3 with the PLAN §2.6 allow-list, plus two fix-ups nh3 cannot express.

- Tags: those the renderer emits plus a short list of inline/raw tags used in the corpus. Everything else is removed
  (its text kept), and `script`, `style`, `noscript`, `template`, `textarea`, `title`, `xmp`, `object`, `embed`,
  `form`, `select` are removed with their content.
- `class` keeps only `dp-` tokens. No `style`, no event handlers, no `id` except on headings.
- `href`/`src` allow `http`, `https`, `mailto` and relative URLs.
- `iframe` survives only when its `src` starts with `https://sefaria.formstack.com/` or
  `https://www.youtube-nocookie.com/`, or is the renderer's own HTML-block frame `/_portal/htmlblock/<rev>/<n>`.
  An iframe whose `src` was refused is removed entirely. Author-supplied `sandbox` is always dropped; the HTML-block
  frame always gets the fixed sandbox value below.
"""

import re
from html import escape
from html.parser import HTMLParser

import nh3

HTMLBLOCK_SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox"
IFRAME_PREFIXES = ("https://sefaria.formstack.com/", "https://www.youtube-nocookie.com/")
HTMLBLOCK_SRC = re.compile(r"^/_portal/htmlblock/[A-Za-z0-9_-]+/\d+$")

RENDERER_TAGS = {
    "a", "blockquote", "br", "button", "code", "del", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4",
    "h5", "h6", "hr", "iframe", "img", "li", "ol", "p", "pre", "s", "span", "strong", "table", "tbody", "td", "th",
    "thead", "tr", "ul",
}  # fmt: skip
RAW_TAGS = {"b", "i", "u", "small", "sub", "sup", "kbd", "mark", "ins", "dl", "dt", "dd", "abbr", "cite", "q"}
ALLOWED_TAGS = RENDERER_TAGS | RAW_TAGS
CLEAN_CONTENT_TAGS = {
    "script", "style", "noscript", "template", "textarea", "title", "xmp", "object", "embed", "form", "select",
    "noembed", "noframes", "plaintext", "math", "svg",
}  # fmt: skip

ALLOWED_ATTRIBUTES = {
    "*": {"class", "dir"},
    "a": {"href", "title", "aria-label"},
    "img": {"src", "alt", "title", "width", "height", "loading"},
    "span": {"role", "tabindex", "aria-label", "aria-hidden"},
    "ol": {"start"},
    "th": {"colspan", "rowspan"},
    "td": {"colspan", "rowspan"},
    "code": {"data-lang"},
    "button": {"type", "value"},
    "iframe": {"src", "width", "height", "title", "allow", "allowfullscreen", "loading"},
    **{f"h{n}": {"id"} for n in range(1, 7)},
}
URL_SCHEMES = {"http", "https", "mailto"}

_CLASS_TOKEN = re.compile(r"^dp-[A-Za-z0-9_-]+$")
_DIMENSION = re.compile(r"^\d+(\.\d+)?(px|%)?$")
_IFRAME_ALLOW = {"autoplay", "fullscreen", "encrypted-media", "picture-in-picture", "clipboard-write"}


def _attribute_filter(tag, attr, value):  # noqa: PLR0911, C901
    if attr == "class":
        tokens = [t for t in value.split() if _CLASS_TOKEN.match(t)]
        return " ".join(tokens) or None
    if attr == "dir":
        return value if value in ("auto", "ltr", "rtl") else None
    if attr == "tabindex":
        return value if value in ("0", "-1") else None
    if attr == "role":
        return value if value == "button" else None
    if attr == "aria-hidden":
        return value if value in ("true", "false") else None
    if attr == "loading":
        return value if value in ("lazy", "eager") else None
    if attr == "type":
        return "button"
    if attr in ("width", "height"):
        return value if _DIMENSION.match(value.strip()) else None
    if attr in ("start", "colspan", "rowspan"):
        return value if value.isdigit() else None
    if tag == "iframe" and attr == "src":
        ok = value.startswith(IFRAME_PREFIXES) or HTMLBLOCK_SRC.match(value)
        return value if ok else None
    if tag == "iframe" and attr == "allow":
        tokens = [t.strip() for t in value.split(";") if t.strip() in _IFRAME_ALLOW]
        return "; ".join(tokens) or None
    if tag == "iframe" and attr == "allowfullscreen":
        return ""
    return value


class _IframeFixer(HTMLParser):
    """Re-emit nh3's output unchanged except: drop iframes without `src`, add the fixed sandbox to HTML-block frames."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.out = []
        self.skip = 0

    def _emit(self, text):
        if not self.skip:
            self.out.append(text)

    def handle_starttag(self, tag, attrs):
        if tag == "iframe":
            src = dict(attrs).get("src")
            if not src:
                self.skip += 1
                return
            if HTMLBLOCK_SRC.match(src):
                attrs = [(k, v) for k, v in attrs if k != "sandbox"] + [("sandbox", HTMLBLOCK_SANDBOX)]
            rendered = "".join(f' {k}="{escape(v or "", quote=True)}"' for k, v in attrs)
            self._emit(f"<iframe{rendered}>")
            return
        self._emit(self.get_starttag_text())

    def handle_startendtag(self, tag, attrs):
        self._emit(self.get_starttag_text())

    def handle_endtag(self, tag):
        if tag == "iframe" and self.skip:
            self.skip -= 1
            return
        self._emit(f"</{tag}>")

    def handle_data(self, data):
        self._emit(data)

    def handle_entityref(self, name):
        self._emit(f"&{name};")

    def handle_charref(self, name):
        self._emit(f"&#{name};")

    def handle_comment(self, data):
        self._emit(f"<!--{data}-->")


def sanitize(html):
    cleaned = nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        clean_content_tags=CLEAN_CONTENT_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        attribute_filter=_attribute_filter,
        url_schemes=URL_SCHEMES,
        link_rel=None,
        strip_comments=True,
    )
    if "<iframe" not in cleaned:
        return cleaned
    fixer = _IframeFixer()
    fixer.feed(cleaned)
    fixer.close()
    return "".join(fixer.out)
