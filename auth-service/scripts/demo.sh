#!/usr/bin/env bash
# Progress demo for the API key program: what is built, deployed, enforced, safe and propagated, section by section.
# Every section prints the feature ids it proves ("FEATURES: ..."), and every check prints [OK id], [MISMATCH id] or
# [SKIP id]. The script exits 1 if and only if a MISMATCH printed. e2e-tests/api-keys/check_features.py reads the
# `prove <id>` lines inside the section_* functions below, so keep each id literal.
#
#   demo.sh [--target local|cauldron] [--pause] [--offline] [--read-only | --allow-mutating] [--list-sections]
#
#   --target local     the local stack (auth-service/dev/local-stack, compose project sefaria-apikeys-stack), default
#   --target cauldron  the cauldron named by APIKEYS_CAULDRON (default apikeys-pipeline, the shared one; kubectl on the
#                      dev cluster only; DEMO_HOST overrides the site)
#   --offline          only the checks that need no network, docker or cluster (built, coverage, read more)
#   --read-only        default: nothing is written, stopped or scaled; mutating sections print [SKIP ...]
#   --allow-mutating   also run the mutating_* functions: SQL writes, a stopped auth service, a dropped listener.
#                      On --target cauldron it needs APIKEYS_CAULDRON=<name> and APIKEYS_ALLOW_MUTATING_ON=<same name>,
#                      and the name must not be a shared cauldron (apikeys-pipeline, authpoc, api-keys-poc).
#   --list-sections    print the section function names and exit without running anything
#
# Optional keys, read from the environment (a key is never printed in full; 12 characters at most):
#   DEMO_KEY               a valid developer key (valid-key probe)
#   DEMO_RESTRICTED_KEY    a valid key whose allowed origins are limited
#   DEMO_RESTRICTED_ORIGIN an origin that key allows
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
AUTH_SERVICE="$ROOT/auth-service"
TARGET=local
PAUSE=false
OFFLINE=false
READ_ONLY=true
ALLOW_MUTATING=false
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/apikeys-demo.XXXXXX")  # new_tmp runs in subshells, so files live in one dir the EXIT trap removes

DEV_CTX=gke_development-205018_us-east1-b_cluster-1
STACK_PROJECT=sefaria-apikeys-stack
STACK_PG=sefaria-apikeys-stack-pg-1
SENTINEL_NOTES='E2E api-keys stack sentinel (local only)'
CTX=${CTX:-$DEV_CTX}
NS=${NS:-default}
CAULDRON_ENV=${APIKEYS_CAULDRON:-apikeys-pipeline}
CAULDRON_HOST=${DEMO_HOST:-https://www.$CAULDRON_ENV.cauldron.sefaria.org}
EXPECTED_TRIGGERS='apikeys_notify_api_project_delete on api_project
apikeys_notify_api_project_update on api_project
apikeys_notify_keys_update on powered_by_apikey
apikeys_notify_keys_write on powered_by_apikey
apikeys_notify_meter_limit_update on api_tier_meter_limit
apikeys_notify_meter_limit_write on api_tier_meter_limit
apikeys_notify_projects_delete on powered_by_project
apikeys_notify_projects_update on powered_by_project
apikeys_notify_tier_update on api_tier
apikeys_notify_tier_write on api_tier'

DEV_KEY=${DEMO_KEY:-}
BETA_KEY=${DEMO_RESTRICTED_KEY:-}
RESTRICTED_ORIGIN=${DEMO_RESTRICTED_ORIGIN:-}
# Never valid: a shape that no registry row can hold.
UNKNOWN_KEY='sfr_nope0000000000000000000000000001'

OK_COUNT=0
MISMATCH_COUNT=0
SKIP_COUNT=0
PROBE_STATUS='?'
PROBE_CODE='-'

# Mutations that mutating_restore undoes on exit (set by the mutating_* functions).
PENDING_KEY_LABEL=''
PENDING_TIER_RESTORE=''
AUTHSVC_STOPPED=false
CAULDRON_REPLICAS=''
ACCEPT_MS=''
DENY_MS=''
TIER_MS=''
REVOKED_BODY=''
UNKNOWN_BODY=''
LISTENERS_AFTER=''

readonly RESET=$'\033[0m'
readonly BLUE=$'\033[1;34m'
readonly CYAN=$'\033[1;36m'
readonly GREEN=$'\033[1;32m'
readonly YELLOW=$'\033[1;33m'
readonly RED=$'\033[1;31m'

SECTIONS=(section_built section_deployed section_enforced section_safe section_registry section_tables
  section_propagation section_listener_drill section_outage section_ratelimit section_quota section_jwt
  section_legacy section_coverage section_read_more)

# mutating_restore: undo whatever a mutating_* function left behind; a no-op when nothing is pending.
mutating_restore() {
  if $AUTHSVC_STOPPED; then
    t_authsvc_up >/dev/null || restore_failed 'the auth service could not be started again'
    AUTHSVC_STOPPED=false
  fi
  if [[ -n "$PENDING_KEY_LABEL" ]]; then
    t_pg "delete from powered_by_apikey where label = '$PENDING_KEY_LABEL'" >/dev/null 2>&1 \
      || restore_failed "the demo key labelled $PENDING_KEY_LABEL was not deleted"
    PENDING_KEY_LABEL=''
  fi
  if [[ -n "$PENDING_TIER_RESTORE" ]]; then
    t_pg "$PENDING_TIER_RESTORE" >/dev/null 2>&1 || restore_failed "the tier restore failed: $PENDING_TIER_RESTORE"
    PENDING_TIER_RESTORE=''
  fi
}

restore_failed() { printf '%sWARNING:%s demo cleanup: %s; fix it by hand\n' "$RED" "$RESET" "$1" >&2; }

cleanup() {
  (( BASH_SUBSHELL == 0 )) || return 0   # pipeline subshells inherit this trap; only the main shell cleans up
  mutating_restore
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT TERM   # route signals through the EXIT trap so every mutation is undone

usage() {
  printf 'Usage: %s [--target local|cauldron] [--pause] [--offline] [--read-only|--allow-mutating] [--list-sections]\n' "$0"
}

list_sections() {
  printf '%s\n' "${SECTIONS[@]}"
}

while (($#)); do
  case "$1" in
    --target)
      shift
      case "${1:-}" in
        local|cauldron) TARGET=$1 ;;
        *) printf 'error: --target takes local or cauldron\n' >&2; usage >&2; exit 2 ;;
      esac ;;
    --pause) PAUSE=true ;;
    --offline) OFFLINE=true ;;
    --read-only) READ_ONLY=true; ALLOW_MUTATING=false ;;
    --allow-mutating) READ_ONLY=false; ALLOW_MUTATING=true ;;
    --list-sections) list_sections; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'error: unknown flag %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SHARED_CAULDRONS=(apikeys-pipeline authpoc api-keys-poc)  # named as shared in e2e-tests/api-keys/cauldron/SAFETY.md

