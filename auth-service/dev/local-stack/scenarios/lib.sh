# shellcheck shell=bash
# Shared by the stack scenario scripts. Sourced, not run.
#
# The drills run against a private copy of the gateway half of the stack (compose project sefaria-apikeys-d11,
# drill-compose.yml): its own Postgres on :55439 migrated by this checkout's Django, the stack's auth service image
# on :28080/:29090, and an Envoy whose three listeners all route to an echo server:
#   :20080 ext_authz with the /readyz health check, :20082 ext_authz without it, :20083 no ext_authz. Admin :29000.
# The shared stack (sefaria-apikeys-stack) is only ever read.
#
# Result lines: "pass", "FAIL" (a regression or new bug), "GAP" (desired behaviour that fails today, tagged
# @known-gap <id>), "info". A script's exit status is its FAIL count.

SCEN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCEN_DIR/../lib.sh"

D11_PROJECT=sefaria-apikeys-d11
D11_DIR="${APIKEYS_D11_DIR:-$REPO/.claude/scratch/apikeys-d11}"
export D11_RUN_DIR="$D11_DIR/run"
D11_PG_PORT=55439
D11_HTTP=http://127.0.0.1:28080
D11_ADMIN=http://127.0.0.1:29000
export GW_HC=20080 GW_NOHC=20082 GW_NOAUTHZ=20083 GATED=/api/knn-search
PROJECT_ID=9001
KEYS_DIR="$D11_DIR/keys"
mkdir -p "$D11_DIR" "$KEYS_DIR" && chmod 700 "$KEYS_DIR"

dcompose() { docker compose -p "$D11_PROJECT" -f "$SCEN_DIR/drill-compose.yml" "$@"; }

psql_su() { PGPASSWORD=postgres psql -h 127.0.0.1 -p "$D11_PG_PORT" -U postgres -d "${PGDB:-sefaria_auth}" -Atq -v ON_ERROR_STOP=1 "$@"; }
# Read-only query against the shared stack's Postgres.
psql_stack_ro() {
  PGOPTIONS='-c default_transaction_read_only=on' PGPASSWORD=postgres \
    psql -h 127.0.0.1 -p 55432 -U postgres -d sefaria_auth -Atq -v ON_ERROR_STOP=1 "$@"
}
d11_manage() { APIKEYS_STACK_PG_PORT=$D11_PG_PORT manage "$@"; }

FAILS=0; GAPS=0; PASSES=0
SCRIPT_NAME="$(basename "$0" .sh)"
RESULT_LOG="$D11_DIR/results/$SCRIPT_NAME.log"
mkdir -p "$D11_DIR/results"; : >"$RESULT_LOG"
mask() { sed -E 's/sfr_[A-Za-z0-9_-]{1,}/sfr_…/g'; }
_say() { printf '%-5s %s\n' "$1" "$2" | mask | tee -a "$RESULT_LOG"; }
pass() { PASSES=$((PASSES + 1)); _say pass "$*"; }
fail() { FAILS=$((FAILS + 1)); _say FAIL "$*"; }
gap() { GAPS=$((GAPS + 1)); local id="$1"; shift; _say GAP "@known-gap $id $*"; }
info() { _say info "$*"; }
check() {  # check ID "what" actual expected  -> pass or FAIL
  if [ "$3" = "$4" ]; then pass "$1 $2 ($3)"; else fail "$1 $2: got $3, want $4"; fi
}
finish() {
  _say "done" "$SCRIPT_NAME: $PASSES pass, $GAPS gap, $FAILS FAIL"
  exit "$FAILS"
}

# --- observation -------------------------------------------------------------------------------------------------

registry_json() { curl -s -m 3 "$D11_HTTP/internal/registry"; }
registry_field() { registry_json | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])" 2>/dev/null; }
readyz() { http_code "$D11_HTTP/readyz" 3; }
metric() {  # metric 'authsvc_reload_total{result="error"}' -> value or 0
  local v; v="$(curl -s -m 3 "$D11_HTTP/metrics" | awk -v m="$1" '$1 == m {print $2}')"; echo "${v:-0}"
}
envoy_stat() {  # envoy_stat hc failure_mode_allowed
  local v; v="$(curl -s -m 3 "$D11_ADMIN/stats?filter=^http\.$1\.ext_authz\.$2\$" | awk -F': ' '{print $2}')"; echo "${v:-0}"
}
authsvc_endpoint_healthy() { curl -s -m 2 "$D11_ADMIN/clusters" | grep -q "^authsvc::.*::health_flags::healthy$"; }

