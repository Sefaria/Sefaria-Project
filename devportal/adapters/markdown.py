"""The one place the content pipeline reaches the Markdown renderer (`devportal.markdown`, W5).

DEPENDENCY: `devportal.markdown` (W5, contract C4) is written in parallel with the import and the
publish pipeline. This adapter codes against its interface:

    from devportal.markdown import render
    result = render(source, revision="<n>")      # result.html, result.toc, result.text
    from devportal.markdown import rewrite_markdown_links
    new_source, changes = rewrite_markdown_links(source)

When the package is not importable (it is not on this branch yet) the adapter falls back to:

- for `render`: a trivial escaping renderer, good only for tests. Its output is stamped
  `renderer_version = "fallback-escape-1"`, and `devportal_rebuild` (and the seeding hook)
  re-render every revision whose stamp differs from the current renderer's, so nothing rendered by
  the fallback survives the real renderer landing.
- for `rewrite_markdown_links` and `link_destinations`: the rules of PLAN.md §7.2 step 3,
  implemented here (link destinations only; never code, link text, autolinks or bare URLs).

Pure Python: no Django import.
"""

import hashlib
import html
import importlib
import re
from dataclasses import dataclass, field

FALLBACK_RENDERER_VERSION = "fallback-escape-1"


def _markdown_module():
    try:
        return importlib.import_module("devportal.markdown")
    except ImportError:
        return None


def renderer_available():
    """True when the real renderer (`devportal.markdown`) is importable."""
    module = _markdown_module()
    return module is not None and hasattr(module, "render")


def renderer_version():
    """A stamp stored on each rendered revision; a change means cached HTML is stale."""
    module = _markdown_module()
    if module is None or not hasattr(module, "render"):
        return FALLBACK_RENDERER_VERSION
    version = getattr(module, "RENDERER_VERSION", None) or getattr(module, "__version__", None)
    if version:
        return str(version)
    # No explicit version: derive one from the package's source, so any change re-renders.
    digest = hashlib.sha256()
    try:
        from pathlib import Path

        for path in sorted(Path(module.__file__).parent.glob("*.py")):
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    except (OSError, TypeError):
        return "markdown-unknown"
    return "markdown-" + digest.hexdigest()[:16]


@dataclass
class Rendered:
    html: str
    toc: list = field(default_factory=list)
    text: str = ""


def _fallback_render(source):
    """Escape everything; one <p> per blank-line separated block. Tests only."""
    blocks = [b for b in re.split(r"\n\s*\n", source or "") if b.strip()]
    out = "".join(f"<p>{html.escape(b.strip())}</p>" for b in blocks)
    text = "\n\n".join(b.strip() for b in blocks)
    return Rendered(html=out, toc=[], text=text)


def render(source, *, revision="0"):
    """Render a page body. Returns an object with `html`, `toc` and `text`."""
    module = _markdown_module()
    if module is not None and hasattr(module, "render"):
        result = module.render(source or "", revision=str(revision))
        return Rendered(html=result.html, toc=list(result.toc or []), text=result.text or "")
    return _fallback_render(source)


# --- Link rewriting (PLAN.md §7.2 step 3) ------------------------------------------------------

_PREFIXES = (("doc:", "/docs/"), ("ref:", "/reference/"), ("page:", "/page/"))
_DEV_HOST = re.compile(r"^https?://developers\.sefaria\.org(?=/|$|\?|#)", re.IGNORECASE)
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
_INLINE = re.compile(r"\]\(\s*(<[^>\n]*>|[^\s)]+)")
_REFDEF = re.compile(r"^( {0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)", re.MULTILINE)
_ATTR = re.compile(r"""(\bhref\s*=\s*\{?\s*)(["'])(.*?)\2""", re.IGNORECASE)
_CODE_SPAN = re.compile(r"(`+)(?:.|\n)*?(?<!`)\1(?!`)")


def rewrite_link(url):
    """Map one destination: doc:/ref:/page: and absolute developers.sefaria.org URLs to paths."""
    if url is None:
        return url
    stripped = url.strip()
    for prefix, target in _PREFIXES:
        if stripped.startswith(prefix):
            rest = stripped[len(prefix) :]
            if rest and not rest.startswith(" ") and "/" not in rest.split("#", 1)[0]:
                return target + rest
            return url
    m = _DEV_HOST.match(stripped)
    if m:
        rest = stripped[m.end() :]
        return rest if rest.startswith("/") else "/" + rest
    return url


