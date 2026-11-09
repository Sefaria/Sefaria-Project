#!/usr/bin/env bash
# PERF-L: the latency the API-key gateway adds, on the drill copy of the stack (local numbers only; release plan
# "Added latency", D6). k6 (auth-service/k6/arms.js) sends the same request at a low fixed rate through Envoy's
# listener with ext_authz (:20080) and through the one without it (:20083), both to the echo upstream, in enforce
# and then observe: a found key ("hit"), an unknown key ("miss"), and no key on an ungated path ("anon"). Then
# authsvc-direct.js calls the auth service's gRPC Check directly with PERF_KEYS_N keys in the registry.
# Desired: every response has the contract's status, no ext_authz error or fail-open, the auth service's p99 far
# under the 200 ms ext_authz timeout, the added p99 under a loose local budget. The added p50/p99 are printed next
# to the cluster baseline (+1.30 ms p50 / +3.02 ms p99, POC on a Varnish hit); they do not replace the perf-cauldron run.
#
# Env: RATE (per arm, default 20/s), DURATION (per mode, default 120s), DIRECT_RATE (200/s), DIRECT_DURATION (30s),
#      PERF_KEYS_N (1000), K6_IMAGE, LOCAL_ADDED_P99_BUDGET_MS (25), PERF_OUT (results directory).
set -uo pipefail
source "$(dirname "$0")/lib.sh"
source "$SCEN_DIR/perf_lib.sh"

RATE="${RATE:-20}"; DURATION="${DURATION:-120s}"
DIRECT_RATE="${DIRECT_RATE:-200}"; DIRECT_DURATION="${DIRECT_DURATION:-30s}"

drill_up
trap 'perf_cleanup; authsvc_recreate >/dev/null 2>&1 || true' EXIT
perf_bulk_keys
new_key perf_hit
wait_for 10 'test "$(gw $GW_HC $GATED perf_hit)" = 200' >/dev/null || die "the perf key is never accepted"
info "PERF-L registry: $(registry_field len) keys; RATE=$RATE/s per arm, DURATION=$DURATION per mode; results in ${PERF_OUT#"$REPO"/}"

result="$PERF_OUT/latency.json"
echo '{"modes": {}}' >"$result"
# merge JSONPATH FILE|-  -> sets result[JSONPATH...] to the JSON in FILE (or on stdin)
MERGE_PY='
import json, sys
path, keys, src = sys.argv[1], sys.argv[2].split("."), sys.argv[3]
doc = json.load(open(path))
val = json.load(sys.stdin if src == "-" else open(src))
cur = doc
for k in keys[:-1]:
    cur = cur.setdefault(k, {})
cur[keys[-1]] = val
json.dump(doc, open(path, "w"), indent=2)
'
merge() { "$PYTHON" -c "$MERGE_PY" "$result" "$1" "$2" || fail "PERF-L could not record $1"; }

for mode in enforce observe; do
  authsvc_recreate AUTH_MODE="$mode"
  wait_for 30 "test \"\$(registry_field len)\" -ge $PERF_KEYS_N" >/dev/null || die "registry not loaded after the restart"
  # A fresh Envoy, so its cumulative histograms cover this run only.
  envoy_restart
  for _ in $(seq 1 20); do gw $GW_HC $GATED perf_hit >/dev/null; gw $GW_NOAUTHZ $GATED perf_hit >/dev/null; done
  err0="$(envoy_stat hc error)"; fma0="$(envoy_stat hc failure_mode_allowed)"
  info "PERF-L $mode: k6 arms"
  k6_run arms.js "arms-$mode" BASE=http://127.0.0.1:$GW_HC BASE_NOAUTHZ=http://127.0.0.1:$GW_NOAUTHZ \
    PATH_GATED=$GATED ANON_PATH=/api/texts/Genesis.1 AUTH_MODE="$mode" KEY_FILE=/keys/perf_hit.hdr \
    RATE="$RATE" DURATION="$DURATION" || fail "PERF-L $mode: k6 thresholds crossed (status checks or p99 >= 200 ms; $PERF_OUT/arms-$mode.txt)"
  err1="$(envoy_stat hc error)"; fma1="$(envoy_stat hc failure_mode_allowed)"
  if [ -s "$PERF_OUT/arms-$mode.json" ]; then merge "modes.$mode.arms" "$PERF_OUT/arms-$mode.json"
  else fail "PERF-L $mode: k6 wrote no summary ($PERF_OUT/arms-$mode.txt)"; fi
  curl -s -m 3 "$D11_ADMIN/stats?format=json&filter=^cluster\.authsvc\.upstream_rq_time\$" \
    | "${REPORT[@]}" envoy-quantiles | merge "modes.$mode.envoy_authsvc_rq_ms" -
  curl -s -m 3 "$D11_HTTP/metrics" | "${REPORT[@]}" prom-hist authsvc_decision_seconds | merge "modes.$mode.authsvc_decision" -
  printf '{"ext_authz_error": %d, "failure_mode_allowed": %d}\n' "$((err1 - err0))" "$((fma1 - fma0))" \
    | merge "modes.$mode.envoy_deltas" -
done

authsvc_recreate
info "PERF-L auth service direct (gRPC Check, $DIRECT_RATE/s for $DIRECT_DURATION)"
k6_run authsvc-direct.js direct ADDR=127.0.0.1:29090 KEYS_FILE=/keys/perf-bulk.keys PATH_GATED=$GATED \
  RATE="$DIRECT_RATE" DURATION="$DIRECT_DURATION" || fail "PERF-L direct: k6 thresholds crossed (gRPC errors or p99 >= 200 ms; $PERF_OUT/direct.txt)"
if [ -s "$PERF_OUT/direct.json" ]; then merge direct "$PERF_OUT/direct.json"; else echo '{}' | merge direct -; fi

report_lines "$result" latency
info "PERF-L results: ${result#"$REPO"/}"
finish
