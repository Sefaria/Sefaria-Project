"""The `llms` files (PLAN.md §2.10, contract C9 routes `llms`, `docs-llms`, `reference-llms`, `llms-full`).

`/llms.txt`, `/docs/llms.txt` and `/reference/llms.txt` copy live's format
(`docs/dev-portal/research/site/machine/{llms.txt,wk_docs_llms.txt,wk_reference_llms.txt}`):

    # Sefaria Documentation

    > <project description>

    [This file lists one part of the documentation. The full index is at <origin>/llms.txt.]

    ## Docs: <category>
    - [<title>](<origin>/docs/<slug>.md): <excerpt>
      - [<child>](…)

    ## API Reference: <category>
    - <tag group>
      - [<endpoint>](<origin>/reference/<slug>.md): <description>

    ## Pages
    - [<title>](<origin>/page/<slug>.md)

Only visible pages are listed (I-6: hidden, unpublished and deleted pages, and their subtrees, are left
out), and link pages are left out, as on live. A tag group is a bullet without a link. Excerpts are
flattened to one line and cut at a word boundary to at most 200 characters, with "…" appended.

`/llms-full.txt` is new: the same entries in the same order, each followed by its whole Markdown
document (devportal.services.md_export) without the front matter.

The artifacts are stored with the placeholder origin `ORIGIN` (the sitemap's); the views substitute the
request's origin.
"""

from devportal.models import Page, PageKind, Section
from devportal.services import md_export
from devportal.services.nav import SITEMAP_ORIGIN, is_visible, page_title
from devportal.services.publish import register_artifact_builder

ORIGIN = SITEMAP_ORIGIN
PROJECT_TITLE = "Sefaria Documentation"
PROJECT_DESCRIPTION = (
    "Expand Digital Torah! Leverage the largest open-source database of Jewish texts in history to build apps "
    "and services for the People of the Book."
)
SCOPED_NOTE = "This file lists one part of the documentation. The full index is at {origin}/llms.txt."
FULL_NOTE = (
    "This file holds the full Markdown of every page listed in {origin}/llms.txt, in the same order. "
    "Each page is also available on its own at the URL given after its title."
)
SECTION_LABELS = {Section.DOCS: "Docs", Section.REFERENCE: "API Reference"}
PAGES_HEADING = "Pages"
EXCERPT_LIMIT = 200
ELLIPSIS = "\N{HORIZONTAL ELLIPSIS}"

ARTIFACTS = {
    "all": "llms.txt",
    Section.DOCS: "llms-docs.txt",
    Section.REFERENCE: "llms-reference.txt",
    "full": "llms-full.txt",
}
CONTENT_TYPE = "text/plain; charset=utf-8"


# --- tree ---------------------------------------------------------------------------------------


def _children(section):
    pages = (
        Page.objects.filter(section=section, deleted_at__isnull=True)
        .select_related("published_revision")
        .order_by("position", "id")
    )
    children = {}
    for page in pages:
        children.setdefault(page.parent_id, []).append(page)
    return children


def _listed(page):
    return is_visible(page) and page.kind not in (PageKind.LINK, PageKind.API_CONFIG, PageKind.CATEGORY)


def _walk(children, parent_id, depth):
    """Yield `(depth, page)` for the listed pages under `parent_id`, in sidebar order."""
    for page in children.get(parent_id, []):
        if not _listed(page):
            continue
        yield depth, page
        yield from _walk(children, page.pk, depth + 1)


def sections(section):
    """`[(heading, [(depth, page), ...]), ...]` for one section, in sidebar order."""
    children = _children(section)
    if section == Section.PAGE:
        entries = list(_walk(children, None, 0))
        return [(PAGES_HEADING, entries)] if entries else []
    out = []
    for root in children.get(None, []):
        if root.kind != PageKind.CATEGORY or not is_visible(root):
            continue
        entries = list(_walk(children, root.pk, 0))
        if entries:
            out.append((f"{SECTION_LABELS[section]}: {root.published_revision.title or root.slug}", entries))
    return out


# --- entries ------------------------------------------------------------------------------------


def one_line(text):
    """Newlines become spaces (so a blank line leaves two), surrounding whitespace is dropped."""
    return (text or "").replace("\r\n", "\n").replace("\n", " ").strip()


