"""
POST /api/reader-errors: the new reader's browser error beacons (the contract is the client's
reader-next/src/lib/monitoring/error-reporter.ts). The reader's pods are told the path through PUBLIC_ERROR_ENDPOINT (helm-chart `sefaria.readerEnv`).

A beacon (`navigator.sendBeacon`) cannot carry a CSRF header and is often sent while the page unloads, so this endpoint:
  - is CSRF-exempt and needs no session: it writes nothing but one log line, so there is nothing to forge;
  - answers 204 with no body, or 400 (not the schema) / 405 / 413 (over 16 KB) / 429 (rate limit) / 415 (not JSON);
  - accepts at most RATE_LIMIT beacons per client address, and RATE_LIMIT_GLOBAL from everyone together, per RATE_WINDOW seconds
    (Django's default cache: Redis in the cluster). The client address is the visitor's as the Envoy Gateway in front of nginx
    resolved it (X-Original-Forwarded-For, which the gateway overwrites; see _client_address), never a header the client can append
    to: CF-Connecting-IP is read directly only when settings.ORIGIN_LOCKED_TO_CLOUDFLARE says nothing but Cloudflare can reach the
    origin, and X-Forwarded-For never;
  - validates the agreed fields and drops every other one, re-scrubs query strings and e-mail addresses (the client already does),
    and logs one structured line on the `reader-browser` logger (JSON in the cluster, for Datadog). No database write.
Never logged: cookies, headers, the request's own query string, the client address.

Routed on the Library host only (sefaria/urls_library.py); the Voices host does not have it.
"""

import ipaddress
import json
import re

import structlog
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

logger = structlog.get_logger("reader-browser")

MAX_BODY_BYTES = 16 * 1024
RATE_LIMIT = 30
# every client together: caps what a caller who can vary its address (or many callers) can write into the logs
RATE_LIMIT_GLOBAL = 600
RATE_WINDOW = 60

KINDS = {"error", "unhandledrejection", "boundary", "hydration"}
BOUNDARIES = {"root", "route", "panel"}
TOKEN_RE = re.compile(r"^[a-z0-9-]{1,40}$")  # route kind, ua class
RELEASE_RE = re.compile(r"^[A-Za-z0-9._+-]{1,80}$")
# Bounded patterns only (a beacon is untrusted input up to 16 KB): no unbounded repeat that can backtrack across the whole field.
QUERY_RE = re.compile(r"\?[^\s\"'`<>)]{0,5000}")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}")
# scrubbed with this much past the cap first, so an address or query the cap would cut through is still recognised and removed
SCRUB_MARGIN = 400


def _scrub(text, limit):
    """Cut to the cap (plus a margin) first, then remove query strings and e-mail addresses, then cut to the cap."""
    return EMAIL_RE.sub("[email]", QUERY_RE.sub("", text[: limit + SCRUB_MARGIN]))[:limit]


def _address(value):
    """One IP address from a header value, or None. A list keeps its last entry: the one added nearest to us, which a client cannot
    put there by sending its own (the gateway sends a single address; a list means something upstream appended)."""
    candidate = (value or "").split(",")[-1].strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def _client_address(request):
    """
    The rate limit's key: the visitor's address, as the chart's chain delivers it (helm-chart/sefaria):
      Cloudflare → Envoy Gateway (gateway.enabled, the default) → nginx → Varnish → Django.
    - The gateway's Lua (templates/gateway/extensionpolicy.yaml) *replaces* X-Original-Forwarded-For with CF-Connecting-IP, or else
      Envoy's resolved client address (ClientTrafficPolicy numTrustedHops 1); a value the client sent is overwritten. nginx and Varnish
      pass it through unchanged, and nginx's access log uses it as remoteIp (conf/nginx.template.conf.tpl, log_format structured).
    - nginx's X-Real-IP is its $remote_addr: behind the gateway that is the gateway pod, the same for every visitor, so it is used
      only when X-Original-Forwarded-For is missing (gateway off: nginx is then the edge and $remote_addr is the visitor).
    - REMOTE_ADDR (the hop before Django) when neither is there: local runs.
    Django cannot tell who set a header: with the gateway off a client could send its own X-Original-Forwarded-For through nginx. The
    gateway is on in every chart deployment, and RATE_LIMIT_GLOBAL bounds what any key rotation can write. Likewise the gateway's Lua
    trusts CF-Connecting-IP, so a client that bypasses Cloudflare can choose its key through the gateway: the global cap is the backstop.
    CF-Connecting-IP is read here directly only when settings.ORIGIN_LOCKED_TO_CLOUDFLARE is true. X-Forwarded-For never (its first
    entry is client-chosen).
    """
    meta = request.META
    if getattr(settings, "ORIGIN_LOCKED_TO_CLOUDFLARE", False):
        cf = _address(meta.get("HTTP_CF_CONNECTING_IP"))
        if cf:
            return cf
    for header in ("HTTP_X_ORIGINAL_FORWARDED_FOR", "HTTP_X_REAL_IP"):
        found = _address(meta.get(header))
        if found:
            return found
    return meta.get("REMOTE_ADDR", "")


