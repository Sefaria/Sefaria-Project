#!/usr/bin/env bash
# F3: kill the auth service's LISTEN backend. Desired: the listener reconnects (1-30 s backoff) and reloads, and a
# revoke made in the gap applies within 60 s. RELOAD_INTERVAL is 1h here, so only the reconnect path can apply it.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up RELOAD_INTERVAL=1h
new_key f3
wait_for 5 'test "$(gw $GW_HC $GATED f3)" = 200' >/dev/null
check F3 "key works before" "$(gw $GW_HC $GATED f3)" 200
listeners() { psql_su -c "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'authsvc-listener'"; }
check F3 "one listener backend" "$(listeners)" 1

t0="$(now)"
psql_su -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'authsvc-listener'" >/dev/null
revoke_key f3
t_rev="$(now)"
t_back="$(wait_for 40 'test "$(listeners)" = 1')"
info "F3 listener backend back after ${t_back}s"
t_applied="$(wait_for 60 'test "$(gw $GW_HC $GATED f3)" = 401')"
if [ "$t_applied" != timeout ]; then
  pass "F3 revoke made while the listener was down applied ${t_applied}s later (want <= 60 s)"
else
  fail "F3 revoke made while the listener was down not applied within 60 s"
fi
check F3 "revoked key's code" "$(gw_code $GW_HC $GATED f3)" api_key_invalid
logs="$(dcompose logs --no-log-prefix --since 2m authsvc 2>&1)"
echo "$logs" | grep -q 'postgres listener.*err' && pass "F3 the listener error is logged" || fail "F3 no listener error in the log"
[ "$(echo "$logs" | grep -c 'postgres listener established')" -ge 2 ] && pass "F3 the listener re-established" \
  || fail "F3 no second 'listener established' line"
check F3 "readiness unaffected" "$(readyz)" 200

finish