refuse() { printf 'refusing: %s\n' "$1" >&2; exit 2; }

refuse_unsafe_cauldron_target() {
  [[ $TARGET == cauldron ]] || return 0
  [[ $CAULDRON_ENV =~ ^[a-z0-9-]+$ ]] || refuse "APIKEYS_CAULDRON='$CAULDRON_ENV' is not a cauldron name ([a-z0-9-]+)"
  [[ $CTX == "$DEV_CTX" ]] || refuse "--target cauldron with CTX=$CTX; only $DEV_CTX is allowed"
  [[ $NS == default ]] || refuse "--target cauldron with NS=$NS; only default is allowed"
  if [[ -n ${DEMO_HOST:-} ]]; then
    case ${DEMO_HOST%/} in
      "https://www.$CAULDRON_ENV.cauldron.sefaria.org"|"https://$CAULDRON_ENV.cauldron.sefaria.org") ;;
      *) refuse "DEMO_HOST=$DEMO_HOST is not exactly the cauldron $CAULDRON_ENV's site" ;;
    esac
  fi
  $ALLOW_MUTATING || return 0
  local shared
  for shared in "${SHARED_CAULDRONS[@]}"; do
    [[ $CAULDRON_ENV != "$shared" ]] || refuse "--allow-mutating never runs on the shared cauldron $shared"
  done
  [[ ${APIKEYS_CAULDRON:-} == "$CAULDRON_ENV" && ${APIKEYS_ALLOW_MUTATING_ON:-} == "$CAULDRON_ENV" ]] \
    || refuse "--allow-mutating on a cauldron needs APIKEYS_CAULDRON=$CAULDRON_ENV and APIKEYS_ALLOW_MUTATING_ON=$CAULDRON_ENV"
}
refuse_unsafe_cauldron_target

mask_key() {
  printf '%s…' "${1:0:12}"
}

sanitize() {
  # Mask every sfr_ key to its first 12 characters. Scans left to right so a masked token is never matched again.
  awk '
    {
      out = ""; rest = $0
      while (match(rest, /sfr_[[:alnum:]_-]+/)) {
        token = substr(rest, RSTART, RLENGTH)
        out = out substr(rest, 1, RSTART - 1) substr(token, 1, 12) (RLENGTH > 12 ? "…" : "")
        rest = substr(rest, RSTART + RLENGTH)
      }
      print out rest
    }'
}

show_command() {
  local arg
  printf '%s$' "$CYAN"
  for arg in "$@"; do
    case "$arg" in
      "${DEV_KEY:-REDACTED_DEV_KEY}"|"REDACTED_DEV_KEY") printf ' %s' "$(mask_key "$DEV_KEY")" ;;
      "$UNKNOWN_KEY"|"REDACTED_UNKNOWN_KEY") printf ' %s' "$(mask_key "$UNKNOWN_KEY")" ;;
      "${BETA_KEY:-REDACTED_BETA_KEY}"|"REDACTED_BETA_KEY") printf ' %s' "$(mask_key "$BETA_KEY")" ;;
      *) printf ' %q' "$arg" ;;
    esac
  done
  printf '%s\n' "$RESET"
}

section() { # section <title> <what this shows> <feature ids...>
  local title=$1 what=$2
  shift 2
  printf '\n%s=== %s ===%s\n' "$BLUE" "$title" "$RESET"
  printf '%sFEATURES:%s %s\n' "$YELLOW" "$RESET" "$*"
  printf '%sWhat this shows:%s %s\n' "$YELLOW" "$RESET" "$what"
  if $PAUSE; then
    read -r -p 'Press Enter to continue… ' _ || true
  fi
}

prove() { # prove <id> <label> <test...>: [OK id] when the test command succeeds, [MISMATCH id] otherwise
  local id=$1 label=$2
  shift 2
  if "$@"; then
    OK_COUNT=$((OK_COUNT + 1))
    printf '%s[OK %s]%s %s\n' "$GREEN" "$id" "$RESET" "$label"
  else
    MISMATCH_COUNT=$((MISMATCH_COUNT + 1))
    printf '%s[MISMATCH %s]%s %s\n' "$RED" "$id" "$RESET" "$label"
  fi
}

skip_unavailable() { # skip_unavailable <id> <reason>
  SKIP_COUNT=$((SKIP_COUNT + 1))
  printf '%s[SKIP %s]%s %s\n' "$YELLOW" "$1" "$RESET" "$2"
}

skip_poc() { # skip_poc <id>
  skip_unavailable "$1" 'not on this branch (POC only)'
}

capture() {
  local output=$1
  shift
  show_command "$@"
  "$@" >"$output" 2>&1
  local rc=$?
  sanitize <"$output"
  return "$rc"
}

capture_shell() {
  local display=$1
  local output=$2
  shift 2
  printf '%s$ %s%s\n' "$CYAN" "$display" "$RESET"
  "$@" >"$output" 2>&1
  local rc=$?
  sanitize <"$output"
  return "$rc"
}

