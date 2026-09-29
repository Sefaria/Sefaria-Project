"""
gem: a standalone Talmud learning tool served at the site root.

The page is a single self-contained template (it does not extend base.html and is not
rendered by the node SSR server).  All data comes from the public Sefaria APIs on the
same origin, so the view itself touches no database and is safe to cache.
"""
import hashlib
import json
import os
from functools import lru_cache

from django.conf import settings
from django.contrib.staticfiles import finders
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.templatetags.static import static

GEM_STATIC_DIR = "gem"


@lru_cache(maxsize=1)
def _asset_manifest():
    """
    Returns (version, {static_path: hashed_url}) for every file under static/gem.

    Each ES module import is remapped through an import map to a URL carrying a content
    hash, so a new deploy never mixes freshly fetched and stale browser-cached modules.
    """
    root = finders.find(GEM_STATIC_DIR)
    if isinstance(root, list):
        root = root[0] if root else None
    files = {}
    digest = hashlib.sha1()
    if root and os.path.isdir(root):
        for dirpath, _, filenames in os.walk(root):
            for filename in sorted(filenames):
                if not filename.endswith((".js", ".css")):
                    continue
                full_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(full_path, root).replace(os.sep, "/")
                with open(full_path, "rb") as f:
                    content = f.read()
                file_hash = hashlib.sha1(content).hexdigest()[:10]
                digest.update(rel_path.encode("utf-8"))
                digest.update(content)
                url = static(f"{GEM_STATIC_DIR}/{rel_path}")
                files[rel_path] = f"{url}?v={file_hash}"
    return digest.hexdigest()[:10], files


def gem_home(request, tref=None):
    """
    Renders the gem Talmud reader.  `tref` (e.g. "Berakhot.2a.5") is an optional deep link;
    the client also understands ?ref=.  With neither, the client resumes the reader's last
    position (or opens Berakhot 2a).
    """
    if settings.DEBUG:
        _asset_manifest.cache_clear()
    version, files = _asset_manifest()
    import_map = {
        "imports": {
            static(f"{GEM_STATIC_DIR}/{path}"): url
            for path, url in files.items() if path.endswith(".js")
        }
    }
    config = {
        "apiBase": getattr(settings, "GEM_API_BASE", ""),
        "sefariaBase": getattr(settings, "GEM_SEFARIA_BASE", "https://www.sefaria.org"),
        "initialRef": tref or request.GET.get("ref") or None,
        "staticBase": static(f"{GEM_STATIC_DIR}/"),
        "version": version,
    }
    context = {
        "version": version,
        "css_url": files.get("gem.css", static(f"{GEM_STATIC_DIR}/gem.css")),
        "main_url": files.get("js/main.js", static(f"{GEM_STATIC_DIR}/js/main.js")),
        "import_map_json": json.dumps(import_map),
        "config": config,
    }
    html = render_to_string("gem/index.html", context)
    response = HttpResponse(html, content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "public, max-age=60"
    return response
