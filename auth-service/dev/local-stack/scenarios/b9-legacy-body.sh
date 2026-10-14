#!/usr/bin/env bash
# B9: a legacy write with the Mongo API key in the form body (POST /api/links, apikey=...), through the shared
# stack's gateway (Envoy -> nginx -> Django :8100). Desired: it works, and the gateway never sees the body.
# Fixtures: a synthetic user (2_098_000_971) and its legacy key, a link between two scratch refs marked with
# generated_by; all removed at the end. Reads the shared stack; writes only those rows.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

URL=http://www.gateway.test:10080/api/links/
RESOLVE=(--resolve www.gateway.test:10080:127.0.0.1)
SECRETS="$(mktemp -d)"; chmod 700 "$SECRETS"
b9() { (cd "$REPO" && D11_B9_MODE="$1" D11_B9_KEY_FILE="$SECRETS/key" django_env "$PYTHON" manage.py shell \
  <"$SCEN_DIR/b9_legacy.py" 2>"$SECRETS/shell.err" | grep '^D11B9'); }
teardown() { info "B9 teardown: $(b9 teardown)"; rm -rf "$SECRETS"; }
trap teardown EXIT

[ "$(http_code http://127.0.0.1:18080/readyz)" = 200 ] || die "the shared stack's auth service is not ready"
( umask 077; printf 'sfr_legacyd11%s' "$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 24)" >"$SECRETS/key" )
before="$(b9 inspect)"
case "$before" in *"pair=0"*) ;; *) die "a link between the scratch refs already exists ($before); pick other refs" ;; esac
b9 setup >/dev/null || { cat "$SECRETS/shell.err" | tail -5; die "setup failed"; }

grep -q 'with_request_body' "$STATE_DIR/run/envoy.yaml" && fail "B9 the gateway's ext_authz is configured to buffer the body" \
  || pass "B9 the gateway's ext_authz has no with_request_body: the auth service only sees headers"
ok0="$(curl -s 'http://127.0.0.1:19000/stats?filter=^http\.strip_on\.ext_authz\.ok$' | awk -F': ' '{print $2}')"
LINK='{"refs": ["Obadiah 1:21", "Song of Songs 8:14"], "type": "related", "generated_by": "apikeys-e2e-d11-b9", "auto": true}'
status="$(curl -s "${RESOLVE[@]}" -o "$SECRETS/body" -w '%{http_code}' -m 60 -X POST "$URL" \
  --data-urlencode "apikey@$SECRETS/key" --data-urlencode "json=$LINK")"
body="$(head -c 300 "$SECRETS/body" | mask)"
ok1="$(curl -s 'http://127.0.0.1:19000/stats?filter=^http\.strip_on\.ext_authz\.ok$' | awk -F': ' '{print $2}')"
check B9 "POST /api/links with apikey in the body: HTTP status" "$status" 200
case "$body" in *'"status": "ok"'*|*'"status":"ok"'*) pass "B9 Django saved the link ($body)" ;; *) fail "B9 Django did not save the link: $body" ;; esac
after="$(b9 inspect)"
case "$after" in *"links=1 "*) pass "B9 the marker link is in Mongo ($after)" ;; *) fail "B9 marker link not found ($after)" ;; esac
case "$after" in *"history=0"*) fail "B9 no history row for the synthetic user" ;; *) pass "B9 the write is attributed to the key's user in history" ;; esac
[ "$((ok1 - ok0))" -ge 1 ] && pass "B9 ext_authz allowed the request as an ordinary keyless POST (strip_on ext_authz.ok +$((ok1 - ok0)))" \
  || fail "B9 ext_authz did not record the request"
finish