def _split_code(source):
    """Yield `(is_code, chunk)` pieces: fenced code blocks are code, everything else prose."""
    lines = source.splitlines(keepends=True)
    fence = None
    chunk = []
    is_code = False
    for line in lines:
        m = _FENCE.match(line)
        if fence is None and m:
            if chunk:
                yield is_code, "".join(chunk)
            chunk, is_code, fence = [line], True, m.group(1)
            continue
        chunk.append(line)
        if fence is not None and m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence):
            yield True, "".join(chunk)
            chunk, is_code, fence = [], False, None
    if chunk:
        yield is_code, "".join(chunk)


def _prose_pieces(text):
    """Yield `(is_code_span, piece)` for a prose chunk."""
    pos = 0
    for m in _CODE_SPAN.finditer(text):
        yield False, text[pos : m.start()]
        yield True, m.group(0)
        pos = m.end()
    yield False, text[pos:]


def _fallback_rewrite(source):
    changes = []

    def sub_dest(dest):
        inner = dest[1:-1] if dest.startswith("<") and dest.endswith(">") else dest
        new = rewrite_link(inner)
        if new != inner:
            changes.append((inner, new))
            return f"<{new}>" if dest.startswith("<") else new
        return dest

    def rewrite_segment(text):
        text = _INLINE.sub(lambda m: m.group(0)[: m.start(1) - m.start(0)] + sub_dest(m.group(1)), text)
        text = _REFDEF.sub(lambda m: m.group(1) + sub_dest(m.group(2)), text)
        return _ATTR.sub(lambda m: m.group(1) + m.group(2) + sub_dest(m.group(3)) + m.group(2), text)

    out = []
    for is_code, chunk in _split_code(source):
        if is_code:
            out.append(chunk)
            continue
        for is_span, piece in _prose_pieces(chunk):
            out.append(piece if is_span else rewrite_segment(piece))
    return "".join(out), changes


def rewrite_markdown_links(source):
    """Return `(new_source, changes)`; `changes` lists `(old, new)` per rewritten destination."""
    module = _markdown_module()
    if module is not None and hasattr(module, "rewrite_markdown_links"):
        new, changes = module.rewrite_markdown_links(source)
        return new, list(changes)
    return _fallback_rewrite(source)


def link_destinations(source):
    """Every link destination in Markdown prose (inline links, reference definitions, `href`)."""
    found = []
    for is_code, chunk in _split_code(source or ""):
        if is_code:
            continue
        for is_span, piece in _prose_pieces(chunk):
            if is_span:
                continue
            for m in _INLINE.finditer(piece):
                start = m.start(0)
                # `![alt](src)` is an image, not a link.
                bracket = piece.rfind("[", 0, start + 1)
                if bracket > 0 and piece[bracket - 1] == "!":
                    continue
                found.append(_unwrap(m.group(1)))
            found.extend(_unwrap(m.group(2)) for m in _REFDEF.finditer(piece))
            found.extend(m.group(3) for m in _ATTR.finditer(piece))
    return found


def _unwrap(dest):
    return dest[1:-1] if dest.startswith("<") and dest.endswith(">") else dest


_IMG_TAG = re.compile(r"<(?:img|Image)\b[^>]*?\bsrc\s*=\s*\{?\s*([\"'])(.*?)\1", re.IGNORECASE | re.DOTALL)
_MD_IMAGE = re.compile(r"!\[[^\]\n]*\]\(\s*(<[^>\n]*>|[^\s)]+)")


def image_sources(source):
    """Every image URL in Markdown prose: `![..](url)`, `<img src>` and `<Image src>`."""
    found = []
    for is_code, chunk in _split_code(source or ""):
        if is_code:
            continue
        found.extend(_unwrap(m.group(1)) for m in _MD_IMAGE.finditer(chunk))
        found.extend(m.group(2) for m in _IMG_TAG.finditer(chunk))
    return found