new_tmp() {
  mktemp "$TMP_DIR/file.XXXXXX"
}

# age_under_1s <go-duration>: true when a Go duration such as 1.35ms or 850µs is below one second.
age_under_1s() {
  awk -v a="$1" 'BEGIN { if (!match(a, /^[0-9.]+/)) exit 1; n = substr(a, 1, RLENGTH); u = substr(a, RLENGTH + 1)
    m = (u == "s") ? 1 : (u == "ms") ? 0.001 : (u == "µs" || u == "us") ? 0.000001 : (u == "ns") ? 1e-9 : -1
    exit !(m > 0 && n * m < 1) }'
}

contains() { [[ "$1" == *"$2"* ]]; }
is_number() { [[ "$1" =~ ^[0-9]+$ ]]; }

# --- target adapter: the only place that knows local from cauldron ------------------------------------------------

# t_curl <path> [curl args...]: a request through the target's gateway. T_SITE picks the host (www or echo).
t_curl() {
  local path=$1 site=${T_SITE:-www}
  shift
  if [[ $TARGET == local ]]; then
    curl -sS --max-time 15 --resolve "$site.gateway.test:10080:127.0.0.1" "$@" "http://$site.gateway.test:10080$path"
  else
    curl -sS --max-time 15 "$@" "$CAULDRON_HOST$path"
  fi
}

# t_echo <path> [curl args...]: the same request to the local echo backend, which shows the headers it received.
t_echo() {
  local T_SITE=echo
  t_curl "$@"
}

# t_pg <sql> [database]: SQL as the database admin on the target; the statement goes in on stdin (no quoting issues).
t_pg() {
  local db=${2:-sefaria_auth}
  if [[ $TARGET == local ]]; then
    printf '%s' "$1" | docker exec -i "$STACK_PG" psql -U postgres -d "$db" -qtA -v ON_ERROR_STOP=1
  else
    printf '%s' "$1" | kubectl --context "$CTX" -n "$NS" exec -i postgres-18-0 -- \
      sh -c 'psql -qtA -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "$1"' _ "$db"
  fi
}

# t_registry: the auth service's /internal/registry JSON.
t_registry() {
  if [[ $TARGET == local ]]; then
    curl -s -m 3 http://127.0.0.1:18080/internal/registry
  else
    kubectl --context "$CTX" -n "$NS" get --raw "/api/v1/namespaces/$NS/services/auth-service-$CAULDRON_ENV:8080/proxy/internal/registry"
  fi
}

# Same -f and STACK_RUN_DIR as dev/local-stack/lib.sh, so a run from the repo root never picks the root compose file.
stack_compose() {
  STACK_RUN_DIR="${APIKEYS_STACK_STATE_DIR:-$ROOT/.claude/scratch/apikeys-stack}/run" \
    docker compose -f "$AUTH_SERVICE/dev/local-stack/docker-compose.yml" -p "$STACK_PROJECT" "$@"
}

# t_authsvc_down / t_authsvc_up: stop and restart the auth service (called only from mutating_* functions).
t_authsvc_down() {
  if [[ $TARGET == local ]]; then
    stack_compose stop authsvc >/dev/null
  else
    CAULDRON_REPLICAS=$(kubectl --context "$CTX" -n "$NS" get deploy "$CAULDRON_ENV-auth-service" -o 'jsonpath={.spec.replicas}')
    [[ $CAULDRON_REPLICAS =~ ^[0-9]+$ ]] || { printf 'cannot read the replica count of %s-auth-service; not scaling\n' "$CAULDRON_ENV" >&2; return 1; }
    kubectl --context "$CTX" -n "$NS" scale deploy "$CAULDRON_ENV-auth-service" --replicas=0 >/dev/null
  fi
}

t_authsvc_up() {
  if [[ $TARGET == local ]]; then
    stack_compose start authsvc >/dev/null
  else
    kubectl --context "$CTX" -n "$NS" scale deploy "$CAULDRON_ENV-auth-service" --replicas="${CAULDRON_REPLICAS:-1}" >/dev/null
  fi
}

# --- helpers shared by sections ----------------------------------------------------------------------------------

registry_len() {
  t_registry 2>/dev/null | sed -n 's/.*"len":\([0-9]*\).*/\1/p'
}

wait_registry_ready() { # up to 40 s for a non-empty registry after the auth service comes back
  local i
  for ((i = 0; i < 40; i++)); do
    [[ "$(registry_len)" =~ ^[1-9][0-9]*$ ]] && return 0
    sleep 1
  done
  return 1
}

auth_replicas() {
  if [[ $TARGET == local ]]; then
    stack_compose ps -q authsvc 2>/dev/null | grep -c .
  else
    kubectl --context "$CTX" -n "$NS" get pods -l "app=auth-service-$CAULDRON_ENV" -o name | grep -c .
  fi
}

# listener_filter: a SQL condition that keeps only this target's auth-service listener connections. The cauldron's
# postgres is shared, so its connections are attributed by pod address.
listener_filter() {
  local ips
  if [[ $TARGET == local ]]; then
    printf "application_name = 'authsvc-listener'"
    return 0
  fi
  ips=$(kubectl --context "$CTX" -n "$NS" get pods -l "app=auth-service-$CAULDRON_ENV" \
    -o 'jsonpath={range .items[*]}{.status.podIP}{"\n"}{end}' | awk 'NF { printf "%s'"'"'%s'"'"'", sep, $1; sep = "," }')
  printf "application_name = 'authsvc-listener' and client_addr in (%s)" "${ips:-'0.0.0.0'}"
}

listener_count() {
  t_pg "select count(*) from pg_stat_activity where $(listener_filter)" postgres
}

# the sentinel's live api_project row: keys point at it, and its tier_id is the tier the auth service stamps
sentinel_api_project() {
  t_pg "select a.id from api_project a join powered_by_project p on p.id = a.profile_id where p.notes = '$SENTINEL_NOTES' and a.deleted_at is null limit 1"
}

