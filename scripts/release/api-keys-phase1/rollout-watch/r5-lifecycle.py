#!/usr/bin/env python3
"""R5 backend lifecycle through the real site and gateway (auth service in enforce): staging, preprod or prod.
On staging, as the @example.com smoke account (temporarily staff). Prod has no test accounts: run it there as a staff
member's own session, and it deletes what it creates. Steps: enable, confirm email (signed link from the pod, via the real confirm route),
create project, create key, gateway accepts the key, restrict to the project's website (403 from another origin),
revoke (time until 401), delete the project. Key values stay in memory, never printed.

Ported 2026-11-26 from the staging-only script of 2026-11-18 (run record step G8): --env; the Bearer is optional
(not needed once #4160 ships); --domains adds the #3942 check that a subdomain of the key's website passes.

Usage: r5-lifecycle.py [--env staging|preprod|prod] [--domains]
Needs, in ~/.config/sefaria-<env>/ (mode 600): session-cookie (sessionid); knn-token while Django still checks the
Bearer; r5-confirm-key (the confirm-link key, written by the pod step) when the account's email is not yet confirmed.
"""
import argparse, http.cookiejar, json, os, sys, time, urllib.request, urllib.error

HOSTS = {"staging": "www.sefariastaging.org", "preprod": "www.sefariapreprod.org", "prod": "www.sefaria.org"}
ap = argparse.ArgumentParser()
ap.add_argument("--env", choices=HOSTS, default="staging")
ap.add_argument("--domains", action="store_true", help="#3942 is live: a subdomain of the website passes")
args = ap.parse_args()
HOST = HOSTS[args.env]
BASE = "https://" + HOST
CFG = os.path.expanduser(f"~/.config/sefaria-{args.env}")
sess = open(f"{CFG}/session-cookie").read().strip()
sess = sess.split("=", 1)[1] if sess.startswith("sessionid=") else sess
BEARER = open(f"{CFG}/knn-token").read().strip() if os.path.exists(f"{CFG}/knn-token") else ""
SITE = "https://r5-rehearsal.example.com"
LA_BODY = {"query": "kindness to strangers", "result_limit": 3, "linked_ref_limit": 3, "include_linked_refs": True}

jar = http.cookiejar.CookieJar()
def ck(name, value):
    return http.cookiejar.Cookie(0, name, value, None, False, HOST, True, False, "/", True, True,
                                 None, False, None, None, {})
jar.set_cookie(ck("sessionid", sess)); jar.set_cookie(ck("interfaceLang", "english"))
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
results = []

def req(method, path, body=None, headers=None, cookies=True):
    h = {"User-Agent": f"SefariaR5Lifecycle/1.1 ({args.env})", "Referer": BASE + "/settings/developer"}
    csrf = next((c.value for c in jar if c.name == "csrftoken"), None)
    if csrf and cookies:
        h["X-CSRFToken"] = csrf
    if body is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    o = opener if cookies else urllib.request.build_opener()
    try:
        resp = o.open(r, timeout=30); st, raw = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        st, raw = e.code, e.read()
    try:
        j = json.loads(raw)
    except Exception:
        j = None
    return st, j

def check(name, ok, detail=""):
    results.append(ok); print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}"); sys.stdout.flush()
    if not ok:
        print("R5-LIFECYCLE FAIL (stopped at the first failure)"); sys.exit(1)

def gate(key, origin=None):
    """POST /api/knn-search with the key (and the Bearer while Django checks it), no session."""
    h = {"x-api-key": key}
    if BEARER:
        h["Authorization"] = f"Bearer {BEARER}"
    if origin:
        h["Origin"] = origin
    st, j = req("POST", "/api/knn-search", LA_BODY, h, cookies=False)
    if isinstance(j, dict) and "help" in j and "code" in j:
        return st, "gateway", j["code"]
    return st, "django", None

# 0. csrftoken
req("GET", "/settings/developer")
check("csrftoken set", any(c.name == "csrftoken" for c in jar))

# 1. confirm (the real link route), then enable, then the developer profile, in the order the UI uses
key_file = f"{CFG}/r5-confirm-key"
st2, j = req("GET", "/api/developer/state")
if not (j and j.get("emailVerified")):
    link = open(key_file).read().strip()
    st, _ = req("GET", f"/settings/developer/confirm-email/{link}")
    st2, j = req("GET", "/api/developer/state")
    check("confirm via the real link route", j and j.get("emailVerified") is True, f"route {st}; emailVerified={j and j.get('emailVerified')}")
else:
    print("INFO  email already confirmed; confirm step skipped")
st, j = req("POST", "/api/developer/enable", {})
check("enable", st == 200 and j.get("developerEnabled") is True, f"{st}")
st, j = req("POST", "/api/developer/profile", {"profile": {"developerName": "R5 rehearsal", "termsAccepted": True}})
check("save developer profile (terms accepted)", st == 200, f"{st} {(j or {}).get('error','')}")

# 2. project + key
st, j = req("POST", "/api/developer/projects", {"project": {"name": "R5 rehearsal (delete me)", "visibility": "private", "websiteUrl": SITE}})
pid = j and j.get("projectId")
check("create project", st == 200 and bool(pid), f"{st}")
st, j = req("POST", f"/api/developer/projects/{pid}/keys", {"label": "r5-rehearsal"})
kid, kval = (j or {}).get("keyId"), (j or {}).get("keyValue")
check("create key (value returned once)", st == 200 and bool(kid) and (kval or "").startswith("sfr_"), f"{st}")

# 3. gateway accepts it (LISTEN/NOTIFY; allow up to 10 s)
t0 = time.time()
while True:
    st, who, code = gate(kval)
    if who == "django" or time.time() - t0 > 10:
        break
    time.sleep(0.5)
check("gateway accepts the new key", who == "django", f"{st} from {who} after {time.time()-t0:.1f}s")

# 4. restrict to the website: other origin 403, own origin passes
st, j = req("POST", f"/api/developer/keys/{kid}", {"restrictToWebsite": True})
check("restrict key to website", st == 200, f"{st}")
t0 = time.time()
while True:
    st, who, code = gate(kval, origin="https://evil.example.org")
    if who == "gateway" or time.time() - t0 > 10:
        break
    time.sleep(0.5)
check("other origin denied", st == 403 and who == "gateway", f"{st} {who} {code} after {time.time()-t0:.1f}s")
st, who, code = gate(kval, origin=SITE)
check("own origin passes", who == "django", f"{st} from {who}")
if args.domains:
    st, who, code = gate(kval, origin="https://docs.r5-rehearsal.example.com")
    check("subdomain of the website passes (#3942)", who == "django", f"{st} from {who}")
st, who, code = gate(kval)
check("no Origin denied (server use needs an unrestricted key)", st == 403 and who == "gateway", f"{st} {who} {code}")
req("POST", f"/api/developer/keys/{kid}", {"restrictToWebsite": False})

# 5. revoke: time until the gateway denies it
st, j = req("DELETE", f"/api/developer/keys/{kid}")
check("revoke", st == 200, f"{st}")
t0 = time.time()
while True:
    st, who, code = gate(kval)
    if who == "gateway" or time.time() - t0 > 90:
        break
    time.sleep(0.5)
check("revoked key denied", st == 401 and code == "api_key_invalid", f"{st} {who} {code} after {time.time()-t0:.1f}s")

# 6. clean up
st, j = req("DELETE", f"/api/developer/projects/{pid}")
check("delete project", st == 200, f"{st}")
print("R5-LIFECYCLE", "PASS" if all(results) else "FAIL", f"({sum(results)}/{len(results)})")
sys.exit(0 if all(results) else 1)
