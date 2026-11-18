"""The editor's HTTP surface (PLAN.md §2.11, §2.3.5, contracts C3 and C9).

- `/_portal/editor/...`: the JSON API of contract C3. Every view is wrapped by
  `devportal.security.permissions.staff_api` (401 anonymous, 403 non-staff) and none is `csrf_exempt`, so
  `CsrfViewMiddleware` answers 403 to an unsafe request without a token.
- `/editor` and `/editor/<section>/<slug>`: the editor shell page. Anonymous visitors get 302 to
  `/login?next=<path>`, signed-in users who are not staff get 403. The middleware gives `/editor` responses the
  editor CSP (`style-src-attr 'unsafe-inline'` for ProseMirror; `style-src` is unchanged).

The routes are listed in `editor_urlpatterns` and `shell_urlpatterns`; `devportal/urls.py` includes them above
the `^_portal/` catch-all and the page fallback.
"""

import json

from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.template.loader import render_to_string
from django.urls import path, re_path
from django.utils.html import format_html
from django.utils.http import urlencode
from django.utils.safestring import mark_safe
from django.views.decorators.http import require_safe

from devportal.security.headers import request_origin
from devportal.security.permissions import error_response, staff_api
from devportal.services import editor as service

MAX_JSON_BYTES = 2 * 1024 * 1024


def _json(payload, status=200):
    response = JsonResponse(payload, status=status, json_dumps_params={"ensure_ascii": False})
    response["Cache-Control"] = "no-store"
    return response


def _body(request):
    if len(request.body) > MAX_JSON_BYTES:
        raise service.EditorError(413, "file_too_large", "The request body is too large.")
    content_type = (request.content_type or "").lower()
    if content_type != "application/json":
        raise service.EditorError(415, "unsupported_media_type", "Send JSON (Content-Type: application/json).")
    try:
        return json.loads(request.body.decode("utf-8") or "null")
    except (UnicodeDecodeError, ValueError) as exc:
        raise service.EditorError(400, "invalid_request", "The request body is not valid JSON.") from exc


def editor_view(methods):
    """Staff only, JSON errors, the listed methods. Never csrf_exempt."""

    def decorator(fn):
        def inner(request, *args, **kwargs):
            if request.method not in methods:
                response = error_response(405, "method_not_allowed", f"Use {', '.join(methods)} here.")
                response["Allow"] = ", ".join(methods)
                return response
            try:
                return fn(request, *args, **kwargs)
            except service.EditorConflict as conflict:
                return _json(conflict.payload(), status=409)
            except service.EditorError as error:
                return error_response(error.status, error.code, error.message, error.fields)

        inner.__name__ = fn.__name__
        inner.__qualname__ = fn.__qualname__
        inner.__doc__ = fn.__doc__
        return staff_api(inner)

    return decorator


# --- API ----------------------------------------------------------------------------------------------------------


@editor_view(["GET"])
def tree(request, section):
    """GET /_portal/editor/tree/<section> -> EditorTree."""
    return _json(service.tree(section))


@editor_view(["POST"])
def pages(request):
    """POST /_portal/editor/pages (EditorPageCreateRequest) -> 201 EditorPage."""
    page = service.create_page(request.user, _body(request))
    return _json(service.editor_page(page), status=201)


@editor_view(["GET", "PATCH", "DELETE"])
def page(request, page_id):
    """GET -> EditorPage; PATCH (EditorPageSettingsRequest) -> EditorPage; DELETE -> EditorTree (soft delete)."""
    if request.method == "GET":
        return _json(service.editor_page(service.get_page(page_id)))
    if request.method == "PATCH":
        return _json(service.change_settings(request.user, page_id, _body(request)))
    return _json(service.delete(request.user, page_id))


@editor_view(["PUT"])
def draft(request, page_id):
    """PUT /_portal/editor/pages/<id>/draft (EditorDraftSaveRequest) -> EditorDraftSaveResponse | 409."""
    return _json(service.save_draft(request.user, page_id, _body(request)))


@editor_view(["POST"])
def publish(request, page_id):
    """POST /_portal/editor/pages/<id>/publish (EditorPublishRequest) -> EditorPublishResponse | 409."""
    return _json(service.publish(request.user, page_id, _body(request), request_origin(request)))


@editor_view(["GET"])
def revisions(request, page_id):
    """GET /_portal/editor/pages/<id>/revisions -> EditorRevisions (newest first)."""
    return _json(service.revisions(page_id))


