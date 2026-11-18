"""Internal JSON endpoints under /_portal/ (contract C9). Never under /api/ (C9 rule no_api_prefix)."""

from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET

from devportal.security.headers import request_origin
from devportal.security.permissions import error_response

from .pages import is_portal_path, resolve


@require_GET
def page_json(request):
    """GET /_portal/page.json?path=<path>[&nav=<generation>]: the page payload of contract C3.

    Always 200 whatever the kind (a `notfound` payload is still recorded in NotFoundLog). When `nav`
    equals the payload's nav generation, `nav.tree` is null and the client keeps the tree it has.
    """
    path = request.GET.get("path", "")
    if not is_portal_path(path):
        return error_response(
            400,
            "invalid_request",
            "The path parameter must be a path on this host.",
            {"path": ["Must start with a single slash and be at most 2048 characters."]},
        )
    payload = resolve(path, request_origin(request))
    nav = payload.get("nav")
    if nav and request.GET.get("nav") == str(nav["generation"]):
        nav["tree"] = None
    response = JsonResponse(payload, json_dumps_params={"ensure_ascii": False})
    response["Cache-Control"] = "no-cache"
    if payload["kind"] == "notfound":
        response.devportal_not_found_path = path
    return response


def portal_not_found(request, *args, **kwargs):
    """Any other /_portal/ path: a JSON 404, not the HTML 404 page."""
    return error_response(404, "not_found", "No such endpoint.")


@require_GET
def csrf_token(request):
    """GET /_portal/csrf: sets the CSRF cookie and returns the token. The only portal GET that may
    set a cookie; the client calls it on the first use of the feedback widget or the editor."""
    response = JsonResponse({"csrfToken": get_token(request)})
    response["Cache-Control"] = "no-store"
    return response


def search_docs(request, sha):
    """`/_portal/search-docs.<sha>.json`: the stored search documents. A stale `<sha>` is a 404, so a client
    with an old page payload reloads it; a current one is immutable and cached for a year."""
    from devportal.services import search_index  # noqa: PLC0415

    current = search_index.current_search_docs()
    if current is None or current[0] != sha:
        return error_response(404, "not_found", "No such search index; reload the page.")
    response = HttpResponse(current[1], content_type="application/json; charset=utf-8")
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response
