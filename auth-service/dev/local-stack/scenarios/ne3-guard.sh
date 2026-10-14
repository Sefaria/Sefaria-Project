#!/usr/bin/env bash
# N-E3: every key hard-deleted. Desired: the first empty load is rejected, keys stay valid for about one or two
# reload intervals, then the empty load is applied with a WARN, and reload_total{result="rejected_empty"} counts it.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

INTERVAL=5
drill_up RELOAD_INTERVAL=${INTERVAL}s
new_key ne3
wait_for 5 'test "$(gw $GW_HC $GATED ne3)" = 200' >/dev/null
rej0="$(metric 'authsvc_reload_total{result="rejected_empty"}')"
probe_start ne3-keyed $GW_HC $GATED ne3
sleep 1
t_del="$(now)"
psql_su -c "DELETE FROM powered_by_apikey" >/dev/null
t_empty="$(wait_for 30 'test "$(registry_field len)" = 0')"
sleep 1
probe_stop ne3-keyed
rej1="$(metric 'authsvc_reload_total{result="rejected_empty"}')"

[ "$rej1" -gt "$rej0" ] && pass "N-E3 rejected_empty counted ($rej0 -> $rej1)" || fail "N-E3 rejected_empty not counted"
last_ok="$(probe_last ne3-keyed 200)"; first_deny="$(probe_first_after ne3-keyed 401 "$t_del")"
valid_for="$(fsub "$last_ok" "$t_del")"
info "N-E3 deleted keys stayed valid ${valid_for}s; the empty set was applied ${t_empty}s after the delete (interval ${INTERVAL}s)"
python3 -c "import sys; v=$valid_for; sys.exit(0 if 0.5 <= v <= 2.5 * $INTERVAL else 1)" \
  && pass "N-E3 deleted keys stay valid for about one or two intervals (${valid_for}s)" \
  || fail "N-E3 deleted keys stayed valid ${valid_for}s (want 0.5 s to $((INTERVAL * 5 / 2)) s)"
[ -n "$first_deny" ] && pass "N-E3 deleted key denied once the empty set applied" || fail "N-E3 deleted key never denied"
dcompose logs --no-log-prefix --since 1m authsvc 2>&1 | grep -q 'empty registry reload applied' \
  && pass "N-E3 WARN logged when the empty set is applied" || fail "N-E3 no WARN for the applied empty set"
check N-E3 "readiness unaffected" "$(readyz)" 200

seed_project; new_key baseline
drill_reset
finish
