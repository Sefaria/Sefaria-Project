"""The portal's Content Security Policy (contract C10 §1, devportal/contracts/security.json).

One policy for every portal response, with a fresh nonce per request. Rules that must hold:

- Never 'unsafe-inline' or 'unsafe-eval' in script-src. Every <script> carries the nonce.
- style-src is never widened. Editor responses add `style-src-attr 'unsafe-inline'` because
  ProseMirror sets inline style attributes. No public-page library needs that allowance today; if one
  ever does, add it here with a comment naming the library.
- The Vite dev-server allowances apply only when DEBUG is on and DEVPORTAL_VITE_DEV_SERVER is set.
"""

import secrets
from urllib.parse import urlsplit

from django.conf import settings

README_IMAGES_ORIGIN = "https://files.readme.io"

# (directive, sources) in the order of security.json. "{nonce}" and "{api_origin}" are filled per call.
BASE_DIRECTIVES = (
    ("default-src", ("'none'",)),
    ("base-uri", ("'none'",)),
    ("object-src", ("'none'",)),
    ("frame-ancestors", ("'none'",)),
    ("form-action", ("'self'",)),
    ("script-src", ("'self'", "'nonce-{nonce}'", "https://www.googletagmanager.com")),
    ("style-src", ("'self'",)),
    (
        "img-src",
        (
            "'self'",
            "data:",
            "https://storage.googleapis.com",
            "https://www.google-analytics.com",
            "https://www.googletagmanager.com",
        ),
    ),
    ("font-src", ("'self'",)),
    (
        "connect-src",
        (
            "'self'",
            "{api_origin}",
            "https://www.google-analytics.com",
            "https://*.google-analytics.com",
            "https://*.analytics.google.com",
            "https://www.googletagmanager.com",
        ),
    ),
    ("frame-src", ("'self'", "https://sefaria.formstack.com", "https://www.youtube-nocookie.com")),
    ("manifest-src", ("'self'",)),
)


def new_nonce():
    """A fresh base64url nonce with 128 bits of entropy."""
    return secrets.token_urlsafe(16)


def vite_dev_origin():
    """The Vite dev server's origin when its allowances apply (DEBUG and the setting), else ""."""
    if not settings.DEBUG:
        return ""
    value = (getattr(settings, "DEVPORTAL_VITE_DEV_SERVER", "") or "").strip().rstrip("/")
    if not value:
        return ""
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return ""
    return f"{parts.scheme}://{parts.netloc}"


def build_policy(nonce, *, editor=False):
    """The Content-Security-Policy header value for one response."""
    api_origin = settings.DEVPORTAL_API_ORIGIN.rstrip("/")
    directives = [
        [name, [source.format(nonce=nonce, api_origin=api_origin) for source in sources]]
        for name, sources in BASE_DIRECTIVES
    ]
    by_name = dict(directives)  # the same lists, so appends show in `directives`

    if getattr(settings, "DEVPORTAL_ALLOW_README_IMAGES", False):
        by_name["img-src"].append(README_IMAGES_ORIGIN)

    vite = vite_dev_origin()
    if vite:
        ws = "wss" + vite[len("https") :] if vite.startswith("https") else "ws" + vite[len("http") :]
        by_name["script-src"].append(vite)
        by_name["style-src"].extend([vite, "'unsafe-inline'"])  # Vite injects <style> elements in dev
        by_name["connect-src"].extend([vite, ws])
        by_name["img-src"].append(vite)
        by_name["font-src"].append(vite)

    if editor:
        # ProseMirror (the TipTap editor) sets inline style attributes. style-src stays as it is.
        directives.append(["style-src-attr", ["'unsafe-inline'"]])

    return "; ".join(" ".join([name, *sources]) for name, sources in directives)
