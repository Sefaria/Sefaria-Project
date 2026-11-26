"""Internal JSON endpoints under /_portal/ (contract C9). Never under /api/ (C9 rule no_api_prefix)."""

import re
from urllib.parse import unquote

from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET

from devportal.security.headers import request_origin
from devportal.security.permissions import error_response

from . import reference
from .pages import NAV_SECTIONS, _generation, is_portal_path, resolve, sidebar_tree

REFERENCE_PAGE = re.compile(r"^/reference/(?P<slug>[^/]+)$")


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
    # Endpoint pages and tag groups are the reference module's (reference_payload); everything else resolves here.
    match = REFERENCE_PAGE.match(path)
    payload = reference.reference_payload(unquote(match["slug"]), request=request) if match else None
    if payload is None:
        payload = resolve(path, request_origin(request))
    nav = payload.get("nav")
    if nav and request.GET.get("nav") == str(nav["generation"]):
        nav["tree"] = None
    response = JsonResponse(payload, json_dumps_params={"ensure_ascii": False})
    response["Cache-Control"] = "no-cache"
    if payload["kind"] == "notfound":
        response.devportal_not_found_path = path
    return response


@require_GET
def portal_nav(request, section):
    """GET /_portal/nav/<section>.json (C9 portal-nav): the C3 sidebar tree of `docs` or `reference`."""
    if section not in NAV_SECTIONS:
        return error_response(404, "not_found", "There is no sidebar for this section.")
    response = JsonResponse(sidebar_tree(section, _generation()), json_dumps_params={"ensure_ascii": False})
    response["Cache-Control"] = "no-cache"
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


# -- "Did this page help you?" (PLAN.md §2.3.3, §6.7 S-14; contract C3 feedback-request) -------------------

FEEDBACK_MAX_COMMENT = 2000
FEEDBACK_MAX_PATH = 1024
FEEDBACK_PER_VISITOR_PER_HOUR = 20


def _visitor_hash(request):
    """A salted daily hash of the client, used only to limit repeats. The IP itself is never stored."""
    import hashlib  # noqa: PLC0415

    from django.conf import settings  # noqa: PLC0415
    from django.utils import timezone  # noqa: PLC0415

    from devportal.mcp.django_view import client_ip  # noqa: PLC0415

    day = timezone.now().strftime("%Y-%m-%d")
    raw = f"{settings.SECRET_KEY}:feedback:{day}:{client_ip(request) or 'unknown'}"
    return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()[:32]


def feedback(request):
    """POST /_portal/feedback: 201 {"ok": true}; 400 invalid_request; 403 (CSRF, by middleware); 429."""
    import json  # noqa: PLC0415

    from django.core.cache import cache  # noqa: PLC0415

    from devportal.mcp.ratelimit import FixedWindowRateLimiter  # noqa: PLC0415
    from devportal.models import Feedback  # noqa: PLC0415
    from devportal.services.nav import resolve_path  # noqa: PLC0415

    if request.method != "POST":
        response = error_response(405, "method_not_allowed", "Use POST.")
        response["Allow"] = "POST"
        return response
    try:
        body = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return error_response(400, "invalid_request", "The body must be JSON.")
    if not isinstance(body, dict) or set(body) != {"path", "helpful", "comment"}:
        return error_response(400, "invalid_request", "Expected exactly path, helpful and comment.")
    path, helpful, comment = body["path"], body["helpful"], body["comment"]
    if not isinstance(path, str) or not path.startswith("/") or len(path) > FEEDBACK_MAX_PATH:
        return error_response(400, "invalid_request", "path must be a portal path.", {"path": "invalid"})
    if not isinstance(helpful, bool):
        return error_response(400, "invalid_request", "helpful must be true or false.", {"helpful": "invalid"})
    if not isinstance(comment, str) or len(comment) > FEEDBACK_MAX_COMMENT:
        return error_response(400, "invalid_request", "comment is too long.", {"comment": "too_long"})

    visitor = _visitor_hash(request)
    limiter = FixedWindowRateLimiter(cache, window=3600, prefix="devportal:feedback:rl")
    allowed, retry_after = limiter._hit(visitor, FEEDBACK_PER_VISITOR_PER_HOUR)  # noqa: SLF001
    if not allowed:
        response = error_response(429, "rate_limited", "Too many votes; try again later.")
        response["Retry-After"] = str(retry_after)
        return response

    user = request.user if getattr(request, "user", None) is not None and request.user.is_authenticated else None
    Feedback.objects.create(
        path=path,
        page=resolve_path(path),
        helpful=helpful,
        comment=comment.strip(),
        user=user,
        visitor_hash=visitor,
    )
    response = JsonResponse({"ok": True}, status=201)
    response["Cache-Control"] = "no-store"
    return response
