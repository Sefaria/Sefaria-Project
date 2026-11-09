"""
Revoke-to-deny trials, run inside a web pod of the perf cauldron by run-perf-cauldron.sh revoke. Never run by hand
on any other cauldron.

It is piped to `python manage.py shell --no-imports` after a one-line preamble `PERF_ARGS = {...}`, so neither it nor
its arguments appear in the exec arguments. Each trial creates a key for the seeded fixture account gateway.open
through powered_by.developer (the writer the settings page uses, so the same triggers NOTIFY the auth service),
polls the gated path through the gateway until it is allowed, revokes the key the same way, and polls until 401
api_key_invalid. Both times are measured on this pod's monotonic clock from the moment the write returned.

The key value never leaves this process: the one output line is "PERF_JSON {...}" with labels and timings only.
The keys stay on the fixture project, which the seeder's --teardown removes.
"""

import http.client
import json
import secrets
import ssl
import time
import urllib.parse

from django.contrib.auth.models import User

from powered_by import developer
from powered_by.models import ApiProject

ID_LO, ID_HI = 2_098_000_001, 2_098_000_999

args = PERF_ARGS  # noqa: F821  (the preamble defines it)
uid = int(args["user_id"])
if not ID_LO <= uid <= ID_HI:
    raise SystemExit("refusing: user %d is outside the e2e fixture band" % uid)
user = User.objects.get(id=uid)
project = ApiProject.objects.get(owner=user, deleted_at__isnull=True)
base = urllib.parse.urlsplit(args["base"])
host_header = args["host"]
path = args["path"]
poll_s = float(args["poll"])
timeout_s = float(args["timeout"])


def connect():
    port = base.port or (443 if base.scheme == "https" else 80)
    if base.scheme == "https":
        return http.client.HTTPSConnection(base.hostname, port, timeout=5, context=ssl.create_default_context())
    return http.client.HTTPConnection(base.hostname, port, timeout=5)


# The gateway's own denial codes (the auth service's JSON body). Any of them means the key was not accepted.
GATEWAY_CODES = {"api_key_required", "api_key_invalid", "origin_not_allowed"}


def passed_gateway(status, code):
    """Passed the gateway: a 2xx, or a 4xx from Django itself (knn-search may refuse a bare GET), never a 401, a
    gateway denial code, a redirect or a 5xx."""
    return (200 <= status < 300 or 400 <= status < 500) and status != 401 and code not in GATEWAY_CODES


def poll(key, want_deny):
    """Seconds until the gateway's answer matches (denied: 401 api_key_invalid; allowed: see passed_gateway())."""
    t0 = time.monotonic()
    conn = None
    while time.monotonic() - t0 < timeout_s:
        status, code = 0, "-"
        try:
            conn = conn or connect()
            conn.request(
                "GET", path, headers={"Host": host_header, "x-api-key": key, "User-Agent": "apikeys-perf-revoke"}
            )
            resp = conn.getresponse()
            body = resp.read()
            status = resp.status
            if 400 <= status < 500:
                try:
                    code = json.loads(body).get("code") or "-"
                except (ValueError, AttributeError):
                    code = "-"
        except (OSError, http.client.HTTPException):
            conn = None
        if status and (
            (want_deny and status == 401 and code == "api_key_invalid")
            or (not want_deny and passed_gateway(status, code))
        ):
            return time.monotonic() - t0, status
        time.sleep(poll_s)
    return None, None


trials, errors = [], []
run = secrets.token_hex(3)
for i in range(int(args["trials"])):
    label = "perf-revoke-%s-%02d" % (run, i)
    key = developer.create_key(user, project.id, label)
    allowed, status = poll(key.key, want_deny=False)
    trial = {
        "label": label,
        "create_to_allow_ms": None if allowed is None else round(allowed * 1000, 1),
        "allowed_status": status,
    }
    time.sleep(0.2)
    developer.revoke_key(user, str(key.id))
    denied, _ = poll(key.key, want_deny=True)
    trial["revoke_to_deny_ms"] = None if denied is None else round(denied * 1000, 1)
    if allowed is None:
        errors.append("%s: never allowed within %.0f s" % (label, timeout_s))
    if denied is None:
        errors.append("%s: never denied within %.0f s" % (label, timeout_s))
    trials.append(trial)
    del key
    time.sleep(0.5)

print("PERF_JSON " + json.dumps({"trials": trials, "errors": errors, "poll_ms": poll_s * 1000}))