# gw PORT PATH [KEYNAME] [ORIGIN] -> HTTP status. The key goes in through a header file, never argv.
gw() {
  local args=(-s -o /dev/null -m 5 -w '%{http_code}')
  [ -n "${3:-}" ] && args+=(-H "@$KEYS_DIR/$3.hdr")
  [ -n "${4:-}" ] && args+=(-H "Origin: $4")
  curl "${args[@]}" "http://127.0.0.1:$1$2" || true
}
# gw_body PORT PATH [KEYNAME] -> the JSON code field of a denial, or "-"
gw_code() {
  local args=(-s -m 5)
  [ -n "${3:-}" ] && args+=(-H "@$KEYS_DIR/$3.hdr")
  curl "${args[@]}" "http://127.0.0.1:$1$2" | python3 -c "import json,sys
try: print(json.load(sys.stdin).get('code') or '-')
except Exception: print('-')"
}

wait_for() {  # wait_for SECONDS 'shell condition' ; re-evaluates the condition, prints elapsed seconds, 1 on timeout
  local limit="$1"; shift
  local t0; t0="$(python3 -c 'import time; print(time.time())')"
  while :; do
    if eval "$*" >/dev/null 2>&1; then
      python3 -c "import time; print('%.1f' % (time.time() - $t0))"; return 0
    fi
    python3 -c "import time,sys; sys.exit(0 if time.time() - $t0 < $limit else 1)" || { echo "timeout"; return 1; }
    sleep 0.2
  done
}
now() { python3 -c 'import time; print(time.time())'; }
since() { python3 -c "import time; print('%.1f' % (time.time() - $1))"; }

# --- fixtures ------------------------------------------------------------------------------------------------------

# new_key NAME [ORIGINS_JSON] -> inserts a live key on the drill project; its header file is $KEYS_DIR/NAME.hdr
new_key() {
  local value; value="sfr_d11$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
  psql_su -c "INSERT INTO powered_by_apikey (id, key, label, allowed_origins, created_at, project_id)
              VALUES (gen_random_uuid(), '$value', '$1', '${2:-[]}'::jsonb, now(), $PROJECT_ID)
              ON CONFLICT (key) DO NOTHING" >/dev/null
  ( umask 077; printf 'x-api-key: %s\n' "$value" >"$KEYS_DIR/$1.hdr" )
}
# set_project_tier TIER -> the drill project's tier, kept on its limits row (no row means developer)
set_project_tier() { psql_su -c "INSERT INTO powered_by_projectlimits (project_id, tier) VALUES ($PROJECT_ID, '$1') ON CONFLICT (project_id) DO UPDATE SET tier = EXCLUDED.tier, updated_at = now()" >/dev/null; }
revoke_key() { psql_su -c "UPDATE powered_by_apikey SET revoked_at = now() WHERE label = '$1' AND revoked_at IS NULL" >/dev/null; }
unknown_key() { ( umask 077; printf 'x-api-key: sfr_d11unknown%s\n' "$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 24)" >"$KEYS_DIR/$1.hdr" ); }
load_query_rows() { psql_su -c "SELECT count(*) FROM powered_by_apikey k JOIN powered_by_project p ON p.id = k.project_id"; }

seed_project() {
  psql_su -c "INSERT INTO powered_by_project (id, created_at, updated_at, submission_source, creator, creator_email,
      submitter, is_developer, job_title, found_sefaria, sefaria_tools_used, tech_used_raw, technical_experience,
      vibe_coded, project_why, project_name, project_link, project_reach, project_desc, project_category,
      has_pbs_logo, tags, status, is_buggy, consent_to_display, is_published, featured, notes)
    VALUES ($PROJECT_ID, now(), now(), 'developer_settings', 'Drill', 'apikeys-e2e-d11-drill@example.com', '', true,
      '', '', '[]', '', '', false, '', 'Stack drill', '', '', '', '', false, '[]', 'unknown', false, false, false,
      false, 'E2E api-keys d11 drill (local only)')
    ON CONFLICT (id) DO UPDATE SET deleted_at = NULL" >/dev/null
}

# --- lifecycle -------------------------------------------------------------------------------------------------------

# shellcheck disable=SC2120  # callers pass the replica hosts (nf1)
render_drill_envoy() { "$PYTHON" "$SCEN_DIR/drill_envoy.py" "$D11_RUN_DIR" "$@"; }

drill_pg_up() {
  dcompose up -d --wait pg >/dev/null 2>&1 || die "drill pg did not start"
  if [ "$(psql_su -c "SELECT count(*) FROM pg_tables WHERE tablename = 'powered_by_apikey'")" != 1 ]; then
    log "migrating the drill database (first run)"
    d11_manage migrate --noinput >"$D11_DIR/migrate.log" 2>&1 || { tail -20 "$D11_DIR/migrate.log"; die "drill migrate failed"; }
  fi
  dcompose exec -T pg psql -q -U postgres -d sefaria_auth -v ON_ERROR_STOP=1 <"$STACK_DIR/provision.sql" >/dev/null
  seed_project
  psql_su -c "SELECT 1 FROM powered_by_apikey WHERE label = 'baseline' AND revoked_at IS NULL" | grep -q 1 || new_key baseline
}

