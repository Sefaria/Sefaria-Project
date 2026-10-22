#!/usr/bin/env bash
# Curl twin of the gateway Playwright suite (e2e-tests/api-keys/gateway/), for quick reruns by hand.
#
#   a-series.sh [--target local|cauldron]       run the checks; prints one line per check
#   a-series.sh keepunchanged-envoy start|stop  a private Envoy on 127.0.0.1:10090 with KEEP_UNCHANGED for escaped
#                                               slashes (N-A1), beside the stack's own Envoy, which it never touches
#
# Result words: pass, FAIL (a regression or a new bug), GAP (desired behaviour that fails today, tagged with its
# decision). Exit status is the number of FAIL lines. Key values come from the manifest and never reach stdout.
# On the cauldron only the unkeyed checks run unless the manifest was seeded for the cauldron.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib.sh"

D1_DIR="$REPO/.claude/scratch/apikeys-d1"
D1_ENVOY=apikeys-d1-envoy-keepunchanged
D1_PORT=10090
D1_ADMIN=19010

keepunchanged_envoy() {
  case "${1:-}" in
    start)
      mkdir -p "$D1_DIR"
      "$PYTHON" "$STACK_DIR/render_configs.py" "$D1_DIR" --only envoy --envoy-variant keepunchanged || die "render failed"
      docker rm -f "$D1_ENVOY" >/dev/null 2>&1 || true
      docker run -d --rm --name "$D1_ENVOY" --label sefaria-apikeys-d1=1 \
        --network "${PROJECT}_default" --add-host host.docker.internal:host-gateway \
        -p "127.0.0.1:$D1_PORT:10080" -p "127.0.0.1:$D1_ADMIN:19000" \
        -v "$D1_DIR/envoy.yaml:/etc/envoy/envoy.yaml:ro" \
        envoyproxy/envoy:v1.39.1 envoy -c /etc/envoy/envoy.yaml --log-level warn >/dev/null || die "docker run failed"
      for _ in $(seq 1 40); do
        curl -s -m 2 "http://127.0.0.1:$D1_ADMIN/clusters" | grep -q '^authsvc::.*::health_flags::healthy$' && {
          log "private KEEP_UNCHANGED envoy up on 127.0.0.1:$D1_PORT"; return 0; }
        sleep 0.5
      done
      die "private envoy did not see a healthy auth service"
      ;;
    stop) docker rm -f "$D1_ENVOY" >/dev/null 2>&1 || true; log "private envoy removed" ;;
    *) die "usage: a-series.sh keepunchanged-envoy start|stop" ;;
  esac
}

if [ "${1:-}" = keepunchanged-envoy ]; then keepunchanged_envoy "${2:-}"; exit $?; fi

TARGET=local
[ "${1:-}" = --target ] && TARGET="${2:-}"
case "$TARGET" in local|cauldron) ;; *) die "--target must be local or cauldron" ;; esac

MANIFEST="${APIKEYS_MANIFEST:-$REPO/e2e-tests/.apikeys-e2e.json}"
manifest_target="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['target'])" "$MANIFEST" 2>/dev/null || true)"
KEYED=0; [ "$manifest_target" = "$TARGET" ] && KEYED=1

SECRETS="$(mktemp -d)"; chmod 700 "$SECRETS"
trap 'rm -rf "$SECRETS"' EXIT
key_file() {  # writes the manifest key's value to a 0600 file and prints the file name
  local f="$SECRETS/$1.$2"
  python3 -c "import json,sys; m=json.load(open(sys.argv[1])); print([k['value'] for k in m['keys'] if k['suite']==sys.argv[2] and k['name']==sys.argv[3]][0], end='')" \
    "$MANIFEST" "$1" "$2" > "$f" && chmod 600 "$f"; echo "$f"
}
unknown_key() { echo "sfr_$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"; }

if [ "$TARGET" = local ]; then
  base() { echo "http://127.0.0.1:${PORT:-10080}"; }
  hosthdr() { if [ "$1" = bare ]; then echo "Host: gateway.test:${PORT:-10080}"; else echo "Host: $1.gateway.test:${PORT:-10080}"; fi; }
  ROOT=gateway.test
else
  base() { echo "https://$( [ "$1" = bare ] && echo apikeys-pipeline || echo "$1.apikeys-pipeline").cauldron.sefaria.org"; }
  hosthdr() { echo "X-Noop: 1"; }
  ROOT=apikeys-pipeline.cauldron.sefaria.org
fi

