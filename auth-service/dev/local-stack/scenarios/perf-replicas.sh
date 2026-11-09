#!/usr/bin/env bash
# PERF-N: one versus two auth-service replicas behind Envoy (release plan "Performance measured": replicas and Envoy's
# circuit-breaker defaults). auth-service/k6/replicas.js sends ITERATIONS sequential pairs (valid key, unknown key) on
# the gated path, first with one replica and then with two.
# Desired: every request gets the same decision whichever replica answers, no 429 (rate limiting is off in phase 1),
# both replicas take Checks, Envoy's circuit-breaker thresholds are its defaults (1024) and never trip.
#
# Env: ITERATIONS (300), PERF_OUT.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
source "$SCEN_DIR/perf_lib.sh"

ITERATIONS="${ITERATIONS:-300}"
drill_up
trap 'perf_cleanup; drill_reset >/dev/null 2>&1 || true' EXIT
perf_key perf_rep
wait_for 10 'test "$(gw $GW_HC $GATED perf_rep)" = 200' >/dev/null || die "the perf key is never accepted"

per_host() { curl -s -m 3 "$D11_ADMIN/clusters" | awk -F'::' '$1 == "authsvc" && $3 == "rq_total" {print $2 "=" $4}' | sort | tr '\n' ' '; }
cb_overflow() {
  curl -s -m 3 "$D11_ADMIN/stats?filter=^cluster\.authsvc\.(upstream_rq_pending_overflow|upstream_cx_overflow|circuit_breakers\.default\.(rq_open|cx_open|rq_pending_open))\$" \
    | awk -F': ' '{s += $2} END {print s + 0}'
}
healthy_count() { curl -s -m 2 "$D11_ADMIN/clusters" | grep -c '^authsvc::.*::health_flags::healthy$'; }

run() {  # run LABEL
  k6_run replicas.js "replicas-$1" BASE=http://127.0.0.1:$GW_HC PATH_GATED=$GATED AUTH_MODE=enforce \
    KEY_FILE=/keys/perf_rep.hdr ITERATIONS="$ITERATIONS"
  local rc=$?
  check PERF-N "$1: k6 thresholds (expected decisions, no 429, no other status)" "$rc" 0
  info "PERF-N $1: Checks per auth-service endpoint: $(per_host)"
  check PERF-N "$1: circuit breakers never open or overflow" "$(cb_overflow)" 0
}

envoy_restart
limits="$(curl -s -m 3 "$D11_ADMIN/clusters" | grep -E '^authsvc::default_priority::max_(requests|pending_requests|connections)::' | awk -F'::' '{print $4}' | sort -u | tr '\n' ' ')"
check PERF-N "Envoy's circuit-breaker thresholds for the auth service cluster are the defaults" "${limits% }" 1024
run one-replica

dcompose --profile two up -d authsvc_b >/dev/null 2>&1
render_drill_envoy authsvc authsvc_b
dcompose restart envoy >/dev/null 2>&1
wait_for 40 'test "$(healthy_count)" = 2' >/dev/null || die "two healthy auth service endpoints expected"
wait_for 10 'test "$(gw $GW_HC $GATED perf_rep)" = 200' >/dev/null || die "the key is not accepted through two replicas"
run two-replicas
hosts_used="$(per_host | tr ' ' '\n' | awk -F= '$2 > 0' | grep -c .)"
check PERF-N "two-replicas: both replicas answered Checks" "$hosts_used" 2

for n in one-replica two-replicas; do
  [ -s "$PERF_OUT/replicas-$n.json" ] && info "PERF-N $n: $("$PYTHON" -c 'import json,sys; d=json.load(open(sys.argv[1])); l=d["latency"]; print("status %s, p50 %.2f ms, p99 %.2f ms" % (d["status"], l["p50"], l["p99"]))' "$PERF_OUT/replicas-$n.json")"
done
finish
