#!/usr/bin/env bash
# PERF-R: create-to-allow and revoke-to-deny timing on the drill copy of the stack, with PERF_KEYS_N keys in the
# registry (local numbers only; the cluster figure is the perf-cauldron run's). revoke_timing.py commits a key,
# polls the gated path through Envoy until 200, revokes it, and polls until 401 api_key_invalid.
#   1. NOTIFY on (the chart's default channel): TRIALS trials, 5 ms polling. Target: ~50 ms (the coalescing window
#      plus one reload); gates: p50 <= REVOKE_P50_BUDGET_MS (250), max <= REVOKE_MAX_MS (2000, smoke S4's bound).
#   2. LISTEN broken (PG_NOTIFY_CHANNEL empty, RELOAD_INTERVAL 60s): FALLBACK_TRIALS revokes, each right after the
#      reload that applied the previous one, so each measures close to the worst case. Gate: every one applied
#      within 60 s (+5 s slack), and none fast (which would mean NOTIFY was still on).
#
# Env: TRIALS (20), FALLBACK_TRIALS (3), RELOAD_INTERVAL (60s), PERF_KEYS_N (1000), PERF_OUT, SKIP_FALLBACK=1.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
source "$SCEN_DIR/perf_lib.sh"

TRIALS="${TRIALS:-20}"; FALLBACK_TRIALS="${FALLBACK_TRIALS:-3}"
RELOAD_S="${RELOAD_INTERVAL:-60s}"; RELOAD_S="${RELOAD_S%s}"
[[ $RELOAD_S =~ ^[0-9]+$ ]] || die "RELOAD_INTERVAL must be whole seconds, like 60s"

drill_up RELOAD_INTERVAL="${RELOAD_S}s"
trap 'perf_cleanup; authsvc_recreate >/dev/null 2>&1 || true' EXIT
perf_bulk_keys
keys="$(registry_field len)"
info "PERF-R registry: $keys keys; results in ${PERF_OUT#"$REPO"/}"

result="$PERF_OUT/revoke.json"
# A reused PERF_OUT must never let the report read an earlier run's files.
rm -f "$result" "$PERF_OUT"/{notify,notify-reload,fallback}.json
timing() { "$PYTHON" "$SCEN_DIR/revoke_timing.py" --pg-port "$D11_PG_PORT" --gw-port "$GW_HC" --path "$GATED" "$@"; }

info "PERF-R 1: NOTIFY on, $TRIALS trials"
since_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
timing --trials "$TRIALS" --poll 0.005 --timeout 10 --label perf-notify >"$PERF_OUT/notify.json"
dcompose logs --no-log-prefix --since "$since_ts" authsvc 2>/dev/null | "${REPORT[@]}" reload-took >"$PERF_OUT/notify-reload.json"

listener_backends=""
if [ -z "${SKIP_FALLBACK:-}" ]; then
  info "PERF-R 2: LISTEN broken (PG_NOTIFY_CHANNEL empty), RELOAD_INTERVAL ${RELOAD_S}s, $FALLBACK_TRIALS trials (several minutes)"
  authsvc_recreate PG_NOTIFY_CHANNEL= RELOAD_INTERVAL="${RELOAD_S}s"
  listener_backends="$(psql_su -c "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'authsvc-listener'")"
  dcompose logs --no-log-prefix authsvc 2>/dev/null | grep -q 'pg_notify=false' \
    && pass "PERF-R the auth service started with pg_notify=false" || fail "PERF-R no pg_notify=false in the auth service log"
  timing --trials "$FALLBACK_TRIALS" --batch --poll 0.05 --timeout $((RELOAD_S + 30)) --label perf-fallback \
    >"$PERF_OUT/fallback.json"
fi

"$PYTHON" - "$result" "$PERF_OUT" "$keys" "$listener_backends" <<'PY'
import json, os, sys
path, out, keys, backends = sys.argv[1:5]
doc = {"keys_in_registry": int(keys)}
notify = json.load(open(os.path.join(out, "notify.json")))
notify["reload_took"] = json.load(open(os.path.join(out, "notify-reload.json")))
doc["notify"] = notify
fb = os.path.join(out, "fallback.json")
if os.path.exists(fb):
    doc["fallback"] = json.load(open(fb))
    doc["fallback"]["listener_backends"] = int(backends) if backends else None
json.dump(doc, open(path, "w"), indent=2)
PY
[ $? = 0 ] || fail "PERF-R could not aggregate the timing results (see $PERF_OUT)"
export RELOAD_INTERVAL_S="$RELOAD_S"
report_lines "$result" revoke
info "PERF-R results: ${result#"$REPO"/}"
finish
