"""How Django finds the portal's assets (PLAN.md §2.8, contract C1).

`{% devportal_entry %}` reads the Vite manifest (`static/bundles/devportal/.vite/manifest.json`)
and emits the entry's CSS links, its modulepreload links and its `<script type="module" nonce>`,
all as same-origin `/static/bundles/devportal/…` paths (F-10: STATIC_URL is absolute to the library
host in deployed environments, so it is not used). When DEBUG is on and DEVPORTAL_VITE_DEV_SERVER is
set, it emits the Vite dev client instead.

`{% devportal_prerendered kind key %}` includes a file the Vite build prerendered with
react-dom/server (`prerender/manifest.json` maps kind and key to a path under `prerender/`):
`"header"` with the active tab, `"endpoint"` with an operationId. A missing file gives a plain
semantic fallback and a logged warning.

Both tags read the nonce from the template context (`csp_nonce`), because portal templates are
rendered without a request (rule Q4).
"""

import json
import logging
from pathlib import Path
from threading import Lock

from django import template
from django.conf import settings
from django.utils.html import format_html, format_html_join, json_script
from django.utils.safestring import mark_safe

from devportal.security.csp import vite_dev_origin

logger = logging.getLogger("devportal")
register = template.Library()

BUNDLE_URL = "/static/bundles/devportal/"
ENTRY = "src/app/main.tsx"
MANIFEST = Path(".vite") / "manifest.json"
PRERENDER_DIR = Path("prerender")
PRERENDER_MANIFEST = PRERENDER_DIR / "manifest.json"
DATA_ISLAND_ID = "dp-data"

# The six primary links of the live header (research/site/SITE_ATLAS.md §2), for the fallback.
HEADER_LINKS = (
    ("home", "Home", "/", False),
    ("docs", "Docs", "/docs", False),
    ("reference", "API Reference", "/reference", False),
    (None, "GitHub", "https://github.com/Sefaria/Sefaria-Project", True),
    (None, "Donate", "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=HeaderDev", True),
    ("contact", "Get in Touch", "/page/contact-us", False),
)


def bundle_dir():
    """Where the Vite build lives: `<repo>/static/bundles/devportal` (the Docker image copies
    devportal-ui/dist there). DEVPORTAL_BUNDLE_DIR overrides it, for tests only."""
    override = getattr(settings, "DEVPORTAL_BUNDLE_DIR", None)
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "static" / "bundles" / "devportal"


class _JsonFileCache:
    """Reads a JSON file once; re-reads it when its mtime changes while DEBUG is on."""

    def __init__(self):
        self._lock = Lock()
        self._entries = {}

    def load(self, path):
        with self._lock:
            cached = self._entries.get(path)
            if cached is not None and not settings.DEBUG:
                return cached[1]
            try:
                mtime = path.stat().st_mtime_ns
            except OSError:
                self._entries.pop(path, None)
                return None
            if cached is not None and cached[0] == mtime:
                return cached[1]
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                logger.warning("devportal: could not read %s", path, exc_info=True)
                return None
            self._entries[path] = (mtime, data)
            return data

    def clear(self):
        with self._lock:
            self._entries.clear()


_json_files = _JsonFileCache()
_warned = set()


def _warn_once(key, message, *args):
    """Logs a missing-asset warning once per process (and again after clear_caches)."""
    if key not in _warned:
        _warned.add(key)
        logger.warning(message, *args)


def clear_caches():
    _json_files.clear()
    _warned.clear()


def _collect(manifest, key, seen):
    """The CSS files and the imported chunks of a manifest entry, following its static imports."""
    css, chunks = [], []
    for imported in manifest.get(key, {}).get("imports", []):
        if imported in seen:
            continue
        seen.add(imported)
        chunk = manifest.get(imported)
        if not chunk:
            continue
        chunks.append(chunk["file"])
        sub_css, sub_chunks = _collect(manifest, imported, seen)
        css.extend(sub_css)
        chunks.extend(sub_chunks)
    css.extend(manifest.get(key, {}).get("css", []))
    return css, chunks


def _unique(items):
    return list(dict.fromkeys(items))


