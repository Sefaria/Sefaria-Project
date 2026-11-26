"""Response headers of every portal response (contract C10 §1, PLAN.md §2.10, §2.12).

The `Link` header copies what live developers.sefaria.org sends (checked 2026-11-18):

- Every text response (HTML, Markdown, plain text) carries the four discovery links, with absolute
  targets on the request's host; `service-doc` points at the bare origin, with no trailing slash.
- An HTML page adds `<{md_path}>; rel="alternate"; type="text/markdown"` with a *relative* target,
  also on a 404 under a page section (live answers `/docs/api` with `</docs/api.md>`).
- A Markdown page adds `<{html_url}>; rel="canonical"`.

Views mark a response with `response.devportal_markdown_path` or `response.devportal_canonical_url`;
the middleware turns those into the header.
"""

from .csp import build_policy

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
}

CONTENT_LANGUAGE = "en"

DISCOVERY_LINKS = (
    ("/.well-known/api-catalog", "api-catalog"),
    ("", "service-doc"),
    ("/.well-known/agent-skills/index.json", "agent-skills"),
    ("/.well-known/mcp/server-card.json", "mcp-server"),
)

TEXT_CONTENT_TYPES = ("text/html", "text/markdown", "text/plain")


def request_origin(request):
    """The request's scheme and host, e.g. https://developers.sefaria.org."""
    return f"{request.scheme}://{request.get_host()}"


def link_header(origin, *, markdown_path=None, canonical_url=None):
    values = [f'<{origin}{path}>; rel="{rel}"' for path, rel in DISCOVERY_LINKS]
    if markdown_path:
        values.append(f'<{markdown_path}>; rel="alternate"; type="text/markdown"')
    if canonical_url:
        values.append(f'<{canonical_url}>; rel="canonical"')
    return ", ".join(values)


def _content_type(response):
    return (response.get("Content-Type") or "").split(";", 1)[0].strip().lower()


def apply_portal_headers(request, response, nonce, *, editor=False):
    """Adds the CSP, the security headers, Content-Language and, on text responses, the Link header.

    A response that already carries a Content-Security-Policy (the HTMLBlock frame, C10 §2) keeps it.
    """
    if "Content-Security-Policy" not in response:
        response["Content-Security-Policy"] = build_policy(nonce, editor=editor)
    for name, value in SECURITY_HEADERS.items():
        response[name] = value
    response["Content-Language"] = CONTENT_LANGUAGE
    if _content_type(response) in TEXT_CONTENT_TYPES and "Link" not in response:
        response["Link"] = link_header(
            request_origin(request),
            markdown_path=getattr(response, "devportal_markdown_path", None),
            canonical_url=getattr(response, "devportal_canonical_url", None),
        )
    return response
