#!/usr/bin/env bash
# scripts/matrix-key.sh <host> — developer-key sub-arms against the cauldron; prints status and body code.
set -uo pipefail
H=${1:-authpoc.cauldron.sefaria.org}
ALPHA=sfr_alpha000000000000000000000000001; BETA=sfr_beta0000000000000000000000000001
REVOKED=sfr_revoked00000000000000000000001; UNKNOWN=sfr_unknown00000000000000000000001
probe() { # name, curl args...
  local name=$1; shift
  local out; out=$(curl -s -w '\n%{http_code}' "https://$H/api/texts/Genesis.1" -H "x-probe: $name" "$@")
  local code=${out##*$'\n'}; local body=${out%$'\n'*}
  local err; err=$(jq -r '.code // "-"' <<<"$body" 2>/dev/null || echo "-")
  printf '%-28s %s code=%s\n' "$name" "$code" "$err"
}
probe valid                  -H "x-api-key: $ALPHA"
probe valid-spoofed-tier     -H "x-api-key: $ALPHA" -H 'x-sefaria-tier: partner' -H 'x-sefaria-project: proj_evil' -H 'x-sefaria-auth-result: ok'
probe unknown                -H "x-api-key: $UNKNOWN"
probe revoked                -H "x-api-key: $REVOKED"
probe anonymous
probe anonymous-spoofed      -H 'x-sefaria-tier: partner' -H 'x-sefaria-project: proj_evil'
probe embed                  -H 'Origin: https://embed-one.example.org'
probe origin-ok              -H "x-api-key: $BETA" -H 'Origin: https://beta.example.org'
probe origin-wrong           -H "x-api-key: $BETA" -H 'Origin: https://evil.example.org'
probe origin-none-server     -H "x-api-key: $BETA"
probe query-param-stripped   -H "x-api-key: $ALPHA" -G --data-urlencode "api_key=$ALPHA" --data-urlencode "x=1"
probe gated-no-key           -X POST -o /dev/null
