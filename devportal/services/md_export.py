"""The Markdown version of every portal page (PLAN.md §2.10, F-17; contract C9 route `page-markdown`).

The format copies what live developers.sefaria.org serves at `<page path>.md`:

    ---
    updatedAt: 2026-07-28T13:44:11.000Z
    agentTools:
      projectIndex: https://<host>/llms.txt
    ---

    # <title>

    <excerpt>

    <body>

- The excerpt paragraph is left out when the excerpt is empty; the body is the stored Markdown with its
  trailing newlines removed (live serves no final newline).
- In-portal links, which the import stored as root-relative paths (`/docs/…`, PLAN.md §7.2), are written
  as absolute URLs on the request's host, as live writes `doc:`/`ref:`/`page:` links (F-17). Only link
  destinations change (inline links, reference definitions, `href`/`src` attributes), never code.
- Endpoint pages: title, the description (overlay or spec), the overlay's extra Markdown, then
  `# OpenAPI definition` and the operation's spec slice in a `json` fence.
- The `ReadMeConfig` pages `authentication` and `getting-started` (hidden, kind `api_config`) end with
  the servers part of the spec, as on live.
- Hidden pages answer like any other page (I-6); a path that names no published page gets live's
  "Page not found" document with status 404.
"""

import json
import re
from datetime import UTC

from devportal.models import Page, PageKind, Section

PAGE_MD_PATH = re.compile(r"^/(?P<section>docs|reference|page)/(?P<slug>[^/]+)\.md$")
OPENAPI_HEADING = "# OpenAPI definition"
API_CONFIG_WITH_SPEC = ("authentication", "getting-started")
API_CONFIG_INTRO = (
    "This is the part of the API\N{RIGHT SINGLE QUOTATION MARK}s OpenAPI definition that covers servers "
    "and authentication. Each endpoint page has its own operation."
)
API_CONFIG_SPEC_KEYS = ("openapi", "info", "servers", "security")
NOT_FOUND_TEXT = (
    "Page not found. The full index is at {origin}/llms.txt. Use the agentTools in the front matter above "
    "to search the docs or browse the index."
)


# --- front matter -------------------------------------------------------------------------------


def iso_millis(value):
    """`2026-07-28T13:44:11.000Z`, the timestamp format of live's front matter and sitemap."""
    value = value.astimezone(UTC)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def front_matter(origin, updated_at=None):
    lines = ["---"]
    if updated_at is not None:
        lines.append(f"updatedAt: {iso_millis(updated_at)}")
    lines += ["agentTools:", f"  projectIndex: {origin}/llms.txt", "---"]
    return "\n".join(lines) + "\n"


# --- links --------------------------------------------------------------------------------------

_INLINE = re.compile(r"\]\(\s*(<[^>\n]*>|[^\s)]+)")
_REFDEF = re.compile(r"^( {0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)", re.MULTILINE)
_ATTR = re.compile(r"""(\b(?:href|src)\s*=\s*)(["'])(.*?)\2""", re.IGNORECASE)
_CODE_SPAN = re.compile(r"(`+)(?:.|\n)*?(?<!`)\1(?!`)")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def absolute_url(dest, origin):
    """A root-relative destination (`/docs/x`) on `origin`; anything else unchanged."""
    if dest.startswith("/") and not dest.startswith("//"):
        return origin + dest
    return dest


def _code_lines(source):
    """Indexes of the lines the renderer treats as code (fences and indented code blocks)."""
    try:
        from devportal.markdown.links import _code_line_ranges  # noqa: PLC0415 - optional (C4)
    except ImportError:
        _code_line_ranges = None
    lines = source.splitlines(keepends=True)
    code = set()
    if _code_line_ranges is not None:
        for start, end in _code_line_ranges(source):
            code.update(range(start, min(end, len(lines))))
        return lines, code
    fence = None
    for i, line in enumerate(lines):
        m = _FENCE.match(line)
        if fence is None and m:
            fence = m.group(1)
            code.add(i)
        elif fence is not None:
            code.add(i)
            if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence):
                fence = None
    return lines, code


def _rewrite_segment(text, origin):
    def sub(dest):
        inner = dest[1:-1] if dest.startswith("<") and dest.endswith(">") else dest
        new = absolute_url(inner, origin)
        if new == inner:
            return dest
        return f"<{new}>" if dest.startswith("<") else new

    text = _INLINE.sub(lambda m: m.group(0)[: m.start(1) - m.start(0)] + sub(m.group(1)), text)
    text = _REFDEF.sub(lambda m: m.group(1) + sub(m.group(2)), text)
    return _ATTR.sub(lambda m: m.group(1) + m.group(2) + sub(m.group(3)) + m.group(2), text)


