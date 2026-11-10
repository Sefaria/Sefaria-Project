#!/usr/bin/env bash
# N-F2: the auth service is paused for longer than the 200 ms ext_authz timeout. Desired: requests fail open
# within the timeout, and deciding comes back when it is unpaused.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

PAUSE_FOR="${PAUSE_FOR:-3}"
drill_up
new_key nf2
fma0="$(envoy_stat hc failure_mode_allowed)"
probe_start nf2-gated $GW_HC $GATED
probe_start nf2-keyed $GW_HC $GATED nf2
sleep 1.5
t_pause="$(now)"
dcompose pause authsvc >/dev/null 2>&1
sleep "$PAUSE_FOR"
dcompose unpause authsvc >/dev/null 2>&1
t_unpause="$(now)"
sleep 3
probe_stop nf2-gated; probe_stop nf2-keyed
fma1="$(envoy_stat hc failure_mode_allowed)"

open="$(probe_count nf2-gated 200 "$t_pause" "$t_unpause")"
[ "$open" -gt 0 ] && pass "N-F2 gated path fails open while paused ($open requests)" || fail "N-F2 gated path did not fail open while paused"
max_ms="$(awk -v a="$t_pause" -v b="$t_unpause" '$1 >= a && $1 <= b && $3 > m {m = $3} END {printf "%.0f", m}' "$D11_DIR/probe/nf2-gated.log")"
python3 -c "import sys; sys.exit(0 if $max_ms < 400 else 1)" && pass "N-F2 paused requests answer within the timeout plus overhead (max ${max_ms} ms)" \
  || fail "N-F2 a paused request took ${max_ms} ms (want < 400)"
[ "$fma1" -gt "$fma0" ] && pass "N-F2 failure_mode_allowed rises ($fma0 -> $fma1)" || fail "N-F2 failure_mode_allowed flat"
after="$(probe_count nf2-gated 200 "$(python3 -c "print($t_unpause + 1)")")"
check N-F2 "deciding is back 1 s after unpause (no more open requests)" "$after" 0
check N-F2 "valid key never denied" "$(probe_count nf2-keyed 401)" 0
other="$(cat "$D11_DIR"/probe/nf2-*.log | awk '$2 != 200 && $2 != 401' | wc -l | tr -d ' ')"
check N-F2 "no 5xx or connection errors" "$other" 0
authsvc_endpoint_healthy && pass "N-F2 envoy kept the endpoint healthy (pause shorter than 3 failed checks)" \
  || info "N-F2 envoy marked the endpoint unhealthy"
finish