new_demo_key() {
  printf 'sfr_demo%s' "$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
}

# http_probe <label> <key> <origin> <path> [curl args...]: prints status, code and via; sets PROBE_STATUS and PROBE_CODE.
http_probe() {
  local label=$1 key=$2 origin=$3 path=$4 headers body via
  local -a args=()
  shift 4
  [[ -z "$key" ]] || args+=(-H "x-api-key: $key")
  [[ -z "$origin" ]] || args+=(-H "Origin: $origin")
  headers=$(new_tmp)
  body=$(new_tmp)
  printf '%s%-28s%s curl %s%s%s\n' "$CYAN" "$label" "$RESET" "${key:+-H x-api-key:$(mask_key "$key") }" "${origin:+-H Origin:$origin }" "$path"
  PROBE_STATUS=$(t_curl "$path" -D "$headers" -o "$body" -w '%{http_code}' ${args[@]+"${args[@]}"} "$@" 2>/dev/null)
  [[ "$PROBE_STATUS" =~ ^[0-9]{3}$ ]] || PROBE_STATUS='?'
  via=$(awk 'BEGIN { IGNORECASE=1 } /^via:/ { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/[[:space:]]+$/, ""); print; exit }' "$headers")
  PROBE_CODE=$(sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$body" | head -n 1)
  PROBE_CODE=${PROBE_CODE:--}
  printf '    status=%s code=%s via=%s\n' "$PROBE_STATUS" "$PROBE_CODE" "${via:-none}"
}

# probe_quiet <path> <key>: like http_probe, prints nothing.
probe_quiet() {
  local body
  body=$(new_tmp)
  PROBE_STATUS=$(t_curl "$1" -o "$body" -w '%{http_code}' -H "x-api-key: $2" 2>/dev/null)
  PROBE_CODE=$(sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$body" | head -n 1)
  PROBE_CODE=${PROBE_CODE:--}
}

probe_is() { # probe_is <status> <code>: the last probe answered exactly this
  [[ "$PROBE_STATUS" == "$1" && "$PROBE_CODE" == "$2" ]]
}

probe_not_denied() { # not a gateway denial and not a 5xx
  [[ "$PROBE_CODE" != api_key_required && "$PROBE_CODE" != api_key_invalid && "$PROBE_STATUS" =~ ^[1-4][0-9][0-9]$ ]]
}

# echoed_header <body-file> <name>: the value of a request header as the echo backend saw it, empty when absent.
echoed_header() {
  tr ',' '\n' <"$1" | sed -n "s/.*\"$2\" *: *\"\([^\"]*\)\".*/\1/p" | head -n 1
}

spoof_stripped() { # the echo answered (it shows a host header) and the spoofed tier and project did not arrive
  grep -qi '"host"' "$1" && [[ "$(echoed_header "$1" x-sefaria-tier)" != internal && "$(echoed_header "$1" x-sefaria-project)" != 1 ]]
}

secret_free() { # the file holds service log lines (Go default slog: "2026/10/20 12:00:00 INFO msg", maybe prefixed) and no full key
  [[ -s "$1" ]] && grep -Eq '(^|[| ])[0-9]{4}/[0-9]{2}/[0-9]{2} [0-9:]{8} (INFO|WARN|ERROR|DEBUG) ' "$1" && ! grep -Eq 'sfr_[A-Za-z0-9_-]{16,}' "$1"
}

# wait_echo_header <key> <header> <value> <limit-ms>: polls the echo backend until the header shows the value; prints
# the elapsed milliseconds from the call, or nothing on timeout.
wait_echo_header() {
  local key=$1 header=$2 value=$3 limit=$4 body start now
  body=$(new_tmp)
  start=$(date +%s%N)
  while now=$(date +%s%N); (( (now - start) / 1000000 < limit )); do
    t_echo /api/knn-search -o "$body" -H "x-api-key: $key" >/dev/null 2>&1
    if [[ "$(echoed_header "$body" "$header")" == "$value" ]]; then
      printf '%s' $(( (now - start) / 1000000 ))
      return 0
    fi
    sleep 0.05
  done
  return 1
}

# need_mutating <ids...>: true when mutating sections may run, else one [SKIP id] per id.
need_mutating() {
  local id
  $ALLOW_MUTATING && return 0
  for id in "$@"; do
    skip_unavailable "$id" 'mutating section; read-only by default (pass --allow-mutating)'
  done
  return 1
}

# --- sections -----------------------------------------------------------------------------------------------------

section_built() {
  local output rc
  section '1. Built' 'The branch builds and its Go tests pass, the Helm matrix validates, and the feature matrix has no unchecked edge case.' F-META-01 F-SCHEMA-01.e1

  output=$(new_tmp)
  if command -v go >/dev/null 2>&1; then
    local -a goenv=(env)
    $OFFLINE && goenv+=(GOPROXY=off)
    capture_shell 'cd auth-service && go test -count=1 ./...' "$output" bash -c 'cd "$1" && shift && exec "$@"' _ "$AUTH_SERVICE" "${goenv[@]}" go test -count=1 ./...
    rc=$?
    awk '$1 == "ok" || $1 == "FAIL" { printf "  %-7s %s\n", $1, $2 }' "$output"
    prove F-SCHEMA-01.e1 'go test ./... passes (the registry tests on the schema fixture skip without PG_TEST_DSN)' test "$rc" -eq 0
  else
    skip_unavailable F-SCHEMA-01.e1 'go is not installed here; run-checks.sh go runs the same tests'
  fi

  output=$(new_tmp)
  if command -v yq >/dev/null 2>&1 && command -v helm >/dev/null 2>&1; then
    capture_shell 'cd auth-service && make helm-matrix' "$output" bash -c 'cd "$1" && make helm-matrix' _ "$AUTH_SERVICE"
    prove F-META-01 'helm matrix: every supported values set renders sane' grep -q '^helm-matrix OK' "$output"
  else
    skip_unavailable F-META-01 'make helm-matrix needs helm and yq'
  fi

  output=$(new_tmp)
  if [[ -f "$ROOT/e2e-tests/api-keys/features.json" ]]; then
    local -a validator=(python3 "$ROOT/e2e-tests/api-keys/check_features.py" --strict)
    $OFFLINE && validator+=(--offline-poc)
    capture_shell 'python3 e2e-tests/api-keys/check_features.py --strict' "$output" "${validator[@]}"
    rc=$?
    prove F-META-01 'feature validator --strict: every edge case has a check and every ref resolves' test "$rc" -eq 0
  else
    skip_unavailable F-META-01 'e2e-tests/api-keys/features.json does not exist yet; check_features.py has nothing to validate'
  fi
}

section_deployed() {
  local output rc
  section '2. Deployed' 'The auth service, its database access and the gateway policy are up on the target.' F-OUT-01 F-REG-04
  output=$(new_tmp)
  if [[ $TARGET == local ]]; then
    capture_shell 'auth-service/dev/local-stack/status.sh' "$output" bash "$AUTH_SERVICE/dev/local-stack/status.sh"
    rc=$?
    prove F-REG-04 'local stack healthy: /readyz 200, registry readable, gateway routes answer' test "$rc" -eq 0
    skip_unavailable F-OUT-01 'the SecurityPolicy gate is a cauldron check; the local Envoy config sets fail-open'
    return 0
  fi
  capture "$output" kubectl --context "$CTX" -n "$NS" get deploy "$CAULDRON_ENV-auth-service" \
    -o 'custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas' --no-headers
  prove F-REG-04 'auth-service deployment has all replicas ready' awk '{ exit !($2 == $3 && $3 > 0) }' "$output"
  output=$(new_tmp)
  capture_shell 'scripts/policy-gate.sh   # every auth policy Accepted on every ancestor' "$output" \
    env CTX="$CTX" NS="$NS" ENV="$CAULDRON_ENV" bash "$AUTH_SERVICE/scripts/policy-gate.sh"
  prove F-OUT-01 'auth SecurityPolicy accepted (a rejected one would turn the route into a 500)' grep -q "^ok   securitypolicy/$CAULDRON_ENV-auth:" "$output"
}

section_enforced() {
  section '3. Enforced live' 'Real requests show anonymous access, valid-key access, invalid-key rejection, the gate, origin policy and header edge cases.' F-DEC-01.e1 F-DEC-02.e1 F-DEC-03.e1 F-DEC-04.e1 F-DEC-05.e1 F-DEC-06.e1 F-DEC-07.e1
  printf 'Target: %s   ungated path: /api/texts/Genesis.1   gated path: /api/knn-search\n' "$TARGET"

  http_probe 'anonymous, ungated' '' '' /api/texts/Genesis.1
  prove F-DEC-07.e1 'anonymous request on an ungated path is allowed' probe_is 200 -
  http_probe 'empty x-api-key header' '' '' /api/texts/Genesis.1 -H 'x-api-key;'
  prove F-DEC-07.e1 'an empty x-api-key counts as no key' probe_is 200 -

  if [[ -n "$DEV_KEY" ]]; then
    http_probe 'developer key' "$DEV_KEY" '' /api/texts/Genesis.1
    prove F-DEC-01.e1 'a valid developer key is allowed' probe_is 200 -
  else
    skip_unavailable F-DEC-01.e1 'set DEMO_KEY to a valid developer key'
  fi

  http_probe 'unknown key, gated' "$UNKNOWN_KEY" '' /api/knn-search
  prove F-DEC-02.e1 'an unknown key on the gated path is 401 api_key_invalid' probe_is 401 api_key_invalid

  http_probe 'knn-search, no key' '' '' /api/knn-search
  prove F-DEC-04.e1 'the gated path without a key is 401 api_key_required' probe_is 401 api_key_required
  http_probe 'knn-search, encoded path' '' '' /api/%6bnn-search
  prove F-DEC-06.e1 'a percent-encoded gated path is still gated' probe_is 401 api_key_required
  http_probe 'preflight with Origin' '' 'https://example.org' /api/knn-search -X OPTIONS
  prove F-DEC-05.e1 'OPTIONS with an Origin and no key is allowed as an embed' probe_not_denied

  if [[ -n "$BETA_KEY" ]]; then
    http_probe 'restricted key, evil Origin' "$BETA_KEY" 'https://evil.example.org' /api/texts/Genesis.1
    prove F-DEC-03.e1 'a key with limited origins is refused from another origin' probe_is 403 origin_not_allowed
    if [[ -n "$RESTRICTED_ORIGIN" ]]; then
      http_probe 'restricted key, own Origin' "$BETA_KEY" "$RESTRICTED_ORIGIN" /api/texts/Genesis.1
      prove F-DEC-03.e1 'the same key is allowed from its own origin' probe_is 200 -
    fi
  else
    skip_unavailable F-DEC-03.e1 'set DEMO_RESTRICTED_KEY (and DEMO_RESTRICTED_ORIGIN) for a key with limited origins'
  fi
}

section_safe() {
  local output
  section '4. Safe by design' 'Spoofed identity headers never reach the backend, no full key appears in the auth-service logs, and fail-open is explicit.' F-HDR-02.e1 F-DEC-10.e1 F-OUT-02.e2
  output=$(new_tmp)
  if [[ $TARGET == local ]]; then
    t_echo / -H 'x-sefaria-tier: internal' -H 'x-sefaria-project: 1' -o "$output" >/dev/null 2>&1
    printf '    echoed x-sefaria-tier=%s x-sefaria-project=%s\n' "$(echoed_header "$output" x-sefaria-tier)" "$(echoed_header "$output" x-sefaria-project)"
    prove F-HDR-02.e1 'a spoofed x-sefaria-tier: internal never reaches the upstream' spoof_stripped "$output"
  else
    skip_unavailable F-HDR-02.e1 'no echo backend on the cauldron; the Playwright header spec covers it there'
  fi

  output=$(new_tmp)
  if [[ $TARGET == local ]]; then
    stack_compose logs authsvc --no-color --tail 1000 >"$output" 2>&1
  else
    kubectl --context "$CTX" -n "$NS" logs -l "app=auth-service-$CAULDRON_ENV" --all-containers=true --tail=1000 >"$output" 2>&1
  fi
  printf '    log lines read: %s\n' "$(wc -l <"$output" | tr -d ' ')"
  prove F-DEC-10.e1 'no full key in the auth-service logs (only prefixes)' secret_free "$output"

  printf '    chart policy: %s\n' "$(grep -E '^[[:space:]]+(failOpen|timeout):' "$ROOT/helm-chart/sefaria/values.yaml" | tr -s ' ' | paste -sd' ')"
  prove F-OUT-02.e2 'chart default keeps authService.extAuth.failOpen: true' grep -q 'failOpen: true' "$ROOT/helm-chart/sefaria/values.yaml"
}

section_registry() {
  local out len expected_len replicas listeners
  section '5. One registry per cluster' 'The auth service reads api_project, api_tier and api_tier_meter_limit through its joins, listens on ten triggers, and every replica is connected.' F-REG-01 F-REG-02 F-MODEL-03.e6 F-MODEL-04.e3 F-REG-06.e4

  prove F-REG-01.e2 'the loader query JOINs api_project and api_tier, and reads api_tier_meter_limit' \
    bash -c 'grep -q "JOIN api_project " "$1" && grep -q "JOIN api_tier " "$1" && grep -q "FROM api_tier_meter_limit" "$1"' _ "$AUTH_SERVICE/internal/registry/pgload.go"

  printf '%s$ psql sefaria_auth: triggers (name on table)%s\n' "$CYAN" "$RESET"
  out=$(t_pg "select tgname || ' on ' || tgrelid::regclass from pg_trigger where not tgisinternal and tgname like 'apikeys_notify%' order by tgname collate \"C\"")
  printf '%s\n' "$out"
  prove F-MODEL-03.e6 'exactly the ten expected notify triggers exist' test "$out" = "$EXPECTED_TRIGGERS"
  out=$(t_pg "select pg_get_triggerdef(oid) from pg_trigger where tgname = 'apikeys_notify_api_project_update'")
  # pg_get_triggerdef prints the WHEN clause lower-cased: ((old.tier_id)::text IS DISTINCT FROM (new.tier_id)::text)
  prove F-MODEL-03.e6 'the api_project update trigger fires on a tier change (its WHEN clause names old.tier_id)' contains "$out" 'old.tier_id'

  expected_len=$(t_pg 'select count(*) from powered_by_apikey k join api_project p on p.id = k.project_id')
  len=$(registry_len)
  printf '    registry len=%s  keys joined to projects=%s\n' "${len:-?}" "$expected_len"
  prove F-REG-01 '/internal/registry length equals the keys joined to their projects' test "${len:-x}" = "$expected_len"

  replicas=$(auth_replicas)
  listeners=$(listener_count)
  printf '    auth-service replicas=%s  listener connections=%s\n' "$replicas" "$listeners"
  prove F-REG-06.e4 'every auth-service replica holds a listener connection' test "$listeners" = "$replicas"
  out=$(t_pg 'select pg_notification_queue_usage()' postgres)
  prove F-REG-02 "notification queue usage is 0 (it is ${out:-unknown})" test "$out" = 0

  out=$(t_pg "select string_agg(t || '.' || c || '=' || has_column_privilege('auth_service_reader', t, c, 'SELECT'), ' ' order by t, c) from (values ('api_project','id'),('api_project','tier_id'),('api_project','deleted_at'),('api_project','profile_id'),('api_project','owner_id'),('api_project','contact_email'),('api_tier','id'),('api_tier','per_minute_per_project'),('api_tier_meter_limit','tier_id'),('api_tier_meter_limit','meter'),('api_tier_meter_limit','monthly_per_project')) v(t, c)")
  printf '    reader grants: %s\n' "$out"
  prove F-MODEL-04.e3 'the reader reads the api_project, api_tier and meter-limit columns it needs, and not profile_id, owner_id or contact_email' \
    test "$out" = 'api_project.contact_email=false api_project.deleted_at=true api_project.id=true api_project.owner_id=false api_project.profile_id=false api_project.tier_id=true api_tier.id=true api_tier.per_minute_per_project=true api_tier_meter_limit.meter=true api_tier_meter_limit.monthly_per_project=true api_tier_meter_limit.tier_id=true'
}

section_tables() {
  local out
  section '6. Tables hold one thing each' 'Keys carry no tier, the tier lives on api_project, project metadata stays on the profile, and the public listing never shows a tier.' F-MODEL-01.e5 F-MODEL-01.e6 F-WRITE-01.e5 F-LIST-01.e2

  out=$(t_pg "select count(*) from information_schema.columns where table_name = 'powered_by_apikey' and column_name in ('tier','project_name','description','organization','owner_id','notes')")
  prove F-MODEL-01.e5 'powered_by_apikey has no tier or project-metadata column' test "$out" = 0
  out=$(t_pg "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'api_project'")
  printf '    api_project columns: %s\n' "$out"
  prove F-MODEL-01.e5 'api_project has exactly its eight columns' test "$out" = 'contact_email,created_at,deleted_at,id,owner_id,profile_id,tier_id,updated_at'
  out=$(t_pg "select count(*) from information_schema.columns where table_name = 'powered_by_project' and column_name in ('project_name','notes','deleted_at','tier')")
  prove F-MODEL-01.e6 'powered_by_project keeps its metadata columns and the frozen tier' test "$out" = 4

  printf '    api_project rows per tier: %s\n' "$(t_pg "select coalesce(string_agg(tier_id || '=' || c, ' ' order by tier_id), 'none') from (select tier_id, count(*) c from api_project group by tier_id) t")"
  out=$(t_pg "select count(*) from api_project a where exists (select 1 from powered_by_apikey k where k.project_id = a.id) and a.tier_id not in ('developer', 'partner', 'internal')")
  printf '    keyed api_project rows outside the three seeded tiers: %s\n' "$out"
  prove F-WRITE-01.e5 'every keyed api_project row has one of the three seeded tiers' test "$out" = 0

  out=$(new_tmp)
  printf '%s$ GET /api/powered-by%s\n' "$CYAN" "$RESET"
  t_curl /api/powered-by -o "$out" >/dev/null 2>&1
  prove F-LIST-01.e2 '/api/powered-by contains no tier field' bash -c '[[ -s "$1" ]] && ! grep -q "\"tier\"" "$1"' _ "$out"
}

# mutating_key_lifecycle: create a key on the sentinel's api_project row through SQL, then revoke it; sets ACCEPT_MS and
# DENY_MS (milliseconds until the registry served the change; empty on timeout).
mutating_key_lifecycle() {
  local project label key start now
  project=$(sentinel_api_project)
  if [[ -z "$project" ]]; then
    skip_unavailable F-REG-06.e1 'no local-stack sentinel project to attach a demo key to'
    return 1
  fi
  label="demo-$$"
  key=$(new_demo_key)
  PENDING_KEY_LABEL=$label
  printf '%s$ psql: insert key %s on project %s, then revoke it%s\n' "$CYAN" "$(mask_key "$key")" "$project" "$RESET"
  t_pg "insert into powered_by_apikey (id, key, label, allowed_origins, created_at, project_id) values (gen_random_uuid(), '$key', '$label', '[]'::jsonb, now(), $project)" >/dev/null
  ACCEPT_MS=$(wait_echo_header "$key" x-sefaria-auth-result ok 5000)

  t_pg "update powered_by_apikey set revoked_at = now() where label = '$label'" >/dev/null
  start=$(date +%s%N)
  DENY_MS=''
  while now=$(date +%s%N); (( (now - start) / 1000000 < 5000 )); do
    probe_quiet /api/knn-search "$key"
    if probe_is 401 api_key_invalid; then DENY_MS=$(( (now - start) / 1000000 )); break; fi
    sleep 0.05
  done
  REVOKED_BODY=$(new_tmp)
  t_curl /api/knn-search -o "$REVOKED_BODY" -H "x-api-key: $key" >/dev/null 2>&1
  UNKNOWN_BODY=$(new_tmp)
  t_curl /api/knn-search -o "$UNKNOWN_BODY" -H "x-api-key: $UNKNOWN_KEY" >/dev/null 2>&1
  mutating_restore
}

# mutating_tier_upsert: move the sentinel's api_project row to partner; sets TIER_MS (empty on timeout).
mutating_tier_upsert() {
  local project label key prior
  project=$(sentinel_api_project)
  if [[ -z "$project" ]]; then
    skip_unavailable F-REG-06.e3 'no local-stack sentinel api_project row'
    return 1
  fi
  label="demo-tier-$$"
  key=$(new_demo_key)
  prior=$(t_pg "select tier_id from api_project where id = $project")
  if [[ -z "$prior" ]]; then
    skip_unavailable F-REG-06.e3 'the sentinel api_project row has no tier to restore'
    return 1
  fi
  PENDING_TIER_RESTORE="update api_project set tier_id = '$prior', updated_at = now() where id = $project"
  PENDING_KEY_LABEL=$label
  t_pg "insert into powered_by_apikey (id, key, label, allowed_origins, created_at, project_id) values (gen_random_uuid(), '$key', '$label', '[]'::jsonb, now(), $project)" >/dev/null
  printf '%s$ psql: set api_project %s to tier partner; prior tier: %s%s\n' "$CYAN" "$project" "$prior" "$RESET"
  t_pg "update api_project set tier_id = 'partner', updated_at = now() where id = $project" >/dev/null
  TIER_MS=$(wait_echo_header "$key" x-sefaria-tier partner 5000)
  mutating_restore
}

section_propagation() {
  section '7. A change reaches the auth service' 'A key created or revoked, and a project tier changed on its api_project row, reach live requests within the time bounds (mutating, local only).' F-REG-06.e1 F-REG-06.e3 F-DEC-02.e2
  if [[ $TARGET == cauldron ]]; then
    skip_unavailable F-REG-06.e1 'cauldron: the auth-service role is read-only and Django owns the writes; run the local target'
    skip_unavailable F-REG-06.e3 'cauldron: the auth-service role is read-only and Django owns the writes; run the local target'
    skip_unavailable F-DEC-02.e2 'cauldron: a truly revoked key needs a write; run the local target'
    return 0
  fi
  need_mutating F-REG-06.e1 F-REG-06.e3 F-DEC-02.e2 || return 0
  if mutating_key_lifecycle; then
    prove F-REG-06.e1 "a new key is accepted within 1 s (took ${ACCEPT_MS:-over 5000}ms)" age_under_1s "${ACCEPT_MS:-5000}ms"
    prove F-REG-06.e1 "a revoked key is 401 api_key_invalid within 1 s (took ${DENY_MS:-over 5000}ms)" age_under_1s "${DENY_MS:-5000}ms"
    prove F-DEC-02.e2 'a truly revoked key and an unknown key get byte-identical bodies (no oracle)' bash -c '[[ -s "$1" ]] && cmp -s "$1" "$2"' _ "$REVOKED_BODY" "$UNKNOWN_BODY"
  fi
  if mutating_tier_upsert; then
    prove F-REG-06.e3 "an api_project tier change reaches x-sefaria-tier within 5 s (took ${TIER_MS:-over 5000}ms)" test -n "$TIER_MS"
  fi
}

# mutating_listener_drop: terminate the auth service's own listener connection(s); sets LISTENERS_AFTER once they are
# back (or after 20 s).
mutating_listener_drop() {
  local dropped replicas i
  replicas=$(auth_replicas)
  dropped=$(t_pg "select count(pg_terminate_backend(pid)) from pg_stat_activity where $(listener_filter)" postgres)
  printf '    terminated listener connections: %s\n' "$dropped"
  for ((i = 0; i < 20; i++)); do
    sleep 1
    LISTENERS_AFTER=$(listener_count)
    [[ "$LISTENERS_AFTER" == "$replicas" ]] && break
  done
}

section_listener_drill() {
  section '8. Listener connection dropped' 'NOTIFY is not stored: after a dropped connection the auth service LISTENs again and reloads the full key set (mutating; drops only its own connection).' F-REG-02.e2
  need_mutating F-REG-02.e2 || return 0
  mutating_listener_drop
  prove F-REG-02.e2 "the listener reconnected and LISTENs again ($LISTENERS_AFTER of $(auth_replicas) connections)" test "$LISTENERS_AFTER" = "$(auth_replicas)"
}

# mutating_authsvc_stop: stop the auth service; mutating_restore starts it again (also on exit).
mutating_authsvc_stop() {
  printf '%s$ stop the auth service (restored by the end of the section and on exit)%s\n' "$CYAN" "$RESET"
  AUTHSVC_STOPPED=true
  t_authsvc_down
  sleep 3
}

section_outage() {
  local body
  section '9. Auth service down: fail open' 'With the auth service stopped, Envoy lets requests through: nothing is denied by the gateway and no spoofed identity gets upstream (mutating).' F-OUT-01.e1 F-OUT-02.e1 F-OUT-03.e2 F-HDR-02.e4
  skip_unavailable F-OUT-02.e3 'planned (POC catch-all)'
  skip_unavailable F-OUT-02.e4 'planned'
  need_mutating F-OUT-01.e1 F-OUT-02.e1 F-OUT-03.e2 F-HDR-02.e4 || return 0
  body=$(new_tmp)
  mutating_authsvc_stop

  http_probe 'knn-search, no key (down)' '' '' /api/knn-search
  prove F-OUT-02.e1 'gated path without a key is not stopped by Envoy: no api_key_required, no gateway 5xx' probe_not_denied
  http_probe 'knn-search, Bearer (down)' '' '' /api/knn-search -H 'Authorization: Bearer demo-not-a-real-token'
  prove F-OUT-03.e2 'a Bearer request on the gated path is passed through to Django' probe_not_denied
  if [[ $TARGET == local ]]; then
    t_echo / -H 'x-sefaria-tier: internal' -H 'x-sefaria-project: 1' -o "$body" >/dev/null 2>&1
    prove F-HDR-02.e4 'spoofed x-sefaria-* is stripped while the auth service is down' spoof_stripped "$body"
  else
    skip_unavailable F-HDR-02.e4 'no echo backend on the cauldron'
  fi
  http_probe 'ungated path (down)' '' '' /api/texts/Genesis.1
  prove F-OUT-01.e1 'an ungated path is still 200 while the auth service is down' probe_is 200 -

  mutating_restore
  prove F-OUT-01.e1 'the auth service came back and its registry loaded' wait_registry_ready
}

section_ratelimit() {
  section '10. Rate limits' 'Per-minute limits by tier belong to the rate-limit phase and are not on this branch.' F-RL-01
  skip_poc F-RL-01
}

section_quota() {
  section '11. Monthly quota' 'The monthly semantic-search quota belongs to the rate-limit phase and is not on this branch.' F-QUOTA-01
  skip_poc F-QUOTA-01
}

section_jwt() {
  section '12. First-party JWT arm' 'JWT minting and verification are a later phase and are not on this branch.' F-JWT-01
  skip_poc F-JWT-01
}

section_legacy() {
  section '13. Legacy body-borne key' 'The legacy apikey-in-body handling is a later phase and is not on this branch.' F-LEG-01
  skip_poc F-LEG-01
}

section_coverage() {
  local output rc
  section '14. Coverage' 'The feature matrix counts every edge case by status, so what is planned is visible, not hidden.' F-META-01
  if [[ ! -f "$ROOT/e2e-tests/api-keys/features.json" ]]; then
    skip_unavailable F-META-01 'e2e-tests/api-keys/features.json does not exist yet; no coverage summary'
    return 0
  fi
  output=$(new_tmp)
  local -a validator=(python3 "$ROOT/e2e-tests/api-keys/check_features.py" --summary)
  $OFFLINE && validator+=(--offline-poc)
  capture_shell 'python3 e2e-tests/api-keys/check_features.py --summary' "$output" "${validator[@]}"
  rc=$?
  prove F-META-01 'the summary printed, planned edge cases counted' test "$rc" -eq 0
}

section_read_more() {
  section '15. Where to read more' 'The documents behind the program.' F-META-01
  printf '%sAuth service:%s auth-service/README.md\n' "$GREEN" "$RESET"
  printf '%sFeature matrix:%s e2e-tests/api-keys/README.md\n' "$GREEN" "$RESET"
  printf '%sLocal stack:%s auth-service/dev/local-stack/README.md\n' "$GREEN" "$RESET"
  printf '%sProgram wiki:%s wiki/projects/api-key-program/_index.md in the Sefaria wiki\n' "$GREEN" "$RESET"
}

run_sections() {
  local name
  if $OFFLINE; then
    section_built
    section_coverage
    section_read_more
    printf '\n%sOffline mode:%s ran the built, coverage and read-more sections; nothing touched the network, docker or a cluster.\n' "$YELLOW" "$RESET"
    return 0
  fi
  for name in "${SECTIONS[@]}"; do
    "$name"
  done
  if $READ_ONLY; then
    printf '\n%sRead-only mode:%s the mutating sections (7, 8, 9) were skipped; pass --allow-mutating to run them.\n' "$YELLOW" "$RESET"
  fi
}

run_sections
printf '\nDEMO RESULT: ok=%d mismatch=%d skipped=%d\n' "$OK_COUNT" "$MISMATCH_COUNT" "$SKIP_COUNT"
(( MISMATCH_COUNT == 0 ))
