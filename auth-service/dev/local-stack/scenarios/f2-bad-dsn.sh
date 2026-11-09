#!/usr/bin/env bash
# F2: the auth service starts with a wrong PG_DSN (bad password). Desired: it never becomes ready, the whole host
# fails open, and that is visible (/readyz 503, a metric, an alert). No valid key may be denied meanwhile.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up
new_key f2
probe_start f2-keyed $GW_HC $GATED f2
probe_start f2-anon $GW_HC $GATED
sleep 1

t0="$(now)"
WAIT_READY=0 authsvc_recreate "PG_DSN=postgres://auth_service_reader:wrong@pg:5432/sefaria_auth?sslmode=disable"
t_up="$(now)"
sleep 3
check F2 "/readyz is 503" "$(readyz)" 503
errs="$(metric 'authsvc_reload_total{result="error"}')"
[ "$errs" -ge 1 ] && pass "F2 authsvc_reload_total{result=\"error\"} counts the failed load ($errs)" || fail "F2 no reload error metric ($errs)"
load_failed_logged() { dcompose logs --no-log-prefix authsvc 2>&1 | grep -q 'initial load failed'; }
[ "$(wait_for 12 load_failed_logged)" != timeout ] && pass "F2 the log says the initial load failed" \
  || fail "F2 no 'initial load failed' log line"
t_unhealthy="$(wait_for 20 '! authsvc_endpoint_healthy')"
info "F2 envoy marked the auth service unhealthy ${t_unhealthy}s after it was recreated"
sleep 1
check F2 "whole host fails open: gated path without a key" "$(gw $GW_HC $GATED)" 200
check F2 "valid key on the gated path still works (fail-open)" "$(gw $GW_HC $GATED f2)" 200
sleep 5
check F2 "still not ready after 10 s" "$(readyz)" 503
probe_stop f2-keyed; probe_stop f2-anon

denied="$(probe_count f2-keyed 401 "$t0")"
if [ "$denied" = 0 ]; then
  pass "F2 no valid-key request denied while the auth service was not ready"
else
  first="$(probe_first_after f2-keyed 401 "$t0")"; last="$(awk '$2 == 401 {t = $1} END {print t}' "$D11_DIR/probe/f2-keyed.log")"
  gap N-CR8 "F2 a valid key got $denied x 401 api_key_invalid from the not-ready, empty auth service, from $(fsub "$first" "$t_up")s to $(fsub "$last" "$t_up")s after it started, until Envoy's health check took it out"
fi
info "F2 gated path without a key: $(probe_count f2-anon 200 "$t0") requests let through during the drill"
if curl -s "$D11_HTTP/metrics" | grep -qiE '^authsvc_[a-z_]*(last_(success|reload)|age|timestamp)'; then
  pass "F2 a last-successful-reload metric exists"
else
  gap F2 "no last-successful-reload metric or alert rule (the chart ships a ServiceMonitor and no PrometheusRule)"
fi

authsvc_recreate
check F2 "recovers once the DSN is right" "$(gw $GW_HC $GATED)" 401
finish
