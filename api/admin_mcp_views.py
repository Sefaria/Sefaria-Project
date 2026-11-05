"""
Endpoints for the AI chatbot's admin MCP endpoint (chat.sefaria.org/mcp/admin). See
docs/arch_docs/topic_prompts_admin_mcp.md.

Requests authenticate with a staff session, or with an MCP token in the X-Session-ID header for a
staff member who signed in through /api/mcp/authorize (see SessionIDAuthMiddleware).
"""
from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.helper import topic_prompts_admin
from sefaria.system.exceptions import InputError
from .views import _load_json_body


def _base_url(request):
    return request.build_absolute_uri("/").rstrip("/")


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
                via=getattr(request, "auth_via", None) or "session",
            ))
        except topic_prompts_admin.TopicPromptNotFound as e:
            return jsonResponse({"error": str(e)}, status=404)
        except topic_prompts_admin.TopicPromptConflict as e:
            return jsonResponse({"error": str(e), "current": e.current}, status=409)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