@editor_view(["POST"])
def restore(request, page_id, number):
    """POST /_portal/editor/pages/<id>/revisions/<n>/restore (EditorRestoreRequest) -> EditorDraftSaveResponse."""
    return _json(service.restore(request.user, page_id, number, _body(request)))


@editor_view(["POST"])
def move(request, page_id):
    """POST /_portal/editor/pages/<id>/move (EditorMoveRequest) -> EditorTree | 409 | 422 invalid_move."""
    return _json(service.move(request.user, page_id, _body(request)))


@editor_view(["POST"])
def preview(request):
    """POST /_portal/editor/preview (EditorPreviewRequest) -> EditorPreviewResponse."""
    return _json(service.preview(_body(request)))


@editor_view(["POST"])
def uploads(request):
    """POST /_portal/editor/uploads (multipart, part "file") -> 201 EditorUploadResponse, 200 for known bytes."""
    if not (request.content_type or "").startswith("multipart/form-data"):
        raise service.EditorError(415, "unsupported_media_type", "Send the image as multipart/form-data.")
    payload, created = service.upload(request.user, request.FILES.get("file"), request_origin(request))
    return _json(payload, status=201 if created else 200)


@staff_api
def not_found(request, *args, **kwargs):
    """Any other /_portal/editor/ path, for staff: a JSON 404."""
    return error_response(404, "not_found", "No such editor endpoint.")


editor_urlpatterns = [
    path("_portal/editor/tree/<str:section>", tree, name="editor_tree"),
    path("_portal/editor/pages", pages, name="editor_pages"),
    path("_portal/editor/pages/<int:page_id>", page, name="editor_page"),
    path("_portal/editor/pages/<int:page_id>/draft", draft, name="editor_draft"),
    path("_portal/editor/pages/<int:page_id>/publish", publish, name="editor_publish"),
    path("_portal/editor/pages/<int:page_id>/revisions", revisions, name="editor_revisions"),
    path("_portal/editor/pages/<int:page_id>/revisions/<int:number>/restore", restore, name="editor_restore"),
    path("_portal/editor/pages/<int:page_id>/move", move, name="editor_move"),
    path("_portal/editor/preview", preview, name="editor_preview"),
    path("_portal/editor/uploads", uploads, name="editor_uploads"),
    re_path(r"^_portal/editor/", not_found, name="editor_not_found"),
]


# --- the shell page -----------------------------------------------------------------------------------------------


@require_safe
def editor_shell(request, section=None, slug=None):
    """GET /editor[/<section>/<slug>]: the editor's page. Staff only; see the module docstring."""
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return HttpResponseRedirect("/login?" + urlencode({"next": request.get_full_path()}))
    if not (user.is_active and user.is_staff):
        html = render_to_string("devportal/editor_forbidden.html", {"csp_nonce": _nonce(request)})
        return HttpResponse(html, status=403, content_type="text/html; charset=utf-8")
    boot = {
        "contractVersion": service.CONTRACT_VERSION,
        "apiBase": "/_portal/editor",
        "csrfUrl": "/_portal/csrf",
        "user": service.user_ref(user),
        "initial": {"section": section or "docs", "slug": slug},
    }
    context = {"csp_nonce": _nonce(request), "boot_island": _json_island("dp-editor-data", boot, _nonce(request))}
    response = HttpResponse(render_to_string("devportal/editor.html", context), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-store"
    response["X-Robots-Tag"] = "noindex, nofollow"
    return response


def _json_island(element_id, data, nonce):
    """A `<script type="application/json">` island, escaped like Django's json_script, with the CSP nonce."""
    text = json.dumps(data, ensure_ascii=False).translate(_JSON_SCRIPT_ESCAPES)
    return format_html(
        '<script type="application/json" id="{}" nonce="{}">{}</script>',
        element_id,
        nonce,
        mark_safe(text),  # noqa: S308
    )


_JSON_SCRIPT_ESCAPES = {ord(">"): "\\u003E", ord("<"): "\\u003C", ord("&"): "\\u0026"}


def _nonce(request):
    return getattr(request, "devportal_nonce", "")


shell_urlpatterns = [
    path("editor", editor_shell, name="editor"),
    path("editor/<str:section>/<str:slug>", editor_shell, name="editor_page_shell"),
]

urlpatterns = editor_urlpatterns + shell_urlpatterns
