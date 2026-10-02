#!/usr/bin/env bash
# scripts/matrix-jwt.sh <host> — first-party sub-arms; tokens from the in-cluster mint via port-forward 18081.
set -uo pipefail
H=${1:-authpoc.cauldron.sefaria.org}
tok() { curl -s "localhost:18081/token?sub=sefaria-web&tier=firstparty&ttl=3600&$1" | jq -r .token; }
probe() { local name=$1; shift
  local out; out=$(curl -s -w '\n%{http_code}' "https://$H/api/texts/Genesis.1" -H "x-probe: $name" "$@")
  printf '%-22s %s code=%s\n' "$name" "${out##*$'\n'}" "$(jq -r '.code // "-"' <<<"${out%$'\n'*}" 2>/dev/null || echo -)"; }
probe jwt-valid           -H "Authorization: Bearer $(tok '')"
probe jwt-valid-cookie    -H "Cookie: sefaria_jwt=$(tok '')"
probe jwt-expired         -H "Authorization: Bearer $(tok 'bad=expired')"
probe jwt-bad-signature   -H "Authorization: Bearer $(tok 'bad=sig')"
probe jwt-garbage         -H 'Authorization: Bearer not.a.jwt'
probe jwt-missing
probe jwt-missing-spoofed -H 'x-sefaria-tier: firstparty' -H 'x-sefaria-project: sefaria-web'
probe jwt-valid-spoofed   -H "Authorization: Bearer $(tok '')" -H 'x-sefaria-tier: partner'
