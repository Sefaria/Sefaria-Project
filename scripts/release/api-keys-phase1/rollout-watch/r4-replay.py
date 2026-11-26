#!/usr/bin/env python3
"""R4 replay: the Library Assistant's exact /api/knn-search request, with and without credentials, plus control
cases, against staging, preprod or prod. Says who answered each one: the gateway (auth service) or Django.

Ported 2026-11-26 from the staging-only rehearsal script of 2026-11-18 (run record step G8).

Usage: r4-replay.py [--env staging|preprod|prod] [--django bearer|open] observe|enforce
  observe|enforce  the mode the environment is expected to be in; sets the expected results
  --django bearer  Django still checks the internal Bearer on knn-search (before #4160)   [default]
  --django open    Django no longer checks it (#4160 shipped; it ships together with enforce)
Secrets: ~/.config/sefaria-<env>/r4-keys.env with LA_KEY, MCP_KEY and, while Django checks it, KNN_BEARER.
Never printed. Exit 0 when every case matches; 1 otherwise. The malformed-path probe is reported, not judged.
"""
import argparse, json, os, sys, urllib.request, urllib.error

HOSTS = {"staging": "www.sefariastaging.org", "preprod": "www.sefariapreprod.org", "prod": "www.sefaria.org"}
ap = argparse.ArgumentParser()
ap.add_argument("mode", choices=("observe", "enforce"))
ap.add_argument("--env", choices=HOSTS, default="staging")
ap.add_argument("--django", choices=("bearer", "open"), default="bearer")
a = ap.parse_args()
BASE, MODE, DJ_BEARER = "https://" + HOSTS[a.env], a.mode, a.django == "bearer"
cfg = os.path.expanduser(f"~/.config/sefaria-{a.env}/r4-keys.env")
env = dict(l.strip().split("=", 1) for l in open(cfg) if "=" in l and not l.startswith("#"))
LA, MCP, BEARER = env["LA_KEY"], env["MCP_KEY"], env.get("KNN_BEARER", "")
if DJ_BEARER and not BEARER:
    sys.exit(f"KNN_BEARER missing in {cfg} (needed while Django checks the Bearer)")
BAD = "sfr_" + "0" * 32  # well-formed, not registered
LA_BODY = {"query": "what does the Torah say about kindness to strangers", "result_limit": 10,
           "linked_ref_limit": 10, "include_linked_refs": True}  # as ai-chatbot's semantic_search builds it


def call(method, path, headers=None, body=None):
    h = {"User-Agent": f"SefariaR4Replay/1.1 ({a.env})"}
    if body is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=40); status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    try:
        j = json.loads(raw)
    except Exception:
        j = None
    gateway = isinstance(j, dict) and j.get("code") is not None and "help" in j  # the auth service's deny body
    detail = j.get("code") if gateway else ((j.get("error") if isinstance(j, dict) else None)
                                            or raw[:60].decode("utf8", "replace").replace("\n", " "))
    return status, ("gateway" if gateway else "django"), detail


G, DJ = "gateway", "django"
enf = MODE == "enforce"
bearer = {"Authorization": f"Bearer {BEARER}"} if BEARER else {}
# Without a Bearer, Django answers 401 while it checks it, and serves the request once #4160 is in (None = any status).
dj_no_bearer = (401, DJ) if DJ_BEARER else (None, DJ)
cases = [  # name, method, path, headers, body, (expected status or None, expected answerer)
    ("Bearer only (LA before its key)", "POST", "/api/knn-search", bearer, LA_BODY, (401, G) if enf else (None, DJ)),
    ("Bearer + LA key", "POST", "/api/knn-search", {**bearer, "x-api-key": LA}, LA_BODY, (None, DJ)),
    ("Bearer + MCP key", "POST", "/api/knn-search", {**bearer, "x-api-key": MCP}, LA_BODY, (None, DJ)),
    ("LA key, no Bearer", "POST", "/api/knn-search", {"x-api-key": LA}, LA_BODY, dj_no_bearer),
    ("No credentials", "POST", "/api/knn-search", {}, LA_BODY, (401, G) if enf else dj_no_bearer),
    ("Bearer + unregistered sfr_ key", "POST", "/api/knn-search", {**bearer, "x-api-key": BAD}, LA_BODY,
     (401, G) if enf else (None, DJ)),
    ("Ungated: texts, no key", "GET", "/api/texts/Genesis.1", {}, None, (200, DJ)),
    ("Ungated: texts, unregistered key", "GET", "/api/texts/Genesis.1", {"x-api-key": BAD}, None, (200, DJ)),
    ("Ungated: texts, LA key", "GET", "/api/texts/Genesis.1", {"x-api-key": LA}, None, (200, DJ)),
]
if not BEARER:
    cases = [c for c in cases if not c[0].startswith("Bearer")]

ok_all = True
print(f"env {a.env}; mode expected {MODE}; Django checks the Bearer: {'yes' if DJ_BEARER else 'no (#4160)'}")
for name, m, p, h, b, (est, ewho) in cases:
    st, who, detail = call(m, p, h, b)
    ok = who == ewho and (est is None or st == est)
    ok_all &= ok
    print(f"{'PASS' if ok else 'FAIL'}  {name:34s} -> {st} from {who:7s} ({detail})   expected {est or 'any'} from {ewho}")
st, who, detail = call("POST", "/api/%6bnn-search", {}, LA_BODY)  # malformed-path gap: an open decision
print(f"INFO  malformed path /api/%6bnn-search, no key -> {st} from {who} ({detail})")
print("R4-REPLAY", "PASS" if ok_all else "FAIL", f"({len(cases)} cases)")
sys.exit(0 if ok_all else 1)