def _counted_over(key, limit):
    cache.add(key, 0, RATE_WINDOW)
    try:
        return cache.incr(key) > limit
    except ValueError:  # evicted between add and incr
        cache.set(key, 1, RATE_WINDOW)
        return False


def _over_limit(address):
    """Per client address first; a beacon that passes it also counts against the cap for everyone together."""
    if _counted_over(f"reader-errors:ip:{address}", RATE_LIMIT):
        return True
    return _counted_over("reader-errors:all", RATE_LIMIT_GLOBAL)


def _number(value, low, high):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high


def validate(report):
    """The fields this endpoint logs, from a decoded beacon, or None when it is not one (the client's schema, version 1)."""
    if not isinstance(report, dict) or report.get("v") != 1 or report.get("kind") not in KINDS:
        return None
    message, path = report.get("message"), report.get("path")
    if not isinstance(message, str) or not isinstance(path, str) or not path.startswith("/"):
        return None
    out = {
        "kind": report["kind"],
        "message": _scrub(message, 500),
        # the path only: never its query or fragment
        "path": _scrub(path[: 300 + SCRUB_MARGIN].split("?", 1)[0].split("#", 1)[0], 300),
    }
    boundary = report.get("boundary")
    if boundary is not None:
        if boundary not in BOUNDARIES:
            return None
        out["boundary"] = boundary
    for field, limit in (("stack", 4000), ("source", 300)):
        value = report.get(field)
        if value is not None:
            if not isinstance(value, str):
                return None
            out[field] = _scrub(value, limit)
    release = report.get("release")
    if release is not None and not (isinstance(release, str) and RELEASE_RE.match(release)):
        return None
    if release is not None:
        out["release"] = release
    for field in ("route", "ua"):
        value = report.get(field)
        if value is not None:
            if not (isinstance(value, str) and TOKEN_RE.match(value)):
                return None
            out[field] = value
    signed_in = report.get("signedIn")
    if signed_in is not None:
        if not isinstance(signed_in, bool):
            return None
        out["signed_in"] = signed_in
    sample_rate = report.get("sampleRate")
    if sample_rate is not None:
        if not _number(sample_rate, 0, 1):
            return None
        out["sample_rate"] = sample_rate
    t = report.get("t")
    if t is not None:
        if not _number(t, 0, 10**10):
            return None
        out["page_ms"] = int(t)
    return out


@csrf_exempt
def reader_errors_api(request):
    if request.method != "POST":
        response = HttpResponse(status=405)
        response["Allow"] = "POST"
        return response
    try:
        declared = int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError:
        declared = 0
    if declared > MAX_BODY_BYTES:
        return HttpResponse(status=413)
    if request.content_type not in ("application/json", "text/plain"):
        return HttpResponse(status=415)
    if _over_limit(_client_address(request)):
        return HttpResponse(status=429)
    body = request.read(MAX_BODY_BYTES + 1)
    if len(body) > MAX_BODY_BYTES:
        return HttpResponse(status=413)
    try:
        report = validate(json.loads(body))
    except (ValueError, UnicodeDecodeError):
        report = None
    if report is None:
        return HttpResponse(status=400)
    logger.warning("reader_browser_error", **report)
    return HttpResponse(status=204)
