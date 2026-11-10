#!/usr/bin/env bash
# F5: latency that ext_authz adds, local numbers only (never against a shared cluster). Sequential requests over
# one kept-alive connection to the echo upstream, with and without ext_authz. Desired: no ext_authz call reaches
# the 200 ms timeout (Envoy's ext_authz error and failure_mode_allowed counters stay flat).
set -uo pipefail
source "$(dirname "$0")/lib.sh"

N="${N:-1000}"
drill_up
new_key f5
mkdir -p "$D11_DIR/probe"
run() {  # run NAME PORT PATH [KEY]
  local key=(); [ -n "${4:-}" ] && key=(--key-file "$KEYS_DIR/$4.hdr")
  python3 "$SCEN_DIR/probe.py" --port "$2" --path "$3" ${key[@]+"${key[@]}"} --count 50 --interval 0 --keepalive \
    --out /dev/null >/dev/null
  python3 "$SCEN_DIR/probe.py" --port "$2" --path "$3" ${key[@]+"${key[@]}"} --count "$N" --interval 0 --keepalive \
    --out "$D11_DIR/probe/$1.log" --summary
}
err0="$(envoy_stat hc error)"; fma0="$(envoy_stat hc failure_mode_allowed)"
base="$(run f5-base $GW_NOAUTHZ /api/texts/Genesis.1.1)"
anon="$(run f5-anon $GW_HC /api/texts/Genesis.1.1)"
keyed="$(run f5-keyed $GW_HC $GATED f5)"
err1="$(envoy_stat hc error)"; fma1="$(envoy_stat hc failure_mode_allowed)"
info "F5 no ext_authz         $base"
info "F5 ext_authz anonymous  $anon"
info "F5 ext_authz keyed      $keyed"
p() { echo "$1" | sed -E "s/.*$2=([0-9.]+).*/\1/"; }
info "F5 added p50: anonymous +$(fsub "$(p "$anon" p50)" "$(p "$base" p50)") ms, keyed +$(fsub "$(p "$keyed" p50)" "$(p "$base" p50)") ms; added p99: anonymous +$(fsub "$(p "$anon" p99)" "$(p "$base" p99)") ms, keyed +$(fsub "$(p "$keyed" p99)" "$(p "$base" p99)") ms"
check F5 "no ext_authz errors (timeouts) during the run" "$((err1 - err0))" 0
check F5 "no fail-open during the run" "$((fma1 - fma0))" 0
non200="$(cat "$D11_DIR"/probe/f5-{anon,keyed}.log | awk '$2 != 200' | wc -l | tr -d ' ')"
check F5 "every request 200" "$non200" 0
slow="$(cat "$D11_DIR"/probe/f5-{anon,keyed}.log | awk '$3 >= 200' | wc -l | tr -d ' ')"
check F5 "no request at or over 200 ms" "$slow" 0
finish