# req HOST PATH [curl args...] -> sets STATUS, CODE, BODY (masked)
req() {
  local h="$1" p="$2"; shift 2
  local url
  if [ "$TARGET" = local ]; then url="$(base)$p"; else url="$(base "$h")$p"; fi
  local out; out="$(curl -s -k --path-as-is -m 30 -o "$SECRETS/body" -w '%{http_code}' -H "$(hosthdr "$h")" "$@" "$url")"
  STATUS="$out"
  BODY="$(head -c 400 "$SECRETS/body" | sed -E 's/sfr_[A-Za-z0-9_-]+/sfr_…/g' | tr '\n' ' ')"
  CODE="$(python3 -c "import json,sys
try: print(json.load(open(sys.argv[1])).get('code',''))
except Exception: print('')" "$SECRETS/body")"
}
stamp() {  # tier/project/result as the echo upstream saw them
  python3 -c "import json,sys
h=json.load(open(sys.argv[1]))['request']['headers']
print(h.get('x-sefaria-tier'), repr(h.get('x-sefaria-project')), h.get('x-sefaria-auth-result'))" "$SECRETS/body" 2>/dev/null
}

fails=0
line() { printf '%-6s %-4s %s\n' "$1" "$2" "$3"; [ "$2" = FAIL ] && fails=$((fails + 1)); return 0; }
expect() {  # expect ID WANT_STATUS WANT_CODE GAP_TAG DESCRIPTION
  local id="$1" ws="$2" wc="$3" gap="$4" what="$5"
  if [ "$STATUS" = "$ws" ] && { [ -z "$wc" ] || [ "$CODE" = "$wc" ]; }; then line "$id" pass "$what -> $STATUS $CODE"
  elif [ -n "$gap" ]; then line "$id" GAP "$what -> $STATUS $CODE (want $ws $wc; $gap)"
  else line "$id" FAIL "$what -> $STATUS $CODE (want $ws $wc) $BODY"; fi
}

G=/api/knn-search
U=/api/v3/texts/Genesis.1.1

# Unkeyed: both targets.
req www $G;                          expect A4a 401 api_key_required "" "GET gated, no key"
req www $G -X POST -d '{}';          expect A4a 401 api_key_required "" "POST gated, no key"
req www $G -H 'Authorization: Bearer x.y.z'; expect A4b 401 api_key_required "" "gated, Bearer only"
req www $G -X OPTIONS;               expect A5b 401 api_key_required "" "OPTIONS gated, no Origin"
req www $G -H "x-api-key: $(unknown_key)"; expect A2a 401 api_key_invalid "" "gated, unknown sfr_ key"
req www $U -H "x-api-key: $(unknown_key)"; expect A2b 200 "" "D2" "ungated, unknown sfr_ key"
req www $G -H 'x-api-key;';          expect A2c 401 api_key_required "" "gated, empty x-api-key"
for p in '/api/%6bnn-search' '//api/knn-search' '/api/./knn-search' '/api/knn%2Dsearch' '/api/knn-search/' \
         '/api/knn-search-v2' '/api/knn-search?x=1' '/api/../api/knn-search'; do
  req www "$p";                      expect A6a 401 api_key_required "" "gated variant $p"
done
req www '/api%2Fknn-search';         expect A6a 307 "" "" "/api%2Fknn-search redirects (UNESCAPE_AND_REDIRECT)"
req www '/API/knn-search';           expect A6c 404 "" "" "/API/knn-search is Django's 404, not a bypass"
for p in '/api/knn-search%zz' '/api/%6bnn-search%' '/api/knn-search;x'; do
  req www "$p";                      expect N-CR9 401 api_key_required "" "malformed $p"
done
req www '/api/%256bnn-search';       expect N-CR9 404 "" "" "double-encoded /api/%256bnn-search reaches Django as another path"
for h in bare voices; do
  req $h $G;                         expect N-A8 401 api_key_required "" "gated on host $h"
done
req bare /texts;                     expect N-A8 301 "" "" "allowed request on the bare host gets nginx's 301"
for code in api_key_required api_key_invalid origin_not_allowed; do
  s="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://developers.sefaria.org/#$code")"
  [ "$s" = 200 ] && line N-CR10 pass "#$code -> $s" || line N-CR10 GAP "#$code -> $s (want 200; N-CR10)"
done

if [ "$TARGET" = cauldron ]; then
  s="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "http://www.$ROOT$G")"
  line N-A2 info "plain http:// on the gated path -> $s (reaches the route without a redirect when not 301/308)"
  ctp="$(kubectl --context "${APIKEYS_KUBE_CONTEXT:-gke_development-205018_us-east1-b_cluster-1}" -n default get clienttrafficpolicy \
    apikeys-pipeline -o jsonpath='{.status.ancestors[0].conditions[?(@.type=="Accepted")].status}' 2>/dev/null)"
  [ "$ctp" = True ] && line N-A2 pass "ClientTrafficPolicy Accepted=$ctp" || line N-A2 GAP "ClientTrafficPolicy Accepted=$ctp (want True; N-A2)"
