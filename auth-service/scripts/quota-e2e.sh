#!/usr/bin/env bash
# End-to-end checks on the authpoc cauldron for the gateway, the monthly quota and the x-sefaria-* strip.
# Dev cluster only; touches only authpoc. Needs authpoc values with meters.probe=/api/shape/ and a developer quota of 6.
#   quota-e2e.sh           gate, JWT, quota and redirect checks (each run spends one quota on fresh test subjects)
#   quota-e2e.sh --drill   also scales the auth service to 0 for the fail-open strip check, then back to 1
# Prints PASS/FAIL per check and exits non-zero on any FAIL.
set -u
DRILL=0; [ "${1:-}" = "--drill" ] && DRILL=1
CTX=gke_development-205018_us-east1-b_cluster-1
K="kubectl --context $CTX -n default"
H=https://www.authpoc.cauldron.sefaria.org
TS=$(date +%s)
TMP=$(mktemp -d); BODY="$TMP/body"
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1"; fail=$((fail+1)); }
code() { curl -s -o "$BODY" -w '%{http_code}' "$@"; }
nginx_pod() { $K get pods -l deployEnv=authpoc -o name | grep nginx | head -1; }
nginx_line() { $K logs "$(nginx_pod)" --since=3m 2>/dev/null | grep -F "$1" | tail -1; }

# --- gate ---------------------------------------------------------------------------------------------------------
c=$(code "$H/api/knn-search"); grep -q api_key_required "$BODY" && [ "$c" = 401 ] \
  && ok "G1 knn-search without a key -> 401 api_key_required" || bad "G1 knn-search without a key -> $c $(head -c 120 "$BODY")"
c=$(code -H "x-api-key: sfr_e2e$(openssl rand -hex 14)" "$H/api/knn-search"); grep -q api_key_invalid "$BODY" && [ "$c" = 401 ] \
  && ok "G2 knn-search with an unknown sfr_ key -> 401 api_key_invalid" || bad "G2 unknown key -> $c"
c=$(code "$H/api/v3/texts/Genesis.1.1"); [ "$c" = 200 ] && ok "G3 anonymous ungated read -> 200" || bad "G3 anonymous read -> $c"
c=$(curl -s -o /dev/null -w '%{http_code}' "http://www.authpoc.cauldron.sefaria.org/api/knn-search"); [ "$c" = 301 ] \
  && ok "G4 plain HTTP -> 301 (no app, no auth on port 80)" || bad "G4 plain HTTP -> $c"

# --- mint stub tokens -----------------------------------------------------------------------------------------------
PORT=$((18100 + RANDOM % 800))
$K port-forward svc/mint-authpoc "$PORT":8081 >/dev/null 2>&1 & PF=$!
trap 'kill $PF 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 3
tok() { curl -s "http://127.0.0.1:$PORT/token?sub=$1&tier=$2" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])'; }

SUBF="e2e-fp-$TS"; T=$(tok "$SUBF" firstparty)
c=$(code -A "e2e-jwt-$TS" -H "authorization: Bearer $T" "$H/api/shape/Leviticus"); sleep 4
L=$(nginx_line "e2e-jwt-$TS")
[ "$c" = 200 ] && echo "$L" | grep -q "\"sefariaTier\": *\"firstparty\"" && echo "$L" | grep -q "\"sefariaProject\": *\"$SUBF\"" \
  && echo "$L" | grep -q "\"sefariaMeter\": *\"probe\"" \
  && ok "J1 first-party JWT on a metered path -> 200; nginx sees tier=firstparty, project=sub, meter=probe" \
  || bad "J1 JWT -> $c; nginx: ${L:0:400}"

