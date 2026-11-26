# R5 check: Developer Settings is staff-only. Run on a web pod of the environment:
#   R5_HOST=www.sefaria.org R5_STAFF_EMAIL=<staff> R5_OTHER_EMAIL=<non-staff> python manage.py shell < r5-check.py
# GET requests only, through Django's test client logged in by user object (no passwords). force_login writes one
# session row per account; nothing else is written. Staff must see Developer Settings; a non-staff account gets 404.
# Prints one PASS/FAIL line per check and a final R5 line. Never prints keys.
# Ported 2026-11-26 from the staging-only script of 2026-11-18 (run record step G8): host and accounts from env.
# Prod has no test accounts (none are created there): R5_OTHER_EMAIL is an existing non-staff account chosen by the
# person running it; without it the non-staff checks are reported INVALID, never PASS.
import json, os
from django.conf import settings
from django.contrib.auth.models import User
from django.test import Client

HOST = os.environ.get("R5_HOST", "www.sefariastaging.org")
STAFF = os.environ.get("R5_STAFF_EMAIL", "yotam@sefaria.org")
OTHER = os.environ.get("R5_OTHER_EMAIL", "apikeys-release-smoke@example.com")
print(f"host {HOST}; settings: DEVELOPER_SETTINGS_ENABLED={settings.DEVELOPER_SETTINGS_ENABLED} "
      f"STAFF_ONLY={settings.DEVELOPER_SETTINGS_STAFF_ONLY}")
results, invalid = [], []

def get(client, path):
    # follow=True: a Hebrew-language account is redirected to the -il domain first (language redirect, not access).
    return client.get(path, HTTP_HOST=HOST, secure=True, follow=True)

def check(name, ok, detail):
    results.append(ok); print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")

staff = User.objects.get(email=STAFF)
other = User.objects.filter(email=OTHER).first()
check("staff account is staff", staff.is_staff, f"is_staff={staff.is_staff}")
if other is None or other.is_staff:
    invalid.append("non-staff account"); print(f"INVALID  non-staff account {OTHER!r}: found={bool(other)} "
                                                  f"is_staff={getattr(other, 'is_staff', None)}")

c = Client(); c.force_login(staff)
r = get(c, "/settings/developer"); check("staff: /settings/developer", r.status_code == 200, r.status_code)
r = get(c, "/api/developer/state")
detail = r.status_code
if r.status_code == 200:
    try:
        detail = f"200, keys in body: {sorted(json.loads(r.content).keys())[:8]}"
    except Exception:
        detail = "200, not JSON"
check("staff: /api/developer/state", r.status_code == 200, detail)
r = get(c, "/api/developer/projects")
check("staff: /api/developer/projects reachable (POST-only, so GET is 405)", r.status_code == 405, r.status_code)

if other is not None and not other.is_staff:
    n = Client(); n.force_login(other)
    for p in ("/settings/developer", "/api/developer/state", "/api/developer/projects"):
        r = get(n, p); check(f"non-staff: {p}", r.status_code == 404, r.status_code)

r = get(Client(), "/api/developer/state")
check("anonymous: /api/developer/state", r.status_code in (401, 403, 404), r.status_code)
verdict = "FAIL" if not all(results) else ("INVALID" if invalid else "PASS")
print("R5", verdict, f"({sum(results)}/{len(results)})")