# authsvc_recreate [VAR=value ...] -> recreates the auth service with the given env and waits for /readyz (or not,
# when WAIT_READY=0)
authsvc_recreate() {
  (
    for kv in "$@"; do export "${kv?}"; done
    dcompose up -d --force-recreate --no-deps authsvc >/dev/null 2>&1
  ) || die "authsvc recreate failed"
  if [ "${WAIT_READY:-1}" = 1 ]; then
    wait_for 30 'test "$(readyz)" = 200' >/dev/null || die "drill authsvc not ready"
    wait_for 15 authsvc_endpoint_healthy >/dev/null || die "drill envoy never saw a healthy authsvc"
  fi
}

drill_up() {  # drill_up [authsvc env...]
  [ -f "$KEYS_DIR/baseline.hdr" ] || rm -f "$KEYS_DIR"/*.hdr
  render_drill_envoy
  drill_pg_up
  [ -f "$KEYS_DIR/baseline.hdr" ] || { psql_su -c "DELETE FROM powered_by_apikey WHERE label = 'baseline'" >/dev/null; new_key baseline; }
  dcompose up -d echo envoy >/dev/null 2>&1 || die "drill envoy/echo did not start"
  authsvc_recreate "$@"
}

drill_down() { dcompose --profile two down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$KEYS_DIR"; }

# Restores the drill to its default state after a script changed it.
drill_reset() {
  dcompose --profile two rm -sf authsvc_b >/dev/null 2>&1 || true
  render_drill_envoy
  dcompose restart envoy >/dev/null 2>&1
  authsvc_recreate
}

# --- steady request loops ------------------------------------------------------------------------------------------

# probe_start NAME PORT PATH [KEYNAME] -> a background loop logging to $D11_DIR/probe/NAME.log (10 requests/s)
probe_start() {
  mkdir -p "$D11_DIR/probe"; rm -f "$D11_DIR/probe/$1.stop"
  local key=(); [ -n "${4:-}" ] && key=(--key-file "$KEYS_DIR/$4.hdr")
  python3 "$SCEN_DIR/probe.py" --port "$2" --path "$3" ${key[@]+"${key[@]}"} --interval "${PROBE_INTERVAL:-0.1}" \
    --out "$D11_DIR/probe/$1.log" --stop-file "$D11_DIR/probe/$1.stop" &
}
probe_stop() { touch "$D11_DIR/probe/$1.stop"; sleep 0.3; }
# probe_count NAME STATUS [FROM_TS] [TO_TS] -> number of logged requests with that status in the window
probe_count() {
  awk -v s="$2" -v a="${3:-0}" -v b="${4:-9e12}" '$2 == s && $1 >= a && $1 <= b {n++} END {print n + 0}' "$D11_DIR/probe/$1.log"
}
# probe_last NAME STATUS -> timestamp of the last request with that status, or 0
probe_last() { awk -v s="$2" '$2 == s {t = $1} END {printf "%.3f\n", t + 0}' "$D11_DIR/probe/$1.log"; }
probe_first_after() { awk -v s="$2" -v a="$3" '$2 == s && $1 >= a {print $1; exit}' "$D11_DIR/probe/$1.log"; }
probe_total() { wc -l <"$D11_DIR/probe/$1.log" | tr -d ' '; }
fsub() { python3 -c "print('%.1f' % ($1 - $2))"; }

# --- temporary worktrees (removed by the caller's trap) -----------------------------------------------------------

# tmp_worktree NAME REF [BRANCH] -> prints the path of a fresh worktree of REF under /private/tmp; with BRANCH, on
# that local branch (reset to REF), otherwise detached
tmp_worktree() {
  local wt="/private/tmp/apikeys-d11-$1"
  git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"
  git -C "$REPO" worktree prune
  if [ -n "${3:-}" ]; then
    git -C "$REPO" worktree add -B "$3" "$wt" "$2" >/dev/null 2>&1 || die "worktree add $2 failed"
  else
    git -C "$REPO" worktree add --detach "$wt" "$2" >/dev/null 2>&1 || die "worktree add $2 failed"
  fi
  echo "$wt"
}
drop_worktree() { git -C "$REPO" worktree remove --force "$1" >/dev/null 2>&1 || rm -rf "$1"; git -C "$REPO" worktree prune; }
# npm_ci DIR -> installs from the lockfile without lifecycle scripts (husky's prepare would rewrite the shared
# repository's core.hooksPath), then applies patch-package as postinstall would
npm_ci() {
  (cd "$1" && npm ci --ignore-scripts --no-audit --no-fund && npx --no-install patch-package) >"$1/.d11-npm.log" 2>&1
}
