#!/usr/bin/env bash
# F1: stop the auth service while requests to the gated path loop. Desired (fail-open kept): the gated path is open
# only while it is down, Envoy's failure_mode_allowed rises, deciding resumes within readiness plus 5 s, and
# ungated traffic is unchanged.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

DOWN_FOR="${DOWN_FOR:-6}"
drill_up
new_key f1
wait_for 5 'test "$(gw $GW_HC $GATED f1)" = 200' >/dev/null
check F1 "before: gated path without a key" "$(gw $GW_HC $GATED)" 401
check F1 "before: gated path with a key" "$(gw $GW_HC $GATED f1)" 200

fma0="$(envoy_stat hc failure_mode_allowed)"
probe_start f1-gated $GW_HC $GATED
probe_start f1-ungated $GW_HC /api/texts/Genesis.1.1
probe_start f1-keyed $GW_HC $GATED f1
sleep 2

t_stop="$(now)"
dcompose stop -t 10 authsvc >/dev/null 2>&1
t_stopped="$(now)"
sleep "$DOWN_FOR"
t_start="$(now)"
dcompose start authsvc >/dev/null 2>&1
wait_for 30 'test "$(readyz)" = 200' >/dev/null
t_ready="$(now)"
wait_for 30 'test "$(gw $GW_HC $GATED)" = 401' >/dev/null
t_decide="$(now)"
sleep 5
probe_stop f1-gated; probe_stop f1-ungated; probe_stop f1-keyed
fma1="$(envoy_stat hc failure_mode_allowed)"

info "F1 stop took $(fsub "$t_stopped" "$t_stop")s; down ${DOWN_FOR}s; ready $(fsub "$t_ready" "$t_start")s after start; deciding $(fsub "$t_decide" "$t_ready")s after ready"
open_before="$(probe_count f1-gated 200 0 "$t_stop")"
open_during="$(probe_count f1-gated 200 "$t_stop" "$t_decide")"
check F1 "gated path closed before the stop" "$open_before" 0
# After the restart Envoy's per-worker gRPC connections to the auth service come back one by one, so a request can
# still fail open for up to a second or so after the first decision (fail-open by design). The check: from 2 s after
# the first decision the gated path is closed for good; opens inside that settling window are reported.
SETTLE=2
t_closed="$(python3 -c "print($t_decide + $SETTLE)")"
settling="$(probe_count f1-gated 200 "$t_decide" "$t_closed")"
open_after="$(probe_count f1-gated 200 "$t_closed")"
info "F1 $settling request(s) still failed open in the ${SETTLE}s after the first decision (Envoy reconnecting per worker)"
check F1 "gated path closed from ${SETTLE}s after deciding resumed" "$open_after" 0
[ "$open_during" -gt 0 ] && pass "F1 gated path fails open while down ($open_during requests)" \
  || fail "F1 gated path never opened while down (fail-open expected)"
first_open="$(probe_first_after f1-gated 200 "$t_stop")"
[ -n "$first_open" ] && info "F1 first open request $(fsub "$first_open" "$t_stop")s after the stop began"
[ "$fma1" -gt "$fma0" ] && pass "F1 envoy failure_mode_allowed rises ($fma0 -> $fma1)" || fail "F1 failure_mode_allowed did not rise ($fma0 -> $fma1)"
gap_s="$(fsub "$t_decide" "$t_ready")"
python3 -c "import sys; sys.exit(0 if $gap_s <= 5 else 1)" && pass "F1 deciding resumes within readiness + 5 s (${gap_s}s)" \
  || fail "F1 deciding resumed ${gap_s}s after readiness (want <= 5 s)"
total_u="$(probe_total f1-ungated)"; ok_u="$(probe_count f1-ungated 200)"
check F1 "ungated traffic unchanged (all 200)" "$ok_u" "$total_u"
total_k="$(probe_total f1-keyed)"; ok_k="$(probe_count f1-keyed 200)"
check F1 "keyed gated traffic never denied" "$ok_k" "$total_k"
other="$(awk '$2 != 200 && $2 != 401' "$D11_DIR/probe/f1-gated.log" | wc -l | tr -d ' ')"
check F1 "no 5xx or connection errors on the gated path" "$other" 0

finish
