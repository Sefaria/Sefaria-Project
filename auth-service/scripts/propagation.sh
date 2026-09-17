#!/usr/bin/env bash
# scripts/propagation.sh <push-spec|none> — registry change → enforcement latency at the gateway, plus replica consistency.
set -uo pipefail
PUSH=${1:-redis,http}; H=authpoc.cauldron.sefaria.org
source scripts/keyadmin-run.sh      # defines run() (Task 17 step 4)
pushflag=(); [ "$PUSH" != none ] && pushflag=(--push "$PUSH")
now_ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
wait_for() { # want_code key
  local want=$1 key=$2 t0; t0=$(now_ms)
  while :; do
    local c; c=$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $key" "https://$H/x")
    if [ "$c" = "$want" ]; then echo $(( $(now_ms) - t0 )); return; fi
    if [ $(( $(now_ms) - t0 )) -gt 180000 ]; then echo TIMEOUT; return; fi
    sleep 0.1
  done
}
steady() { local key=$1 want=$2 n=0; for _ in $(seq 1 20); do [ "$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $key" "https://$H/x")" = "$want" ] && n=$((n+1)); done; echo "$n/20"; }
K="sfr_prop$(date +%s | tail -c 6)000000000000000000000000"
printf 'push=%s\n' "$PUSH"
run "${pushflag[@]}" create --project proj_prop --tier developer --key "$K" >/dev/null 2>&1
printf 'create   -> 200 after %s ms; steady %s\n' "$(wait_for 200 "$K")" "$(steady "$K" 200)"
run "${pushflag[@]}" set-tier --project proj_prop --tier partner >/dev/null 2>&1
t0=$(now_ms); while ! kubectl --context gke_development-205018_us-east1-b_cluster-1 -n default logs -l app=nginx-authpoc --since=5s 2>/dev/null | grep -q '"sefariaTier": "partner"'; do curl -s -o /dev/null -H "x-api-key: $K" -H 'x-probe: prop' "https://$H/x"; sleep 0.5; [ $(( $(now_ms) - t0 )) -gt 180000 ] && break; done
printf 'set-tier -> partner after %s ms\n' "$(( $(now_ms) - t0 ))"
NEW=$(run "${pushflag[@]}" rotate --key "$K" 2>/dev/null | grep -m1 '^sfr_')
printf 'rotate   -> old 401 after %s ms, new 200 after %s ms\n' "$(wait_for 401 "$K")" "$(wait_for 200 "$NEW")"
run "${pushflag[@]}" revoke --key "$NEW" >/dev/null 2>&1
printf 'revoke   -> 401 after %s ms; steady %s\n' "$(wait_for 401 "$NEW")" "$(steady "$NEW" 401)"