# --- monthly quota: developer tier, probe meter, 6 a month (the per-minute limit is 10) --------------------------------
SUBQ="e2e-quota-$TS"; T=$(tok "$SUBQ" developer); codes=""
for i in 1 2 3 4 5 6 7; do codes="$codes $(code -D "$TMP/h$i" -H "authorization: Bearer $T" "$H/api/shape/Genesis")"; done
last=$(cat "$BODY")
[ "$codes" = " 200 200 200 200 200 200 429" ] && echo "$last" | grep -q '"meter":"probe"' \
  && ok "Q1 monthly quota: 6 x 200 then 429 with meter=probe" || bad "Q1 quota codes:$codes body: ${last:0:200}"
grep -qi 'x-ratelimit-limit:.*;w=2592000' "$TMP/h1" \
  && ok "Q1w the quota window is 2592000 s (30 days, epoch-aligned), per x-ratelimit-limit" \
  || bad "Q1w no 30-day window in x-ratelimit-limit: $(grep -i x-ratelimit-limit "$TMP/h1")"
c=$(code -H "authorization: Bearer $T" "$H/api/v3/texts/Exodus.1.1"); [ "$c" = 200 ] \
  && ok "Q2 same caller on an unmetered path -> 200 (quota is per meter)" || bad "Q2 unmetered after quota -> $c"
T2=$(tok "e2e-quota2-$TS" developer); c=$(code -H "authorization: Bearer $T2" "$H/api/shape/Genesis"); [ "$c" = 200 ] \
  && ok "Q3 another project on the same tier -> 200 (counted per project)" || bad "Q3 other project -> $c"
T3=$(tok "e2e-quota3-$TS" internal); codes=""
for i in 1 2 3 4 5 6 7 8; do codes="$codes $(code -H "authorization: Bearer $T3" "$H/api/shape/Genesis")"; done
echo "$codes" | grep -q 429 && bad "Q4 tier internal hit a limit:$codes" || ok "Q4 tier internal: 8 x 200, no monthly rule"

# --- policies -------------------------------------------------------------------------------------------------------
acc=$($K get clienttrafficpolicy authpoc -o jsonpath='{range .status.ancestors[*]}{.ancestorRef.sectionName}={.conditions[?(@.type=="Accepted")].status} {end}')
echo "$acc" | grep -q "=False" || [ -z "$acc" ] && bad "P1 ClientTrafficPolicy: ${acc:-no status}" \
  || ok "P1 ClientTrafficPolicy accepted per HTTPS listener: $acc"

# --- header strip under fail-open (drill: auth service at 0 replicas) -------------------------------------------------
if [ "$DRILL" = 1 ]; then
  $K scale deploy/authpoc-auth-service --replicas=0 >/dev/null
  for i in $(seq 1 20); do [ -z "$($K get pods -l app=auth-service-authpoc -o name 2>/dev/null)" ] && break; sleep 3; done
  c=$(code -A "e2e-spoof-$TS" -H "x-sefaria-tier: internal" -H "x-sefaria-project: spoofed" -H "x-sefaria-meter: none" \
    -H "x-sefaria-auth-result: ok" "$H/api/shape/Numbers"); sleep 4
  L=$(nginx_line "e2e-spoof-$TS")
  $K scale deploy/authpoc-auth-service --replicas=1 >/dev/null; $K rollout status deploy/authpoc-auth-service --timeout=180s >/dev/null 2>&1
  if [ "$c" = 200 ] && ! echo "$L" | grep -qE 'internal|spoofed'; then
    ok "S1 auth service down: fail-open 200, spoofed x-sefaria-* stripped at the listener"
  else bad "S1 strip under fail-open -> $c; nginx: ${L:0:400}"; fi
  $K get deploy authpoc-auth-service -o jsonpath='{.status.readyReplicas}' | grep -q 1 && ok "S2 auth service restored (1/1)" \
    || bad "S2 auth service not ready after the drill"
else
  echo "SKIP  S1/S2 fail-open strip drill (pass --drill)"
fi

echo "--- $pass passed, $fail failed"
[ "$fail" = 0 ]
