# shellcheck shell=bash
# Shared by the perf scenario scripts (perf-latency.sh, perf-revoke.sh, perf-replicas.sh), after lib.sh. Sourced.
# k6 runs from the pinned grafana/k6 image on the host network, as this user, so it reads the 0700 keys directory.
# Results land in $PERF_OUT (default $D11_DIR/perf/<script>-<UTC time>), which holds no key values.

K6_IMAGE="${K6_IMAGE:-grafana/k6:1.0.0}"
K6_DIR="$REPO/auth-service/k6"
PERF_OUT="${PERF_OUT:-$D11_DIR/perf/$SCRIPT_NAME-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$PERF_OUT"
PERF_KEYS_N="${PERF_KEYS_N:-1000}"
REPORT=("$PYTHON" "$SCEN_DIR/perf_report.py")

# k6_run SCRIPT OUT_NAME [VAR=value ...] -> runs auth-service/k6/SCRIPT; its summary JSON is $PERF_OUT/OUT_NAME.json
# and its text output $PERF_OUT/OUT_NAME.txt. Returns k6's exit status (non-zero when a threshold failed).
k6_run() {
  local script="$1" name="$2"; shift 2
  local envs=(-e "SUMMARY_FILE=/out/$name.json")
  local kv; for kv in "$@"; do envs+=(-e "$kv"); done
  docker run --rm --network host -u "$(id -u):$(id -g)" \
    -v "$K6_DIR:/scripts:ro" -v "$KEYS_DIR:/keys:ro" -v "$PERF_OUT:/out" \
    "${envs[@]}" "$K6_IMAGE" run --quiet --no-color "/scripts/$script" >"$PERF_OUT/$name.txt" 2>&1
  local rc=$?
  mask <"$PERF_OUT/$name.txt" | grep -vE '^\s*$' | sed 's/^/      /'
  return $rc
}

# perf_bulk_keys -> PERF_KEYS_N live keys on the drill project (label perf-bulk), their values in
# $KEYS_DIR/perf-bulk.keys (0600), and waits until the auth service has loaded them. Idempotent.
perf_bulk_keys() {
  local have; have="$(psql_su -c "SELECT count(*) FROM powered_by_apikey WHERE label = 'perf-bulk' AND revoked_at IS NULL")"
  if [ "$have" -lt "$PERF_KEYS_N" ]; then
    psql_su -c "INSERT INTO powered_by_apikey (id, key, label, allowed_origins, created_at, project_id)
                SELECT gen_random_uuid(), 'sfr_d11pb' || substr(md5(random()::text || g::text), 1, 28), 'perf-bulk',
                       '[]'::jsonb, now(), $DRILL_API_PROJECT
                FROM generate_series(1, $PERF_KEYS_N - $have) g ON CONFLICT (key) DO NOTHING" >/dev/null
  fi
  ( umask 077; psql_su -c "SELECT key FROM powered_by_apikey WHERE label = 'perf-bulk' AND revoked_at IS NULL" \
      >"$KEYS_DIR/perf-bulk.keys" )
  local want; want="$(psql_su -c "SELECT count(*) FROM powered_by_apikey k JOIN api_project p ON p.id = k.project_id
                                  WHERE k.revoked_at IS NULL AND p.deleted_at IS NULL")"
  wait_for 30 "test \"\$(registry_field len)\" -ge $want" >/dev/null || die "the auth service never loaded the $want live keys"
}

# perf_cleanup -> removes every row the perf scripts wrote (labels perf-*) from the drill's private database.
perf_cleanup() {
  psql_su -c "DELETE FROM powered_by_apikey WHERE label LIKE 'perf-%'" >/dev/null 2>&1 || true
  rm -f "$KEYS_DIR"/perf-*.keys "$KEYS_DIR"/perf_*.hdr
}

# report_lines FILE KIND -> feeds perf_report.py's result lines to lib.sh's pass/fail/info.
report_lines() {
  local kind rest
  while read -r kind rest; do
    case "$kind" in
      pass) pass "$rest" ;;
      fail) fail "$rest" ;;
      info) info "$rest" ;;
    esac
  done < <("${REPORT[@]}" "$2" "$1")
}

envoy_restart() {
  dcompose restart envoy >/dev/null 2>&1
  wait_for 30 authsvc_endpoint_healthy >/dev/null || die "envoy never saw a healthy authsvc after the restart"
}
