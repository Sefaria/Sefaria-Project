#!/usr/bin/env bash
# [KG] N-F1: a rolling restart of the auth service under a steady loop. Two replicas behind Envoy, as the chart's
# RollingUpdate (maxSurge 1, maxUnavailable 0) leaves them: the new one is ready, then the old one gets SIGTERM.
# Desired: no request fails open (needs a preStop delay so the endpoint leaves before the server stops).
# Low fidelity: Envoy drops the old endpoint through its own health check here, not through EDS.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up
new_key nf1
render_drill_envoy authsvc authsvc_b
dcompose restart envoy >/dev/null 2>&1
dcompose --profile two up -d authsvc_b >/dev/null 2>&1
healthy_count() { curl -s -m 2 "$D11_ADMIN/clusters" | grep -c '^authsvc::.*::health_flags::healthy$'; }
wait_for 30 'test "$(healthy_count)" = 2' >/dev/null || die "two healthy auth service endpoints expected"
check N-F1 "both replicas healthy in envoy" "$(healthy_count)" 2

fma0="$(envoy_stat hc failure_mode_allowed)"
probe_start nf1-gated $GW_HC $GATED
probe_start nf1-keyed $GW_HC $GATED nf1
sleep 2
t_term="$(now)"
dcompose stop -t 25 authsvc >/dev/null 2>&1
t_gone="$(now)"
sleep 6
probe_stop nf1-gated; probe_stop nf1-keyed
fma1="$(envoy_stat hc failure_mode_allowed)"

open="$(probe_count nf1-gated 200 "$t_term")"
info "N-F1 the old replica took $(fsub "$t_gone" "$t_term")s to exit after SIGTERM; failure_mode_allowed $fma0 -> $fma1"
if [ "$open" = 0 ] && [ "$fma1" = "$fma0" ]; then
  pass "N-F1 no request failed open during the rolling restart"
else
  first="$(probe_first_after nf1-gated 200 "$t_term")"
  gap N-F1 "$open gated requests without a key were let through (fail-open) during the rolling restart, the first $(fsub "${first:-$t_term}" "$t_term")s after SIGTERM; the chart has no preStop delay"
fi
check N-F1 "valid key never denied" "$(probe_count nf1-keyed 401)" 0
other="$(cat "$D11_DIR"/probe/nf1-*.log | awk '$2 != 200 && $2 != 401' | wc -l | tr -d ' ')"
check N-F1 "no 5xx or connection errors" "$other" 0

dcompose start authsvc >/dev/null 2>&1
drill_reset
finish
