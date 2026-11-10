#!/usr/bin/env bash
# F4: rotate the reader role's password with no restart. Desired: reload errors are visible (reload_total{error},
# a last-reload-age metric or an alert), and revoked keys do not stay valid silently.
# Existing sessions survive a password change, so the drill also ends the role's backends, as a Postgres restart
# or failover would.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up RELOAD_INTERVAL=5s
new_key f4
wait_for 5 'test "$(gw $GW_HC $GATED f4)" = 200' >/dev/null
check F4 "key works before" "$(gw $GW_HC $GATED f4)" 200
err0="$(metric 'authsvc_reload_total{result="error"}')"

restore() { psql_su -c "ALTER ROLE auth_service_reader PASSWORD 'reader'" >/dev/null; }
trap restore EXIT
psql_su -c "ALTER ROLE auth_service_reader PASSWORD 'rotated'" >/dev/null
sleep 6
check F4 "with live sessions a revoke still applies (pooled connections keep their auth)" \
  "$(revoke_key f4; wait_for 8 'test "$(gw $GW_HC $GATED f4)" = 401' >/dev/null; gw $GW_HC $GATED f4)" 401

new_key f4b
sleep 2
psql_su -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'auth_service_reader'" >/dev/null
sleep 1
revoke_key f4b
sleep 12
err1="$(metric 'authsvc_reload_total{result="error"}')"
[ "$err1" -gt "$err0" ] && pass "F4 reload_total{result=\"error\"} rises ($err0 -> $err1)" || fail "F4 reload errors not counted ($err0 -> $err1)"
status="$(gw $GW_HC $GATED f4b)"
if [ "$status" = 401 ]; then
  pass "F4 a key revoked after the rotation is denied"
else
  gap F4 "a key revoked after the rotation stays valid ($status) while every reload fails"
fi
r="$(readyz)"
if [ "$r" != 200 ]; then
  pass "F4 readiness reflects failing reloads ($r)"
else
  # Ready stays 200 by design (fail open); the failure must then be visible as a stale last-success timestamp that the
  # chart's AuthServiceRegistryStale alert reads.
  last="$(metric authsvc_registry_last_reload_success_timestamp_seconds)"
  age="$(python3 -c "import time; print(int(time.time() - float('$last')))" 2>/dev/null || echo -1)"
  if [ "$last" != 0 ] && [ "$age" -ge 10 ]; then
    pass "F4 /readyz stays 200, and authsvc_registry_last_reload_success_timestamp_seconds is ${age}s old while reloads fail"
  else
    gap F4 "/readyz stays 200 while reloads fail and the last-success timestamp does not show it (value $last, age ${age}s)"
  fi
  if grep -q 'alert: AuthServiceRegistryStale' "$REPO/helm-chart/sefaria/templates/authservice/prometheusrule.yaml" 2>/dev/null; then
    pass "F4 the chart has an alert on that timestamp (AuthServiceRegistryStale)"
  else
    gap F4 "the chart has no alert rule on a stale registry"
  fi
fi
dcompose logs --no-log-prefix --since 3m authsvc 2>&1 | grep -q 'reload skipped' && pass "F4 'reload skipped' is logged" || fail "F4 no reload warning logged"

restore
t="$(wait_for 20 'test "$(gw $GW_HC $GATED f4b)" = 401')"
[ "$t" != timeout ] && pass "F4 after restoring the password the revoke applies (${t}s)" || fail "F4 revoke not applied after restoring the password"
drill_reset
finish
