"""The thin Django glue for ``/mcp``. Not wired into any URLconf here.

It translates a Django request into ``McpServer.handle_http`` and back. It is ``csrf_exempt`` (the only
such view in the app, PLAN §2.3.5) and never reads ``request.user``, ``request.session`` or cookies, so
the response is the same with or without a staff session (S-7). Django is imported lazily so that
``devportal.mcp`` stays importable without settings.
"""

from __future__ import annotations

from devportal.mcp.server import MAX_REQUEST_BYTES, McpServer

_server: McpServer | None = None


def get_server() -> McpServer:
    global _server  # noqa: PLW0603 - one server per process, built on first use
    if _server is None:
        from django.conf import settings  # noqa: PLC0415
        from django.core.cache import cache  # noqa: PLC0415

        from devportal.mcp.execute import DEFAULT_API_ORIGIN  # noqa: PLC0415
        from devportal.mcp.ratelimit import FixedWindowRateLimiter  # noqa: PLC0415

        _server = McpServer(
            ratelimiter=FixedWindowRateLimiter(cache),
            api_origin=getattr(settings, "DEVPORTAL_API_ORIGIN", DEFAULT_API_ORIGIN),
        )
    return _server


def client_ip(request) -> str | None:
    return request.META.get("REMOTE_ADDR")


def mcp_view(request):
    from django.http import HttpResponse  # noqa: PLC0415

    headers = dict(request.headers.items())
    body = b""
    if request.method == "POST":
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length > MAX_REQUEST_BYTES:
            body = b"x" * (MAX_REQUEST_BYTES + 1)  # let the server produce its 413 without reading the stream
        else:
            body = request.read(MAX_REQUEST_BYTES + 1)
    resp = get_server().handle_http(request.method, headers, body, client_ip(request))
    out = HttpResponse(resp.body, status=resp.status, content_type=resp.headers.get("Content-Type"))
    for name, value in resp.headers.items():
        if name != "Content-Type":
            out[name] = value
    return out


# What ``django.views.decorators.csrf.csrf_exempt`` sets, without importing Django at module load.
mcp_view.csrf_exempt = True
