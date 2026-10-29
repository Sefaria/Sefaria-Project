"""
Endpoints for the AI chatbot's admin MCP endpoint (chat.sefaria.org/mcp/admin). See
docs/arch_docs/topic_prompts_admin_mcp.md.

Requests authenticate with a staff session, or with an MCP token in the X-Session-ID header for a
staff member who signed in through /api/mcp/authorize (see SessionIDAuthMiddleware).
"""
from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.helper import topic_links_admin, topic_prompts_admin
from sefaria.system.exceptions import InputError
from .views import _load_json_body


def _base_url(request):
    return request.build_absolute_uri("/").rstrip("/")


def _via(request):
    """How the editor authenticated, for audit records: "mcp" (a token from the admin MCP) or "session"."""
    return getattr(request, "auth_via", None) or "session"


class AdminMCPAPIView(View):
    """Rejects non-staff with JSON 401/403 instead of redirecting to a login page."""

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return jsonResponse({"error": "Authentication required. Sign in to Sefaria as a staff member."},
                                status=401)
        if not request.user.is_staff:
            return jsonResponse({"error": "Staff only."}, status=403)
        return super().dispatch(request, *args, **kwargs)


class TopicPromptsView(AdminMCPAPIView):

    def get(self, request):
        params = request.GET
        try:
            return jsonResponse(topic_prompts_admin.list_prompts(
                lang=params.get("lang", "en"),
                link_id=params.get("id"),
                topics=params.getlist("topic"),
                review_state=params.get("review_state"),
                published=params.get("published"),
                ai_generated=params.get("ai_generated"),
                ref=params.get("ref"),
                q=params.get("q"),
                limit=params.get("limit"),
                cursor=params.get("cursor"),
                base_url=_base_url(request),
            ))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class TopicPromptView(AdminMCPAPIView):

    def patch(self, request, link_id):
        body, err = _load_json_body(request)
        if err:
            return err
        fields = {k: body[k] for k in topic_prompts_admin.EDITABLE_FIELDS + ("review_state",) if k in body}
        try:
            return jsonResponse(topic_prompts_admin.update_prompt(
                link_id,
                body.get("lang", "en"),
                fields,
                body.get("base_version"),
                request.user.id,
                dry_run=bool(body.get("dry_run", False)),
                base_url=_base_url(request),
                via=_via(request),
            ))
        except topic_prompts_admin.TopicPromptNotFound as e:
            return jsonResponse({"error": str(e)}, status=404)
        except topic_prompts_admin.TopicPromptConflict as e:
            return jsonResponse({"error": str(e), "current": e.current}, status=409)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class TopicPromptsPublishView(AdminMCPAPIView):
    """POST {"items": [{"id", "base_version"}], "lang", "published": true|false, "dry_run"}."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(topic_prompts_admin.set_published(
                body.get("items"), body.get("lang", "en"), body.get("published", True), request.user.id,
                dry_run=bool(body.get("dry_run", False)), base_url=_base_url(request), via=_via(request),
            ))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class TopicPromptsGenerateView(AdminMCPAPIView):
    """POST {"topic", "lang", "ids"?}: queue AI prompts for sources with ai_context and no prompt."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(topic_prompts_admin.generate_prompts(body.get("topic"), body.get("ids") or [], body.get("lang", "en")), status=202)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class AdminTaskView(AdminMCPAPIView):
    """GET a background task's state (the staff-only view of /api/async/<id>)."""

    def get(self, request, task_id):
        from celery.result import AsyncResult
        result = AsyncResult(task_id)
        payload = {"task_id": task_id, "state": result.state, "ready": result.ready()}
        if result.ready():
            payload["successful"] = result.successful()
            if not result.successful():
                payload["error"] = str(result.result)
        return jsonResponse(payload)


class RefTopicLinksView(AdminMCPAPIView):
    """POST {"ref", "topic", "lang", "dry_run"} tags a passage; DELETE with the same query parameters untags it."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(topic_links_admin.tag_ref(body.get("ref") or "", body.get("topic") or "", body.get("lang", "en"), dry_run=bool(body.get("dry_run", False))))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)

    def delete(self, request):
        params = request.GET
        try:
            return jsonResponse(topic_links_admin.untag_ref(params.get("ref") or "", params.get("topic") or "", params.get("lang", "en"),
                                                            dry_run=params.get("dry_run") in ("1", "true")))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)