def entry_tags(nonce):
    vite = vite_dev_origin()
    if vite:
        base = vite + BUNDLE_URL
        return format_html(
            '<script type="module" nonce="{}">'
            'import RefreshRuntime from "{}@react-refresh";'
            "RefreshRuntime.injectIntoGlobalHook(window);"
            "window.$RefreshReg$ = () => {{}};"
            "window.$RefreshSig$ = () => (type) => type;"
            "window.__vite_plugin_react_preamble_installed__ = true;"
            "</script>\n"
            '<script type="module" nonce="{}" src="{}@vite/client"></script>\n'
            '<script type="module" nonce="{}" src="{}{}"></script>',
            nonce,
            base,
            nonce,
            base,
            nonce,
            base,
            ENTRY,
        )

    path = bundle_dir() / MANIFEST
    manifest = _json_files.load(path)
    entry = (manifest or {}).get(ENTRY)
    if not entry:
        _warn_once(
            ("entry", path),
            "devportal: no Vite manifest entry for %s in %s; pages load without the bundle",
            ENTRY,
            path,
        )
        return mark_safe("<!-- devportal bundle not built -->")

    css, chunks = _collect(manifest, ENTRY, {ENTRY})
    links = format_html_join("\n", '<link rel="stylesheet" href="{}{}">', ((BUNDLE_URL, f) for f in _unique(css)))
    preloads = format_html_join(
        "\n", '<link rel="modulepreload" href="{}{}">', ((BUNDLE_URL, f) for f in _unique(chunks))
    )
    script = format_html('<script type="module" nonce="{}" src="{}{}"></script>', nonce, BUNDLE_URL, entry["file"])
    return mark_safe("\n".join(part for part in (links, preloads, script) if part))


def header_fallback(active_tab):
    items = format_html_join(
        "",
        '<li><a href="{}"{}{}>{}</a></li>',
        (
            (
                href,
                mark_safe(' aria-current="page"') if tab is not None and tab == active_tab else "",
                mark_safe(' target="_blank" rel="noopener noreferrer"') if new_tab else "",
                label,
            )
            for tab, label, href, new_tab in HEADER_LINKS
        ),
    )
    return format_html(
        '<header class="dp-header dp-header-fallback"><a class="dp-header-logo" href="/">Developers on Sefaria</a>'
        '<nav aria-label="Main"><ul>{}</ul></nav></header>',
        items,
    )


def prerendered_fallback(kind, key):
    if kind == "header":
        return header_fallback(key)
    if kind == "endpoint":
        return format_html('<article class="dp-endpoint dp-endpoint-fallback" data-operation-id="{}"></article>', key)
    return mark_safe("")


def prerendered_html(kind, key):
    """The prerendered file for (kind, key), or None when there is none."""
    root = bundle_dir()
    manifest = _json_files.load(root / PRERENDER_MANIFEST) or {}
    relative = (manifest.get(kind) or {}).get(str(key))
    if not relative:
        return None
    prerender_root = (root / PRERENDER_DIR).resolve()
    path = (prerender_root / relative).resolve()
    if not path.is_relative_to(prerender_root):
        logger.warning("devportal: prerender manifest points outside %s: %s", prerender_root, relative)
        return None
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


@register.simple_tag(takes_context=True)
def devportal_entry(context):
    return entry_tags(context.get("csp_nonce", ""))


@register.simple_tag
def devportal_prerendered(kind, key=None):
    key = "none" if key is None else key
    html = prerendered_html(kind, key)
    if html is None:
        _warn_once(
            ("prerendered", kind, key), "devportal: no prerendered %s for %r; using the plain fallback", kind, key
        )
        return prerendered_fallback(kind, None if key == "none" else key)
    return mark_safe(html)  # noqa: S308 - our own build output, never user input


@register.simple_tag(takes_context=True)
def devportal_data_island(context, payload):
    """The page data island: Django's json_script, plus the request's CSP nonce."""
    island = json_script(payload, DATA_ISLAND_ID)
    opening = f'<script id="{DATA_ISLAND_ID}" type="application/json">'
    if not island.startswith(opening):  # json_script's output format changed
        raise RuntimeError(f"unexpected json_script output: {island[:80]}")
    nonce = context.get("csp_nonce", "")
    return format_html(
        '<script type="application/json" id="{}" nonce="{}">{}',
        DATA_ISLAND_ID,
        nonce,
        mark_safe(island[len(opening) :]),
    )