fi

if [ "$KEYED" = 1 ]; then
  OPEN="$(key_file gateway open)"; RESTR="$(key_file gateway restricted)"; REV="$(key_file gateway revoked)"
  req www $U -H "x-api-key: $(cat "$OPEN")";  expect A1 200 "" "" "ungated, valid open key"
  req www $U -H "x-api-key: $(cat "$REV")";   expect A2b 200 "" "D2" "ungated, revoked key"
  req www $G -H "x-api-key: $(cat "$REV")";   expect A2b 401 api_key_invalid "" "gated, revoked key"
  req www $U -H "x-api-key: $(cat "$RESTR")" -H 'Origin: https://site-a.example.com'; expect A3a 200 "" "" "restricted key, its Origin"
  for o in https://site-b.example.com null https://SITE-A.example.com https://site-a.example.com:443 \
           https://site-a.example.com/ http://site-a.example.com https://www.site-a.example.com; do
    req www $U -H "x-api-key: $(cat "$RESTR")" -H "Origin: $o"; expect A3b 403 origin_not_allowed "" "restricted key, Origin $o"
  done
  req www $U -H "x-api-key: $(cat "$RESTR")";  expect A3b 403 origin_not_allowed "" "restricted key, no Origin"
  req www $U -H "x-api-key: $(cat "$OPEN")" -H "x-api-key: $(cat "$OPEN")"; expect A2d 200 "" "D2" "ungated, the key twice"
  req www $G -H "x-api-key: $(cat "$OPEN")" -H "x-api-key: $(cat "$OPEN")"; expect A2d 401 api_key_invalid "" "gated, the key twice"
  req www $G -X POST -H "x-api-key: $(cat "$OPEN")" -H 'Authorization: Bearer nope' -d '{}'
  [ "$STATUS" = 401 ] && [ "$CODE" = "" ] && line A4c pass "key + wrong Bearer -> Django's own 401: $BODY" || line A4c FAIL "-> $STATUS $BODY"
  req www $G -H "X-API-KEY: $(cat "$OPEN")" -X POST -d '{}'
  [ "$CODE" = "" ] && line N-A7 pass "X-API-KEY passes the gateway -> $STATUS" || line N-A7 FAIL "-> $STATUS $CODE"
  req www $G -H "x-api-key: $(cat "$OPEN" | sed 's/^\(.\{10\}\)/\1 /')"; expect N-A7 401 api_key_invalid "" "key with an inner space"
  req www "$G?api_key=$(cat "$OPEN")";        expect N-A6 401 api_key_required "" "?api_key= on the gated path"
  if [ "$TARGET" = local ]; then
    req echo $U -H "x-api-key: $(cat "$OPEN")"; line A1 info "echo stamp: $(stamp)"
    req echo $U -H 'x-sefaria-tier: partner' -H 'x-sefaria-project: 999' -H 'x-sefaria-auth-result: ok'
    [ "$(stamp)" = "anonymous '' anonymous" ] && line A7 pass "spoof on :10080 overwritten: $(stamp)" || line A7 FAIL "spoof survived: $(stamp)"
    PORT=10081 req echo $U -H 'x-sefaria-tier: partner' -H 'x-sefaria-project: 999' -H 'x-sefaria-auth-result: ok'
    [ "$(stamp)" = "anonymous '' anonymous" ] && line N-A3 pass "spoof on :10081 overwritten: $(stamp)" || line N-A3 FAIL "spoof survived: $(stamp)"
    req echo "$U?api_key=$(cat "$OPEN")&a=1"
    url="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['http']['originalUrl'])" "$SECRETS/body")"
    case "$url" in *api_key*) line N-A6 FAIL "upstream URL kept api_key" ;; *) line N-A6 pass "upstream URL: $url" ;; esac
  fi
fi

if [ "$TARGET" = local ] && docker ps --format '{{.Names}}' | grep -qx "$D1_ENVOY"; then
  for p in '/api%2Fknn-search' '/api%2fknn-search' '/x/..%2Fapi/knn-search'; do
    PORT=$D1_PORT req www "$p"; expect N-A1 401 api_key_required "" "KEEP_UNCHANGED $p"
  done
else
  [ "$TARGET" = local ] && line N-A1 skip "start the private envoy first: a-series.sh keepunchanged-envoy start"
fi

exit "$fails"
