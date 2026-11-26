"""The visitor's IP address, for the portal's per-visitor rate limits (MCP tools/call, feedback, 404 log).

Behind the production proxies (Envoy gateway -> nginx -> Varnish -> gunicorn), `REMOTE_ADDR` is the address of
the last proxy, so a limit keyed on it is one limit shared by every visitor: twenty feedback votes from anyone
would block feedback for everyone for an hour, and thirty MCP `execute-request` calls a minute would exhaust it
for all agents.

The gateway's Lua filter (helm-chart/sefaria/templates/gateway/extensionpolicy.yaml) always replaces or removes
`X-Original-Forwarded-For` with the client address it resolved (Cloudflare's `CF-Connecting-IP`, else Envoy's
trusted downstream address), so a client cannot choose it. It is trusted only when the deployment says the gateway
is in front: `DEVPORTAL_TRUST_GATEWAY_CLIENT_IP = True`. Anywhere else (the standalone server, tests, a deployment
without the gateway) the header could come from the client, so it is ignored and `REMOTE_ADDR` is used.
"""

import ipaddress

from django.conf import settings

GATEWAY_HEADER = "HTTP_X_ORIGINAL_FORWARDED_FOR"


def _valid_ip(value):
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def client_ip(request):
    """The client's address: the gateway's header when trusted and well formed, else REMOTE_ADDR."""
    if getattr(settings, "DEVPORTAL_TRUST_GATEWAY_CLIENT_IP", False):
        forwarded = _valid_ip(request.META.get(GATEWAY_HEADER) or "")
        if forwarded:
            return forwarded
    return request.META.get("REMOTE_ADDR")