def _rewrite_prose(text, origin):
    out, pos = [], 0
    for m in _CODE_SPAN.finditer(text):
        out.append(_rewrite_segment(text[pos : m.start()], origin))
        out.append(m.group(0))
        pos = m.end()
    out.append(_rewrite_segment(text[pos:], origin))
    return "".join(out)


def absolutize_links(source, origin):
    """Write every root-relative link destination of `source` as an absolute URL on `origin`."""
    if not source:
        return source
    lines, code = _code_lines(source)
    out, chunk = [], []
    for i, line in enumerate(lines):
        if i in code:
            if chunk:
                out.append(_rewrite_prose("".join(chunk), origin))
                chunk = []
            out.append(line)
        else:
            chunk.append(line)
    if chunk:
        out.append(_rewrite_prose("".join(chunk), origin))
    return "".join(out)


# --- documents ----------------------------------------------------------------------------------


def _document(origin, updated_at, title, parts):
    text = front_matter(origin, updated_at) + f"\n# {title}\n\n"
    for part in parts:
        if part:
            text += part + "\n\n"
    return text


def _fenced_json(text):
    return f"```json\n{text}\n```"


def _spec():
    from devportal.spec import load_spec  # noqa: PLC0415

    return load_spec()


def updated_at_of(page):
    stamps = [s for s in (page.content_updated_at, page.spec_updated_at) if s is not None]
    return max(stamps) if stamps else None


def endpoint_markdown(page, origin):
    """An endpoint page: title, description, overlay Markdown, then the spec slice. None if the
    operation left the spec."""
    from devportal.spec import Overlay, merge  # noqa: PLC0415

    spec = _spec()
    operation = spec.operation(page.operation_id or page.slug)
    if operation is None:
        return None
    merged = merge(operation, Overlay.from_revision(page.published_revision))
    head = _document(
        origin,
        updated_at_of(page),
        merged.title,
        [absolutize_links(merged.description_md, origin), absolutize_links(merged.body_md.rstrip("\n"), origin)],
    )
    return head + OPENAPI_HEADING + "\n\n" + _fenced_json(spec.slice_json(operation.operation_id))


def api_config_markdown(page, origin):
    revision = page.published_revision
    text = _document(origin, updated_at_of(page), revision.title, [revision.excerpt, revision.body_md.rstrip("\n")])
    if revision.api_config not in API_CONFIG_WITH_SPEC:
        return text
    document = _spec().document
    part = {key: document[key] for key in API_CONFIG_SPEC_KEYS if key in document}
    schemes = (document.get("components") or {}).get("securitySchemes")
    if schemes:
        part["components"] = {"securitySchemes": schemes}
    dumped = json.dumps(part, indent=2, ensure_ascii=False)
    return text + OPENAPI_HEADING + "\n\n" + API_CONFIG_INTRO + "\n\n" + _fenced_json(dumped)


def page_markdown(page, origin):
    """The Markdown document of a published page, or None when it has none (a category, no revision)."""
    revision = page.published_revision
    if revision is None or page.deleted_at is not None or page.kind == PageKind.CATEGORY:
        return None
    if page.kind == PageKind.ENDPOINT:
        return endpoint_markdown(page, origin)
    if page.kind == PageKind.API_CONFIG:
        return api_config_markdown(page, origin)
    body = absolutize_links(revision.body_md.rstrip("\n"), origin)
    text = _document(origin, updated_at_of(page), revision.title, [revision.excerpt])
    return text + body if body else text


def not_found_markdown(origin):
    return front_matter(origin) + "\n" + NOT_FOUND_TEXT.format(origin=origin) + "\n"


def find_page(section, slug):
    """The published, not deleted page at `/<section>/<slug>`, hidden or not (I-6), or None."""
    if section not in Section.values:
        return None
    return (
        Page.objects.filter(section=section, slug=slug, deleted_at__isnull=True, published_revision__isnull=False)
        .exclude(kind=PageKind.CATEGORY)
        .select_related("published_revision")
        .first()
    )


def markdown_for_path(path, origin):
    """`(status, text, canonical_path)` for a page path without `.md` (`/docs/welcome`)."""
    m = re.match(r"^/(?P<section>docs|reference|page)/(?P<slug>[^/]+)/?$", path)
    page = find_page(m["section"], m["slug"]) if m else None
    text = page_markdown(page, origin) if page is not None else None
    if text is None:
        return 404, not_found_markdown(origin), None
    return 200, text, page.url_path
