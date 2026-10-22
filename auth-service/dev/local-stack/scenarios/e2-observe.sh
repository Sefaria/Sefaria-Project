#!/usr/bin/env bash
# E2: observe mode (AUTH_MODE=observe), repeating the A2-A5 denials. Desired: never denies; the decision shows as
# observed:<code> in the metric and in x-sefaria-auth-result; with D4, nginx logs it too.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up AUTH_MODE=observe
check E2 "/internal/registry reports the mode" "$(registry_field mode)" observe
new_key e2-open
new_key e2-restricted '["https://good.example"]'
new_key e2-revoked; revoke_key e2-revoked
unknown_key e2-unknown
sleep 1.5

# seen PATH [KEY] [ORIGIN] [METHOD] -> "status tier project result" as the echo upstream saw them
seen() {
  local args=(-s -m 5 -o "$D11_DIR/e2.body" -w '%{http_code}' -X "${4:-GET}")
  [ -n "${2:-}" ] && args+=(-H "@$KEYS_DIR/$2.hdr")
  [ -n "${3:-}" ] && args+=(-H "Origin: $3")
  local st; st="$(curl "${args[@]}" "http://127.0.0.1:$GW_HC$1")"
  python3 - "$st" "$D11_DIR/e2.body" <<'PY'
import json, sys
try:
    h = json.load(open(sys.argv[2]))["request"]["headers"]
except Exception:
    h = {}
print(sys.argv[1], h.get("x-sefaria-tier", "-"), h.get("x-sefaria-project", "-") or '""', h.get("x-sefaria-auth-result", "-"))
PY
  rm -f "$D11_DIR/e2.body"
}
denied0="$(envoy_stat hc denied)"
expect() {  # expect ID WHAT GOT WANT
  check "$1" "$2" "$3" "$4"
}
expect E2 "A2a unknown key, gated" "$(seen $GATED e2-unknown)" '200 anonymous "" observed:api_key_invalid'
expect E2 "A2b unknown key, ungated" "$(seen /api/v3/texts/Genesis.1.1 e2-unknown)" '200 anonymous "" observed:api_key_invalid'
expect E2 "A2b revoked key, gated" "$(seen $GATED e2-revoked)" '200 anonymous "" observed:api_key_invalid'
expect E2 "A3b restricted key, wrong Origin" "$(seen $GATED e2-restricted https://evil.example)" '200 anonymous "" observed:origin_not_allowed'
expect E2 "A3b restricted key, no Origin" "$(seen $GATED e2-restricted)" '200 anonymous "" observed:origin_not_allowed'
expect E2 "A4a no key, gated, GET" "$(seen $GATED)" '200 anonymous "" observed:api_key_required'
expect E2 "A4a no key, gated, POST" "$(seen $GATED '' '' POST)" '200 anonymous "" observed:api_key_required'
expect E2 "A5b OPTIONS without Origin, gated" "$(seen $GATED '' '' OPTIONS)" '200 anonymous "" observed:api_key_required'
expect E2 "A5a OPTIONS with Origin, gated" "$(seen $GATED '' https://good.example OPTIONS)" '200 embed "" preflight'
expect E2 "A3a restricted key, right Origin" "$(seen $GATED e2-restricted https://good.example)" "200 developer $PROJECT_ID ok"
expect E2 "A1 open key" "$(seen $GATED e2-open)" "200 developer $PROJECT_ID ok"
check E2 "envoy denied nothing" "$(envoy_stat hc denied)" "$denied0"

for code in api_key_invalid origin_not_allowed api_key_required; do
  n="$(metric "authsvc_decisions_total{allow=\"true\",result=\"observed:$code\"}")"
  [ "$n" -ge 1 ] && pass "E2 metric authsvc_decisions_total{result=\"observed:$code\",allow=\"true\"} = $n" \
    || fail "E2 no observed:$code metric"
done
n="$(curl -s "$D11_HTTP/metrics" | grep '^authsvc_decisions_total' | grep -c 'allow="false"')"
check E2 "no allow=\"false\" decisions recorded" "$n" 0

info "E2 a restricted key used from the wrong Origin is observed with no project (tier anonymous), so a dark launch cannot tell which project would break"
if grep -q 'sefariaAuthResult' "$REPO/helm-chart/sefaria/conf/nginx.template.conf.tpl"; then
  pass "E2 nginx's structured log carries sefariaAuthResult"
else
  gap D4 "E2 nginx's structured log has no sefariaTier/sefariaProject/sefariaAuthResult, so observe mode's decisions are only in the auth-service metric (helm-chart/sefaria/conf/nginx.template.conf.tpl log_format structured)"
fi

drill_reset
finish
