"""GET /_portal/htmlblock/<revision>/<n>: one HTMLBlock of a page revision, in its own document.

PLAN.md §2.6 and contract C10 §2. An `<HTMLBlock>` carries inline `<style>` (and, on the Hebrew
citation page, a whole RTL page), which the page CSP cannot allow, so the renderer emits a sandboxed
frame pointing here (DIALECT.md, HTMLBlock). This view answers with the n-th block of that revision
(`RenderResult.htmlblocks[n]`, 0-based) wrapped in `htmlblock_frame.html`, which links the portal's
stylesheet (article.css is part of the entry's CSS), and with exactly the frame policy of
`contracts/security.json` (`htmlblock_frame.csp`), which replaces the page policy.

Scripts cannot run in the frame: the CSP's own `sandbox` directive and the iframe's `sandbox`
attribute both lack `allow-scripts`, and `default-src 'none'` covers scripts. As defence in depth the
block's `<script>` elements, event-handler attributes and `javascript:` URLs are also removed here.

`<revision>` is the `PageRevision` primary key: the publish pipeline must render with
`revision=str(revision.pk)`. Anyone may read a block of a page's published revision; other revisions
(drafts in the editor's preview) are for staff only, and anything else is a 404.
"""

import json
import logging
import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles import finders
from django.core.cache import cache
from django.http import Http404, HttpResponse
from django.template.loader import render_to_string
from django.templatetags.static import static
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.decorators.http import require_safe

from devportal.markdown import render
from devportal.models import PageRevision

logger = logging.getLogger("devportal")

# contracts/security.json "htmlblock_frame" (C10 §2). Asserted verbatim by htmlblock_frame_test.
FRAME_SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox"
FRAME_CSP = (
    f"sandbox {FRAME_SANDBOX}; default-src 'none'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' https://storage.googleapis.com data:; font-src 'self'"
)

TEMPLATE = "devportal/htmlblock_frame.html"
MANIFEST = "bundles/devportal/.vite/manifest.json"
ENTRY = "src/app/main.tsx"
CACHE_SECONDS = 60 * 60
_REVISION = re.compile(r"^[0-9]+$")


# ------------------------------------------------------------------ script neutralizing


class _ScriptStripper(HTMLParser):
    """Re-serializes HTML without scripts, event handlers or `javascript:` URLs; everything else as is."""

    DROP_WITH_CONTENT = frozenset({"script", "noscript", "template", "object", "applet", "frameset"})
    DROP_TAG = frozenset({"base", "meta", "link", "iframe", "embed", "frame"})  # void, or harmless once emptied
    URL_ATTRS = frozenset(
        {"href", "src", "action", "formaction", "xlink:href", "srcset", "poster", "data", "background"}
    )

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.out = []
        self._skip = 0

    @staticmethod
    def _unsafe_url(value):
        compact = re.sub(r"[\x00-\x20]+", "", value or "").lower()
        return compact.startswith(("javascript:", "vbscript:", "data:text/html"))

    def _attrs(self, attrs):
        parts = []
        for name, value in attrs:
            lname = name.lower()
            if lname.startswith("on") or lname == "srcdoc":
                continue
            if lname in self.URL_ATTRS and self._unsafe_url(value):
                continue
            parts.append(f" {name}" if value is None else f' {name}="{escape(value, quote=True)}"')
        return "".join(parts)

    def handle_starttag(self, tag, attrs):
        if tag in self.DROP_WITH_CONTENT:
            self._skip += 1
            return
        if self._skip or tag in self.DROP_TAG:
            return
        self.out.append(f"<{tag}{self._attrs(attrs)}>")

    def handle_startendtag(self, tag, attrs):
        if self._skip or tag in self.DROP_WITH_CONTENT or tag in self.DROP_TAG:
            return
        self.out.append(f"<{tag}{self._attrs(attrs)} />")

    def handle_endtag(self, tag):
        if tag in self.DROP_WITH_CONTENT:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip or tag in self.DROP_TAG:
            return
        self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self._skip:
            self.out.append(data)

    def handle_entityref(self, name):
        if not self._skip:
            self.out.append(f"&{name};")

    def handle_charref(self, name):
        if not self._skip:
            self.out.append(f"&#{name};")

    def handle_comment(self, data):
        pass  # comments are dropped (conditional comments included)

    def handle_decl(self, decl):
        pass

    def handle_pi(self, data):
        pass

    def unknown_decl(self, data):
        pass


def neutralize_scripts(block_html):
    """Return the block's HTML without `<script>`, event handlers or script URLs (defence in depth)."""
    parser = _ScriptStripper()
    parser.feed(block_html)
    parser.close()
    return "".join(parser.out)


# ------------------------------------------------------------------ stylesheets


def frame_stylesheets():
    """URLs of the entry's CSS (which includes article.css), read from the Vite manifest.

    Empty when the bundle has not been built; the frame then shows the block with its own styles only.
    """
    candidates = [finders.find(MANIFEST)]
    if getattr(settings, "STATIC_ROOT", None):
        candidates.append(Path(settings.STATIC_ROOT) / MANIFEST)
    for candidate in filter(None, candidates):
        try:
            manifest = json.loads(Path(candidate).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        entry = manifest.get(ENTRY) or {}
        return [static(f"bundles/devportal/{css}") for css in entry.get("css", [])]
    logger.warning("htmlblock frame: no Vite manifest at %s; serving the block without article.css", MANIFEST)
    return []


# ------------------------------------------------------------------ blocks


def revision_blocks(revision):
    """The raw HTML of every HTMLBlock in a revision, in document order (cached per revision)."""
    key = f"devportal:htmlblocks:{revision.pk}:{revision.renderer_version or 'r'}"
    blocks = cache.get(key)
    if blocks is None:
        blocks = render(revision.body_md or "", revision=str(revision.pk)).htmlblocks
        cache.set(key, blocks, CACHE_SECONDS)
    return blocks


def _visible(revision, request):
    page = revision.page
    if page.deleted_at is None and page.published_revision_id == revision.pk:
        return True
    user = getattr(request, "user", None)
    return bool(user is not None and user.is_authenticated and user.is_staff)


def frame_response(block_html, *, status=200):
    """The frame document for one block, with the frame's headers."""
    html = render_to_string(
        TEMPLATE,
        {"block_html": neutralize_scripts(block_html), "stylesheets": frame_stylesheets()},
    )
    response = HttpResponse(html, content_type="text/html; charset=utf-8", status=status)
    response["Content-Security-Policy"] = FRAME_CSP
    response["X-Content-Type-Options"] = "nosniff"
    response["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response["Cache-Control"] = "private, max-age=0, must-revalidate"
    response["X-Robots-Tag"] = "noindex"
    return response


@require_safe
@xframe_options_sameorigin
def htmlblock_frame(request, revision, n):
    """`/_portal/htmlblock/<revision>/<n>`."""
    if not _REVISION.match(str(revision)):
        raise Http404("No such HTML block")
    try:
        index = int(n)
        rev = PageRevision.objects.select_related("page").get(pk=int(revision))
    except (ValueError, PageRevision.DoesNotExist) as exc:
        raise Http404("No such HTML block") from exc
    if not _visible(rev, request):
        raise Http404("No such HTML block")
    blocks = revision_blocks(rev)
    if not 0 <= index < len(blocks):
        raise Http404("No such HTML block")
    return frame_response(blocks[index])
