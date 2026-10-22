#!/usr/bin/env bash
# N-E4: the reader role lacks SELECT (deleted_at) on powered_by_project, as a role provisioned before that grant.
# Desired: reloads fail visibly (readiness or a metric, plus an alert), on a running service and at startup.
# The cauldron half (read-only \dp on dev) belongs to the cauldron runner.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up RELOAD_INTERVAL=5s
new_key ne4
wait_for 5 'test "$(gw $GW_HC $GATED ne4)" = 200' >/dev/null
restore() { psql_su -c "GRANT SELECT (deleted_at) ON powered_by_project TO auth_service_reader" >/dev/null; }
trap restore EXIT
err0="$(metric 'authsvc_reload_total{result="error"}')"
psql_su -c "REVOKE SELECT (deleted_at) ON powered_by_project FROM auth_service_reader" >/dev/null

# A running service: the next reload fails; a revoke made now should not stay valid silently.
revoke_key ne4
sleep 11
err1="$(metric 'authsvc_reload_total{result="error"}')"
[ "$err1" -gt "$err0" ] && pass "N-E4 running: reload_total{result=\"error\"} rises ($err0 -> $err1)" || fail "N-E4 running: reload errors not counted"
dcompose logs --no-log-prefix --since 30s authsvc 2>&1 | grep -q 'permission denied' \
  && pass "N-E4 running: 'permission denied' is logged" || fail "N-E4 running: no permission error logged"
s="$(gw $GW_HC $GATED ne4)"
[ "$s" = 401 ] && pass "N-E4 running: the revoke applied" || gap N-E4 "running: a key revoked after the grant was lost stays valid ($s); /readyz $(readyz), no alert rule"

# A fresh start: the initial load fails, the pod stays not ready, and Envoy fails the whole host open.
WAIT_READY=0 authsvc_recreate RELOAD_INTERVAL=5s
sleep 4
check N-E4 "startup: /readyz is 503" "$(readyz)" 503
check N-E4 "startup: reload error counted" "$([ "$(metric 'authsvc_reload_total{result="error"}')" -ge 1 ] && echo yes)" yes
check N-E4 "startup: the host fails open (gated path without a key)" "$(gw $GW_HC $GATED)" 200

restore
t="$(wait_for 20 'test "$(readyz)" = 200')"
[ "$t" != timeout ] && pass "N-E4 ready again ${t}s after the grant is restored, with no restart" || fail "N-E4 not ready after the grant is restored"
drill_reset
finish
