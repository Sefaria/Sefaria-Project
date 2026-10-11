"""
Endpoints for the admin MCP server (sefaria-admin-mcp). See docs/arch_docs/topic_prompts_admin_mcp.md.

Requests authenticate with an admin MCP token in the X-Session-ID header (see SessionIDAuthMiddleware),
or with a staff session. Tokens are minted by a logged-in staff member at /api/admin/mcp-token.
"""
import datetime
import html

from django.conf import settings
from django.http import HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import redirect
from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.helper import topic_prompts_admin
from sefaria.system.exceptions import InputError
from sefaria.utils.chatbot import build_chatbot_user_token, ADMIN_MCP_TOKEN_AUDIENCE, ADMIN_MCP_DEFAULT_TTL_HOURS
from .views import _load_json_body


def _base_url(request):
    return request.build_absolute_uri("/").rstrip("/")


class AdminMCPAPIView(View):
    """Rejects non-staff with JSON 401/403 instead of redirecting to a login page."""

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return jsonResponse({"error": "Authentication required. Mint an admin MCP token at "
                                          f"{_base_url(request)}/api/admin/mcp-token"}, status=401)
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
            ))
        except topic_prompts_admin.TopicPromptNotFound as e:
            return jsonResponse({"error": str(e)}, status=404)
        except topic_prompts_admin.TopicPromptConflict as e:
            return jsonResponse({"error": str(e), "current": e.current}, status=409)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


MINT_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Admin MCP token</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #222; }}
  textarea {{ width: 100%; height: 6em; font-family: monospace; font-size: 12px; }}
  button {{ font-size: 16px; padding: 8px 16px; cursor: pointer; }}
  .warn {{ color: #8a4b00; }}
</style></head>
<body>
<h1>Admin MCP token</h1>
<p>Signed in as <b>{email}</b>. Tokens act as you on <code>/api/admin/*</code> only and expire after {ttl} hours.</p>
<p class="warn">Treat the token like a password. Don't commit it or share it.</p>
<button id="mint">Create token</button>
<div id="out" hidden>
  <h3>Token <small id="exp"></small></h3>
  <textarea id="token" readonly></textarea>
  <h3>Claude Code</h3>
  <textarea id="cmd" readonly></textarea>
</div>
<script>
document.getElementById("mint").onclick = async () => {{
  const r = await fetch("", {{method: "POST", headers: {{"X-CSRFToken": "{csrf}"}}, credentials: "same-origin"}});
  const d = await r.json();
  if (!r.ok) {{ alert(d.error || "Failed"); return; }}
  document.getElementById("token").value = d.token;
  document.getElementById("exp").textContent = "(expires " + d.expires_at + ")";
  document.getElementById("cmd").value =
    "claude mcp add sefaria-admin -e SEFARIA_HOST=" + d.host + " -e SEFARIA_ADMIN_TOKEN=" + d.token +
    " -- uv --directory /path/to/sefaria-admin-mcp run sefaria-admin-mcp";
  document.getElementById("out").hidden = false;
}};
</script>
</body></html>
"""


class AdminMCPTokenView(View):
    """
    GET: page with a button for a staff member to mint a token. POST: mints and returns it as JSON.
    Only a browser session can mint; an admin MCP token cannot mint a successor.
    """

    def dispatch(self, request, *args, **kwargs):
        if getattr(request, "auth_via", None) == ADMIN_MCP_TOKEN_AUDIENCE:
            return jsonResponse({"error": "Admin MCP tokens can't mint new tokens."}, status=403)
        if not getattr(settings, "ADMIN_MCP_TOKEN_SECRET", None):
            return jsonResponse({"error": "Admin MCP tokens are not enabled on this server."}, status=503)
        return super().dispatch(request, *args, **kwargs)

    def _ttl_hours(self):
        return getattr(settings, "ADMIN_MCP_TOKEN_TTL_HOURS", ADMIN_MCP_DEFAULT_TTL_HOURS)

    def get(self, request):
        if not request.user.is_authenticated:
            return redirect(f"/login?next={request.path}")
        if not request.user.is_staff:
            return HttpResponse("Staff only.", status=403)
        return HttpResponse(MINT_PAGE.format(
            email=html.escape(request.user.email),
            ttl=self._ttl_hours(),
            csrf=get_token(request),
        ))

    def post(self, request):
        if not request.user.is_authenticated or not request.user.is_staff:
            return jsonResponse({"error": "Staff only."}, status=403)
        ttl_hours = self._ttl_hours()
        now = datetime.datetime.now(datetime.timezone.utc)
        token = build_chatbot_user_token(request.user.id, settings.ADMIN_MCP_TOKEN_SECRET, now=now,
                                         ttl_hours=ttl_hours, aud=ADMIN_MCP_TOKEN_AUDIENCE)
        return jsonResponse({
            "token": token,
            "expires_at": (now + datetime.timedelta(hours=ttl_hours)).replace(microsecond=0).isoformat(),
            "host": _base_url(request),
        })
