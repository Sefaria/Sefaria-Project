"""
Allowlist for sheet media URLs. Pure functions (no database), shared by the save-time cleaner in
sefaria/sheets.py, the render-time cleaner and the markup scan. The client mirrors this list in
static/js/sheetsSanitize.js (parseMediaUrl); keep the two in step.
"""

import re
import urllib.parse

# Media URLs are interpolated into embed and image markup by the sheet UI. They must be https (http and
# protocol-relative URLs, which older sheets may hold, are upgraded to https first). A URL is kept when it
# points at a known embed host with an embeddable path, or at an image or mp3 file on any host.
_SHEET_EMBED_PATH_PREFIXES = {
    "www.youtube.com": ("/embed/",),
    "youtube.com": ("/embed/",),
    "player.vimeo.com": ("/video/",),
    "w.soundcloud.com": ("/player/",),
    "open.spotify.com": ("/embed/",),
    "bandcamp.com": ("/EmbeddedPlayer",),
}
_SHEET_FILE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3")
_SHEET_MEDIA_FORBIDDEN_CHARS_RE = re.compile(r"[\s\"'<>`\\]")


def _normalize_media_url(url):
    if isinstance(url, str):
        if url.startswith("//"):
            return "https:" + url
        if url[:7].lower() == "http://":
            return "https://" + url[7:]
    return url


def is_safe_media_url(url):
    if not isinstance(url, str) or not url or _SHEET_MEDIA_FORBIDDEN_CHARS_RE.search(url):
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.hostname or "").lower()
    except ValueError:
        return False
    if parsed.scheme != "https" or not host or parsed.username is not None or parsed.password is not None:
        return False
    if host in _SHEET_EMBED_PATH_PREFIXES:
        return parsed.path.startswith(_SHEET_EMBED_PATH_PREFIXES[host])
    return parsed.path.lower().endswith(_SHEET_FILE_EXTENSIONS)
