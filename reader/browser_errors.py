"""
POST /api/reader-errors: the new reader's browser error beacons (lane C's contract, reader-next/src/lib/monitoring/error-reporter.ts;
LAUNCH_PLAN T-D01). The reader's pods are told the path through PUBLIC_ERROR_ENDPOINT (helm-chart `sefaria.readerEnv`).

A beacon (`navigator.sendBeacon`) cannot carry a CSRF header and is often sent while the page unloads, so this endpoint:
  - is CSRF-exempt and needs no session: it writes nothing but one log line, so there is nothing to forge;
  - answers 204 with no body, or 400 (not the schema) / 405 / 413 (over 16 KB) / 429 (rate limit) / 415 (not JSON);
  - accepts at most RATE_LIMIT beacons per client address per RATE_WINDOW seconds (Django's default cache: Redis in the cluster);
  - validates the agreed fields and drops every other one, re-scrubs query strings and e-mail addresses (the client already does),
    and logs one structured line on the `reader-browser` logger (JSON in the cluster, for Datadog). No database write.
Never logged: cookies, headers, the request's own query string, the client address.

Routed on the Library host only (sefaria/urls_library.py); the Voices host does not have it.
"""

import json
import re

import structlog
from django.core.cache import cache
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

logger = structlog.get_logger("reader-browser")

MAX_BODY_BYTES = 16 * 1024
RATE_LIMIT = 30
RATE_WINDOW = 60

KINDS = {"error", "unhandledrejection", "boundary", "hydration"}
BOUNDARIES = {"root", "route", "panel"}
TOKEN_RE = re.compile(r"^[a-z0-9-]{1,40}$")  # route kind, ua class
RELEASE_RE = re.compile(r"^[A-Za-z0-9._+-]{1,80}$")
QUERY_RE = re.compile(r"\?[^\s\"'`<>)]*")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _scrub(text, limit):
    return EMAIL_RE.sub("[email]", QUERY_RE.sub("", text))[:limit]


def _client_address(request):
    meta = request.META
    return (
        meta.get("HTTP_CF_CONNECTING_IP")
        or meta.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
        or meta.get("REMOTE_ADDR", "")
    )


def _over_limit(address):
    key = f"reader-errors:ip:{address}"
    cache.add(key, 0, RATE_WINDOW)
    try:
        return cache.incr(key) > RATE_LIMIT
    except ValueError:  # evicted between add and incr
        cache.set(key, 1, RATE_WINDOW)
        return False


def _number(value, low, high):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high


def validate(report):
    """The fields this endpoint logs, from a decoded beacon, or None when it is not one (lane C's schema, version 1)."""
    if not isinstance(report, dict) or report.get("v") != 1 or report.get("kind") not in KINDS:
        return None
    message, path = report.get("message"), report.get("path")
    if not isinstance(message, str) or not isinstance(path, str) or not path.startswith("/"):
        return None
    out = {
        "kind": report["kind"],
        "message": _scrub(message, 500),
        # the path only: never its query or fragment
        "path": EMAIL_RE.sub("[email]", path.split("?", 1)[0].split("#", 1)[0])[:300],
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
