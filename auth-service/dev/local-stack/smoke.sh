#!/usr/bin/env bash
# Smoke test of the running local stack. Creates one key on the stack sentinel's project through the Django ORM,
# checks it end to end, revokes it, then deletes the row. Key values never reach stdout or a log.
#   S1 anonymous page view through Envoy -> 200
#   S2 gated path without a key -> 401 api_key_required
#   S3 a key inserted through the ORM is accepted (echo shows the project's tier: developer without a limits row; gated path not denied)
#   S4 revoking the key through the ORM -> 401 api_key_invalid within 2 s
set -uo pipefail
source "$(dirname "$0")/lib.sh"

fails=0
result() { printf '%-4s %-5s %s\n' "$1" "$2" "$3"; [ "$2" = pass ] || fails=$((fails + 1)); }
gw() { curl -s -m 10 -H "Host: $1.gateway.test:10080" "${@:3}" "http://127.0.0.1:10080$2"; }
registry_version() { curl -s -m 3 http://127.0.0.1:18080/internal/registry | sed -E 's/.*"version":([0-9]+).*/\1/'; }

code="$(gw www /texts -o /dev/null -w '%{http_code}')"
title="$(gw www /texts | grep -o '<title>[^<]*' | head -1 | cut -c8-)"
[ "$code" = 200 ] && [ -n "$title" ] && result S1 pass "GET www /texts -> $code, title '$title'" \
  || result S1 fail "GET www /texts -> $code"

body="$(gw www /api/knn-search -o - -w ' HTTP=%{http_code}')"
case "$body" in
  *'"code":"api_key_required"'*'HTTP=401') result S2 pass "GET www /api/knn-search, no key -> $body" ;;
  *) result S2 fail "GET www /api/knn-search, no key -> $body" ;;
esac

secret="$(mktemp "$STATE_DIR/smoke-key.XXXXXX")"
chmod 600 "$secret"
trap 'rm -f "$secret"' EXIT
orm() { (cd "$REPO" && django_env "$PYTHON" manage.py shell) 2>/dev/null; }

v0="$(registry_version)"
key_id="$(SMOKE_SECRET="$secret" orm <<'PY' | grep '^key_id=' | cut -d= -f2
import os
from powered_by.models import ApiKey, Project
project = Project.objects.get(notes="E2E api-keys stack sentinel (local only)")
api_key = ApiKey.objects.create(project=project, label="smoke")
with open(os.environ["SMOKE_SECRET"], "w") as f:
    f.write(api_key.key)
print("key_id=%s" % api_key.id)
PY
)"
[ -n "$key_id" ] || { result S3 fail "ORM key creation failed"; exit 1; }
t0="$(python3 -c 'import time; print(time.time())')"
for _ in $(seq 1 40); do [ "$(registry_version)" != "$v0" ] && break; sleep 0.05; done
bump="$(python3 -c "import time; print('%.2f' % (time.time() - $t0))")"
key="$(cat "$secret")"

echo_body="$(gw echo /api/knn-search -H "x-api-key: $key")"
tier="$(printf '%s' "$echo_body" | python3 -c 'import json,sys; h=json.load(sys.stdin)["request"]["headers"]; print(h.get("x-sefaria-tier",""), h.get("x-sefaria-auth-result",""), "project=" + h.get("x-sefaria-project",""))')"
www_code="$(gw www /api/knn-search -H "x-api-key: $key" -o /dev/null -w '%{http_code}')"
case "$tier" in
  "developer ok project="[0-9]*)
    if [ "$www_code" != 401 ] && [ "$www_code" != 403 ]; then
      result S3 pass "registry version $v0 -> $(registry_version) in ${bump}s; echo /api/knn-search with key -> tier/result: $tier (the project tier, from its limits row or developer); www /api/knn-search with key -> $www_code (not denied)"
    else
      result S3 fail "www /api/knn-search with key -> $www_code"
    fi ;;
  *) result S3 fail "echo /api/knn-search with key -> '$tier' (registry $v0 -> $(registry_version))" ;;
esac

t0="$(SMOKE_KEY_ID="$key_id" orm <<'PY' | grep '^committed_at=' | cut -d= -f2
import os, time
from django.utils import timezone
from powered_by.models import ApiKey
ApiKey.objects.filter(id=os.environ["SMOKE_KEY_ID"]).update(revoked_at=timezone.now())
print("committed_at=%f" % time.time())
PY
)"
denied=""
while :; do
  elapsed="$(python3 -c "import time; print('%.2f' % (time.time() - $t0))")"
  body="$(gw www /texts -H "x-api-key: $key" -o - -w ' HTTP=%{http_code}' | tail -c 400)"
  case "$body" in *'"code":"api_key_invalid"'*'HTTP=401') denied=1; break ;; esac
  python3 -c "import sys; sys.exit(0 if $elapsed < 5 else 1)" || break
  sleep 0.05
done
if [ -n "$denied" ] && python3 -c "import sys; sys.exit(0 if $elapsed <= 2 else 1)"; then
  result S4 pass "revoked via ORM; www /texts with key -> 401 api_key_invalid ${elapsed}s after the revoke committed"
else
  result S4 fail "after ${elapsed}s: $body"
fi

SMOKE_KEY_ID="$key_id" orm <<'PY' >/dev/null
import os
from powered_by.models import ApiKey
ApiKey.objects.filter(id=os.environ["SMOKE_KEY_ID"], label="smoke").delete()
PY
unset key
exit $fails
