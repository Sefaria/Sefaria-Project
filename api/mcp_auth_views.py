"""
Sign-in handoff for the user Sefaria MCP server (the AI chatbot's /mcp/user endpoint).

The chatbot is the OAuth authorization server MCP clients talk to. To learn which Sefaria user is
signing in, it sends the browser here. Once the user is signed in to Sefaria, this view hands the
chatbot a short-lived mcp-login token naming that user, by auto-submitting a POST form to the
chatbot's callback. A form, not a redirect, so the token never appears in a URL or a log.

The chatbot binds each flow to the browser that started it and asks the user to approve access on
its own consent page, so landing here from someone else's link cannot grant them anything.
"""
import html
import re

from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.contrib.auth.views import redirect_to_login
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseNotFound
from django.views.decorators.http import require_GET

from sefaria.utils.chatbot import build_chatbot_user_token, MCP_LOGIN_TOKEN_AUDIENCE, MCP_LOGIN_TOKEN_TTL_MINUTES

STATE_RE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")

HANDOFF_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Continuing to Sefaria AI</title></head>
<body onload="document.forms[0].submit()">
<form method="post" action="{action}">
<input type="hidden" name="state" value="{state}">
<input type="hidden" name="token" value="{token}">
<p>Continuing to Sefaria AI&hellip;</p>
<button type="submit">Continue</button>
</form>
</body></html>
"""


@require_GET
def mcp_authorize(request):
    secret = getattr(settings, "MCP_TOKEN_SECRET", None)
    if not secret:
        return HttpResponseNotFound("MCP sign-in is not enabled.")

    state = request.GET.get("state", "")
    redirect_uri = request.GET.get("redirect_uri", "")
    if not STATE_RE.match(state) or redirect_uri not in getattr(settings, "MCP_AUTH_CALLBACK_URLS", []):
        return HttpResponseBadRequest("Invalid MCP sign-in request.")

    # Require a real browser session, not a user set from an X-Session-ID header.
    if not request.user.is_authenticated or not request.session.get(SESSION_KEY):
        return redirect_to_login(request.get_full_path())

    token = build_chatbot_user_token(
        request.user.id,
        secret,
        ttl_hours=MCP_LOGIN_TOKEN_TTL_MINUTES / 60,
        aud=MCP_LOGIN_TOKEN_AUDIENCE,
    )
    response = HttpResponse(HANDOFF_PAGE.format(
        action=html.escape(redirect_uri),
        state=html.escape(state),
        token=html.escape(token),
    ))
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response