def truncate(text, limit=EXCERPT_LIMIT):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > 0:
        cut = cut[:space]
    return cut.rstrip() + ELLIPSIS


def excerpt_of(page):
    if page.kind == PageKind.TAG_GROUP:
        return ""
    if page.kind == PageKind.ENDPOINT:
        merged = _merged(page)
        return merged.description_md if merged is not None else ""
    return page.published_revision.excerpt or ""


def _merged(page):
    from devportal.spec import Overlay, load_spec, merge  # noqa: PLC0415

    operation = load_spec().operation(page.operation_id or page.slug)
    if operation is None:
        return None
    return merge(operation, Overlay.from_revision(page.published_revision))


def markdown_url(page, origin):
    """The page's `.md` URL. The slug is written unencoded, as live writes it (the Hebrew page)."""
    return f"{origin}/{page.section}/{page.slug}.md"


def entry_line(depth, page, origin):
    indent = "  " * depth
    title = page_title(page)
    if page.kind == PageKind.TAG_GROUP:
        return f"{indent}- {title}"
    line = f"{indent}- [{title}]({markdown_url(page, origin)})"
    excerpt = truncate(one_line(excerpt_of(page)))
    return f"{line}: {excerpt}" if excerpt else line


# --- files --------------------------------------------------------------------------------------


def _header(origin, note=None):
    text = f"# {PROJECT_TITLE}\n\n> {PROJECT_DESCRIPTION}\n\n"
    if note:
        text += note.format(origin=origin) + "\n\n"
    return text


def build_index(scope="all", origin=ORIGIN):
    """One of the three index files. `scope` is "all", `Section.DOCS` or `Section.REFERENCE`."""
    if scope == "all":
        parts = sections(Section.DOCS) + sections(Section.REFERENCE) + sections(Section.PAGE)
        text = _header(origin)
    else:
        parts = sections(scope)
        text = _header(origin, SCOPED_NOTE)
    blocks = []
    for heading, entries in parts:
        lines = [f"## {heading}"] + [entry_line(depth, page, origin) for depth, page in entries]
        blocks.append("\n".join(lines) + "\n")
    return text + "\n".join(blocks)


def _without_front_matter(document):
    if document.startswith("---\n"):
        end = document.find("\n---\n", 4)
        if end != -1:
            return document[end + len("\n---\n") :].lstrip("\n")
    return document


def build_full(origin=ORIGIN):
    """`/llms-full.txt`: every listed page's Markdown, in the order of `/llms.txt`."""
    parts = sections(Section.DOCS) + sections(Section.REFERENCE) + sections(Section.PAGE)
    text = _header(origin, FULL_NOTE)
    blocks = []
    for heading, entries in parts:
        pieces = [f"## {heading}"]
        for _depth, page in entries:
            if page.kind == PageKind.TAG_GROUP:
                continue
            document = md_export.page_markdown(page, origin)
            if document is None:
                continue
            body = _without_front_matter(document).rstrip("\n")
            title_line, _, rest = body.partition("\n")
            pieces.append(f"{title_line}\nSource: {markdown_url(page, origin)}\n{rest}".rstrip("\n"))
        blocks.append("\n\n".join(pieces) + "\n")
    return text + "\n".join(blocks)


def with_origin(content, origin):
    return content.replace(ORIGIN, origin)


@register_artifact_builder(ARTIFACTS["all"], content_type=CONTENT_TYPE)
def _llms(_context):
    return build_index("all")


@register_artifact_builder(ARTIFACTS[Section.DOCS], content_type=CONTENT_TYPE)
def _llms_docs(_context):
    return build_index(Section.DOCS)


@register_artifact_builder(ARTIFACTS[Section.REFERENCE], content_type=CONTENT_TYPE)
def _llms_reference(_context):
    return build_index(Section.REFERENCE)


@register_artifact_builder(ARTIFACTS["full"], content_type=CONTENT_TYPE)
def _llms_full(_context):
    return build_full()


BUILDERS = {
    ARTIFACTS["all"]: lambda: build_index("all"),
    ARTIFACTS[Section.DOCS]: lambda: build_index(Section.DOCS),
    ARTIFACTS[Section.REFERENCE]: lambda: build_index(Section.REFERENCE),
    ARTIFACTS["full"]: build_full,
}
