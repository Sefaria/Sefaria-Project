#!/usr/bin/env bash
# Boss-facing progress demo for the API auth POC.
# Read-only except sections 6 and 7 (and section 8 spends this minute's rate-limit budget for your IP and proj_alpha), which change the dev key registry on purpose: a project's tier is flipped and
# restored (restored even if the demo fails), and the auth service's own listener connection is dropped. --read-only
# skips both.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
AUTH_SERVICE="$ROOT/auth-service"
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
NS=${NS:-default}
HOST=${HOST:-https://www.authpoc.cauldron.sefaria.org}
PAUSE=false
OFFLINE=false
READ_ONLY=false
CLUSTER_OK=true
RESTORE_TIER=''
DEMO_PROJECT=${DEMO_PROJECT:-proj_alpha}
TMP_FILES=()

DEV_KEY='sfr_alpha000000000000000000000000001'
REVOKED_KEY='sfr_revoked00000000000000000000001'
UNKNOWN_KEY='sfr_nope0000000000000000000000000001'
BETA_KEY='sfr_beta0000000000000000000000000001'

readonly RESET=$'\033[0m'
readonly BLUE=$'\033[1;34m'
readonly CYAN=$'\033[1;36m'
readonly GREEN=$'\033[1;32m'
readonly YELLOW=$'\033[1;33m'
readonly RED=$'\033[1;31m'

cleanup() {
  local file
  (( BASH_SUBSHELL == 0 )) || return 0   # pipeline subshells inherit this trap (bash 3.2 has no BASHPID); only the main shell cleans up
  if [[ -n "$RESTORE_TIER" ]]; then
    printf '%srestoring %s tier to %s%s\n' "$YELLOW" "$DEMO_PROJECT" "$RESTORE_TIER" "$RESET"
    keyadmin set-tier --project "$DEMO_PROJECT" --tier "$RESTORE_TIER" >/dev/null 2>&1 || unavailable "could not restore $DEMO_PROJECT tier to $RESTORE_TIER"
  fi
  for file in "${TMP_FILES[@]-}"; do
    [[ -n "$file" ]] || continue
    rm -f "$file"
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM   # route signals through the EXIT trap so a changed tier is always restored

usage() {
  printf 'Usage: %s [--pause] [--offline] [--read-only]\n' "$0"
}

while (($#)); do
  case "$1" in
    --pause) PAUSE=true ;;
    --offline) OFFLINE=true ;;
    --read-only) READ_ONLY=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unavailable: unknown flag %s\n' "$1" >&2; usage; exit 0 ;;
  esac
  shift
done

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
      "$DEV_KEY"|"REDACTED_DEV_KEY") printf ' %s' "$(mask_key "$DEV_KEY")" ;;
      "$REVOKED_KEY"|"REDACTED_REVOKED_KEY") printf ' %s' "$(mask_key "$REVOKED_KEY")" ;;
      "$UNKNOWN_KEY"|"REDACTED_UNKNOWN_KEY") printf ' %s' "$(mask_key "$UNKNOWN_KEY")" ;;
      "$BETA_KEY"|"REDACTED_BETA_KEY") printf ' %s' "$(mask_key "$BETA_KEY")" ;;
      *) printf ' %q' "$arg" ;;
    esac
  done
  printf '%s\n' "$RESET"
}

section() {
  printf '\n%s=== %s ===%s\n' "$BLUE" "$1" "$RESET"
  printf '%sWhat this shows:%s %s\n' "$YELLOW" "$RESET" "$2"
  if $PAUSE; then
    read -r -p 'Press Enter to continue… ' _ || true
  fi
}

unavailable() {
  printf '%sunavailable:%s %s\n' "$RED" "$RESET" "$1"
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
  local file
  file=$(mktemp "${TMPDIR:-/tmp}/authpoc-demo.XXXXXX")
  TMP_FILES+=("$file")
  printf '%s' "$file"
}

section_built() {
  local output test_output matrix_output
  section '1. Built' 'The branch contains the implementation, its tests pass by package, and the Helm matrix still validates the supported modes.'

  output=$(new_tmp)
  if ! capture "$output" git -C "$ROOT" log --oneline origin/master..HEAD; then
    unavailable 'could not read commits from origin/master..HEAD'
  fi

  test_output=$(new_tmp)
  if capture_shell 'cd auth-service && GOMODCACHE=/tmp/authpoc-gomod GOCACHE=/tmp/authpoc-gobuild go test -count=1 ./...' "$test_output" bash -c "cd \"$AUTH_SERVICE\" && GOMODCACHE=/tmp/authpoc-gomod GOCACHE=/tmp/authpoc-gobuild go test -count=1 ./..."; then
    printf '%sPackage results:%s\n' "$GREEN" "$RESET"
    awk '$1 == "ok" || $1 == "FAIL" { printf "  %-7s %s\n", $1, $2 }' "$test_output"
  else
    printf '%sPackage results:%s\n' "$RED" "$RESET"
    awk '$1 == "ok" || $1 == "FAIL" { printf "  %-7s %s\n", $1, $2 }' "$test_output"
    unavailable 'Go tests failed or could not run; see the test output above'
  fi

  matrix_output=$(new_tmp)
  if capture_shell 'cd auth-service && make helm-matrix' "$matrix_output" bash -c "cd \"$AUTH_SERVICE\" && make helm-matrix"; then
    printf 'Helm matrix: %s\n' "$(tail -n 1 "$matrix_output")"
  else
    unavailable 'make helm-matrix failed or its tools are unavailable'
  fi

  output=$(new_tmp)
  if capture "$output" git -C "$ROOT" diff --shortstat origin/master...HEAD; then
    :
  else
    unavailable 'could not calculate the branch shortstat'
  fi
}

section_deployed() {
  local output
  section '2. Deployed' 'The authpoc HelmRelease and its auth, mint, database, policy, and development rate-limit components are ready in the dev cluster.'
  local -a k=(kubectl --context "$CTX" -n "$NS")

  output=$(new_tmp)
  if ! capture "$output" "${k[@]}" get helmrelease authpoc -o 'jsonpath=chart={.spec.chart.spec.version}{"\n"}ready={range .status.conditions[?(@.type=="Ready")]}{.status} {.reason}{"\n"}{end}'; then
    unavailable 'HelmRelease authpoc is not readable'
  fi

  output=$(new_tmp)
  if ! capture "$output" "${k[@]}" get deploy authpoc-auth-service authpoc-mint -o 'custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas,AVAILABLE:.status.availableReplicas' --no-headers; then
    unavailable 'auth-service, mint, or postgres deployments are not readable'
  fi

  output=$(new_tmp)
  # F5: Envoy Gateway does not fail open on a rejected policy; it turns the whole route into a 500.
  capture_shell 'scripts/policy-gate.sh   # every auth policy Accepted on every ancestor' "$output" env CTX="$CTX" NS="$NS" ENV=authpoc bash "$AUTH_SERVICE/scripts/policy-gate.sh"
  ok_if 'auth policies accepted (policy gate)' grep -q '^ok   securitypolicy/authpoc-auth:' "$output"
  ok_if 'no rejected auth policy' bash -c "! grep -q '^FAIL' '$output'"

  output=$(new_tmp)
  if ! capture "$output" kubectl --context "$CTX" -n envoy-gateway-system get deploy envoy-ratelimit -o 'custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas,AVAILABLE:.status.availableReplicas' --no-headers; then
    unavailable 'dev rate-limit backend envoy-ratelimit is not readable'
  fi
}

http_probe() {
  local label=$1 expected_status=$2 expected_code=$3 key=$4 origin=$5 path=$6
  local headers body status via code
  headers=$(new_tmp)
  body=$(new_tmp)
  printf '%s%-24s%s' "$CYAN" "$label" "$RESET"
  printf '  curl -sS --max-time 15 -D headers -o body -H x-api-key:%s' "$(mask_key "$key")"
  if [[ -n "$origin" ]]; then
    printf ' -H Origin:%q' "$origin"
  fi
  printf ' %s%s\n' "$HOST" "$path"
  if [[ -n "$key" && -n "$origin" ]]; then
    status=$(curl -sS --max-time 15 -D "$headers" -o "$body" -H "x-api-key: $key" -H "Origin: $origin" -w '%{http_code}' "$HOST$path" 2>/dev/null)
  elif [[ -n "$key" ]]; then
    status=$(curl -sS --max-time 15 -D "$headers" -o "$body" -H "x-api-key: $key" -w '%{http_code}' "$HOST$path" 2>/dev/null)
  elif [[ -n "$origin" ]]; then
    status=$(curl -sS --max-time 15 -D "$headers" -o "$body" -H "Origin: $origin" -w '%{http_code}' "$HOST$path" 2>/dev/null)
  else
    status=$(curl -sS --max-time 15 -D "$headers" -o "$body" -w '%{http_code}' "$HOST$path" 2>/dev/null)
  fi
  if [[ ! "$status" =~ ^[0-9]{3}$ ]]; then
    printf 'status=? code=? via=?\n'
    unavailable "$label request failed"
    return 0
  fi
  via=$(awk 'BEGIN { IGNORECASE=1 } /^via:/ { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/[[:space:]]+$/, ""); print; exit }' "$headers")
  [[ -n "$via" ]] || via='none'
  code=$(sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$body" | head -n 1)
  [[ -n "$code" ]] || code='-'
  printf 'status=%s code=%s via=%s' "$status" "$code" "$via"
  if [[ "$status" != "$expected_status" || "$code" != "$expected_code" ]]; then
    printf '  [MISMATCH expected status=%s code=%s]' "$expected_status" "$expected_code"
  else
    printf '  [OK]'
  fi
  printf '\n'
}

section_enforced() {
  local revoked_body unknown_body revoked_headers unknown_headers
  section '3. Enforced live' 'Real HTTPS requests show anonymous access, valid-key access, invalid-key rejection, gated-route enforcement, origin policy, and Varnish visibility.'
  printf 'Host: %s   path: /api/texts/Genesis.1\n' "$HOST"
  http_probe 'anonymous' 200 '-' '' '' '/api/texts/Genesis.1'
  http_probe 'developer key' 200 '-' "$DEV_KEY" '' '/api/texts/Genesis.1'
  http_probe 'revoked key' 401 'api_key_invalid' "$REVOKED_KEY" '' '/api/texts/Genesis.1'
  http_probe 'unknown key' 401 'api_key_invalid' "$UNKNOWN_KEY" '' '/api/texts/Genesis.1'

  revoked_body=$(new_tmp)
  unknown_body=$(new_tmp)
  revoked_headers=$(new_tmp)
  unknown_headers=$(new_tmp)
  printf '%s$ cmp revoked-body unknown-body%s\n' "$CYAN" "$RESET"
  curl -sS --max-time 15 -D "$revoked_headers" -o "$revoked_body" -H "x-api-key: $REVOKED_KEY" "$HOST/api/texts/Genesis.1" >/dev/null 2>&1 || true
  curl -sS --max-time 15 -D "$unknown_headers" -o "$unknown_body" -H "x-api-key: $UNKNOWN_KEY" "$HOST/api/texts/Genesis.1" >/dev/null 2>&1 || true
  if cmp -s "$revoked_body" "$unknown_body"; then
    printf '%srevoked and unknown bodies: byte-identical%s\n' "$GREEN" "$RESET"
  else
    printf '%srevoked and unknown bodies: MISMATCH%s\n' "$RED" "$RESET"
  fi

  http_probe 'knn-search no key' 401 'api_key_required' '' '' '/api/knn-search'
  http_probe 'partner + evil Origin' 403 'origin_not_allowed' "$BETA_KEY" 'https://evil.example.org' '/api/texts/Genesis.1'
}

section_safe() {
  local output log_output policy_output raw
  section '4. Safe by design' 'Spoofed identity headers do not upgrade a developer key, full keys do not appear in auth-service logs, and fail-open behavior is explicit in the policy.'
  raw=$(find "$AUTH_SERVICE/poc-results" -maxdepth 1 -type f -name '18-key-arm*.raw' -print -quit 2>/dev/null)
  if [[ -n "$raw" ]]; then
    printf '%sTask 18 spoofed-tier evidence:%s\n' "$GREEN" "$RESET"
    if grep -E 'valid-spoofed-tier|spoofed.*tier' "$raw" | tail -n 1 | sanitize; then
      if ! grep -q 'tier=developer' "$raw"; then
        printf 'tier=developer was not recorded in this raw result; pending Task 18 tier evidence\n'
      fi
    else
      unavailable 'Task 18 raw file has no spoofed-tier result'
    fi
  else
    printf 'pending Task 18 (missing %s)\n' "$raw"
  fi

  output=$(new_tmp)
  printf '%s$ kubectl --context %q -n %q logs -l app=auth-service-authpoc --all-containers=true --tail=1000 | grep -F -c %s%s\n' "$CYAN" "$CTX" "$NS" "$(mask_key "$DEV_KEY")" "$RESET"
  if kubectl --context "$CTX" -n "$NS" logs -l app=auth-service-authpoc --all-containers=true --tail=1000 >"$output" 2>&1; then
    grep -F -c "$DEV_KEY" "$output" >"$output.count" || true
    log_output=$(cat "$output.count")
    printf 'full developer key log matches: %s  %s\n' "$log_output" "$([[ "$log_output" == 0 ]] && printf '[OK]' || printf '[MISMATCH expected 0]')"
    TMP_FILES+=("$output.count")
  else
    unavailable 'auth-service logs or selector are unavailable'
  fi

  policy_output=$(new_tmp)
  if ! capture "$policy_output" kubectl --context "$CTX" -n "$NS" get securitypolicy authpoc-auth -o 'jsonpath=extAuth.failOpen={.spec.extAuth.failOpen} timeout={.spec.extAuth.timeout}{"\n"}'; then
    unavailable 'could not read fail-open policy settings'
  fi
}

# --- Round 2 (2026-09-23): one key registry per cluster, changes over Postgres LISTEN/NOTIFY -------------------

ok_if() { # ok_if <label> <shell test...>
  local label=$1
  shift
  if "$@"; then printf '%s  [OK]\n' "$label"; else printf '%s  [MISMATCH]\n' "$label"; fi
}

# pg <database> <sql>: query the cluster's shared postgres-18 as its admin user (the password never leaves the pod).
pg() {
  kubectl --context "$CTX" -n "$NS" exec postgres-18-0 -- sh -c "psql -qtA -v ON_ERROR_STOP=1 -U \"\${POSTGRES_USER:-postgres}\" -d $1 -c \"$2\""
}

# keyadmin <args>: the registry writer, run inside an auth-service pod (it already has PG_DSN). No --push: the
# registry's triggers notify every auth service themselves.
keyadmin() {
  kubectl --context "$CTX" -n "$NS" exec deploy/authpoc-auth-service -- /keyadmin "$@"
}

# age_under_1s <go-duration>: true when a Go duration such as 1.35ms or 850µs is below one second.
age_under_1s() {
  awk -v a="$1" 'BEGIN { if (!match(a, /^[0-9.]+/)) exit 1; n = substr(a, 1, RLENGTH); u = substr(a, RLENGTH + 1)
    m = (u == "s") ? 1 : (u == "ms") ? 0.001 : (u == "µs" || u == "us") ? 0.000001 : (u == "ns") ? 1e-9 : -1
    exit !(m > 0 && n * m < 1) }'
}

auth_pods() {
  kubectl --context "$CTX" -n "$NS" get pods -l app=auth-service-authpoc -o name
}

section_registry() {
  local -a k=(kubectl --context "$CTX" -n "$NS")
  local out n pods replicas
  section '5. One key registry per cluster (read-only)' 'The auth service has no Postgres of its own: it reads the cluster registry (database sefaria_apikeys inside the shared postgres-18) through one Secret, listens for changes on it, and no longer uses the app Redis.'
  show_command "${k[@]}" get deploy,svc -o name
  if ! out=$("${k[@]}" get deploy,svc -o name 2>/dev/null); then
    unavailable 'cluster not reachable (gcloud auth?); skipping the live sections'
    CLUSTER_OK=false
    return 0
  fi
  n=$(printf '%s\n' "$out" | grep -c 'auth-service-postgres')
  ok_if "chart-managed Postgres objects: $n" test "$n" = 0

  out=$(new_tmp)
  capture "$out" "${k[@]}" get deploy authpoc-auth-service -o 'jsonpath={range .spec.template.spec.containers[0].env[*]}{.name}={.value}{.valueFrom.secretKeyRef.name}{"\n"}{end}' >/dev/null
  grep -E '^(PG_DSN|PG_NOTIFY_CHANNEL|REDIS_ADDR)=' "$out" | sanitize
  ok_if 'PG_DSN from Secret auth-service-registry' grep -qx 'PG_DSN=auth-service-registry' "$out"
  ok_if 'PG_NOTIFY_CHANNEL=sefaria_apikeys' grep -qx 'PG_NOTIFY_CHANNEL=sefaria_apikeys' "$out"
  ok_if 'no REDIS_ADDR (app Redis not used)' bash -c "! grep -q '^REDIS_ADDR=' '$out'"

  printf '%s$ psql sefaria_apikeys: triggers, and keys per project (counts only)%s\n' "$CYAN" "$RESET"
  pg sefaria_apikeys "select tgname || ' on ' || tgrelid::regclass from pg_trigger where tgname like 'apikeys_notify%' order by 1"
  n=$(pg sefaria_apikeys "select count(*) from pg_trigger where tgname like 'apikeys_notify%'")
  ok_if "notify triggers: $n" test "$n" = 2
  pg sefaria_apikeys "select p.id || ' tier=' || p.tier || ' active=' || count(*) filter (where k.revoked_at is null) || ' revoked=' || count(*) filter (where k.revoked_at is not null) from projects p left join api_keys k on k.project_id = p.id group by p.id, p.tier order by 1"

  pods=$(auth_pods); replicas=$(printf '%s\n' "$pods" | grep -c .)
  n=$(pg postgres "select count(*) from pg_stat_activity where application_name = 'authsvc-listener'")
  ok_if "listener connections on postgres-18: $n (auth-service pods: $replicas)" test "$n" = "$replicas"
  n=$(pg postgres "select pg_notification_queue_usage()")
  ok_if "notification queue usage: $n" test "$n" = 0
  for pod in $pods; do
    "${k[@]}" logs "$pod" 2>/dev/null | grep -E 'registry loaded|postgres listener established' | head -n 2 | sed "s|^|${pod#pod/}: |"
  done
}

# check_notified <since> <table>: every auth pod logged the notification (age < 1 s) and a reload after it.
check_notified() {
  local since=$1 table=$2 pod line age
  sleep 3
  for pod in $(auth_pods); do
    line=$(kubectl --context "$CTX" -n "$NS" logs "$pod" --since-time="$since" 2>/dev/null | grep 'notify received' | grep "table=$table" | head -n 1)
    age=$(printf '%s' "$line" | sed -n 's/.* age=\([^ ]*\).*/\1/p')
    printf '%s\n' "${pod#pod/}: ${line:-no notification}"
    ok_if "  ${pod#pod/} notified in ${age:-?}" age_under_1s "${age:-x}"
    ok_if "  ${pod#pod/} reloaded" bash -c "kubectl --context '$CTX' -n '$NS' logs '$pod' --since-time='$since' 2>/dev/null | grep -q 'notify reload'"
  done
}

section_propagation() {
  local orig target since now
  section '6. A key change reaches every auth service (changes the registry, then restores it)' "keyadmin writes to the registry the way Django will. There is no push step: the registry's trigger sends a NOTIFY on commit, and every auth service reloads. Project: $DEMO_PROJECT."
  orig=$(pg sefaria_apikeys "select tier from projects where id = '$DEMO_PROJECT'")
  if [[ -z "$orig" ]]; then unavailable "project $DEMO_PROJECT not in the registry"; return 0; fi
  target=partner; [[ "$orig" == partner ]] && target=developer
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ); sleep 1
  RESTORE_TIER=$orig
  show_command kubectl --context "$CTX" -n "$NS" exec deploy/authpoc-auth-service -- /keyadmin set-tier --project "$DEMO_PROJECT" --tier "$target"
  keyadmin set-tier --project "$DEMO_PROJECT" --tier "$target" 2>&1 | sanitize
  now=$(pg sefaria_apikeys "select tier from projects where id = '$DEMO_PROJECT'")
  ok_if "registry: $DEMO_PROJECT tier $orig -> $now" test "$now" = "$target"
  check_notified "$since" projects

  since=$(date -u +%Y-%m-%dT%H:%M:%SZ); sleep 1
  show_command kubectl --context "$CTX" -n "$NS" exec deploy/authpoc-auth-service -- /keyadmin set-tier --project "$DEMO_PROJECT" --tier "$orig"
  keyadmin set-tier --project "$DEMO_PROJECT" --tier "$orig" 2>&1 | sanitize
  now=$(pg sefaria_apikeys "select tier from projects where id = '$DEMO_PROJECT'")
  ok_if "registry: $DEMO_PROJECT tier restored to $now" test "$now" = "$orig"
  [[ "$now" == "$orig" ]] && RESTORE_TIER=''
  check_notified "$since" projects
}

section_listener_drill() {
  local since n pod replicas
  section '7. Listener connection dropped (drops only the auth service'"'"'s own connection)' 'NOTIFY is not stored: anything sent while a listener is disconnected is lost. So on every reconnect the auth service LISTENs again and reloads the full key set.'
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ); sleep 1
  printf '%s$ psql postgres: select pg_terminate_backend(pid) from pg_stat_activity where application_name = '"'"'authsvc-listener'"'"'%s\n' "$CYAN" "$RESET"
  n=$(pg postgres "select count(pg_terminate_backend(pid)) from pg_stat_activity where application_name = 'authsvc-listener'")
  printf 'terminated listener connections: %s\n' "$n"
  sleep 5
  for pod in $(auth_pods); do
    kubectl --context "$CTX" -n "$NS" logs "$pod" --since-time="$since" 2>/dev/null | grep -E 'postgres listener|notify reload' | head -n 3 | sed "s|^|${pod#pod/}: |"
    ok_if "  ${pod#pod/} re-established and reloaded" bash -c "kubectl --context '$CTX' -n '$NS' logs '$pod' --since-time='$since' 2>/dev/null | grep -q 'postgres listener established'"
  done
  replicas=$(auth_pods | grep -c .)
  n=$(pg postgres "select count(*) from pg_stat_activity where application_name = 'authsvc-listener'")
  ok_if "listener connections after the drill: $n" test "$n" = "$replicas"
}

# burst <label> <key or empty> <count> <limit>: sequential requests in one window; prints each status with the
# x-ratelimit-remaining countdown, checks the exact 200/429 split, then shows and checks the first 429.
burst() {
  local label=$1 key=$2 n=$3 limit=$4 i code rem ok=0 limited=0 line='' first429='' last200='' h b
  local -a hk=()
  [[ -n "$key" ]] && hk=(-H "x-api-key: $key")
  printf '%s$ for i in 1..%s: curl %s %s/api/texts/Genesis.1%s\n' "$CYAN" "$n" "$([[ -n "$key" ]] && printf -- '-H x-api-key:%s' "$(mask_key "$key")")" "$HOST" "$RESET"
  for ((i = 1; i <= n; i++)); do
    h=$(new_tmp); b=$(new_tmp)
    code=$(curl -sS --max-time 15 -D "$h" -o "$b" ${hk[@]+"${hk[@]}"} -w '%{http_code}' "$HOST/api/texts/Genesis.1" 2>/dev/null)
    rem=$(awk 'BEGIN{IGNORECASE=1} tolower($1)=="x-ratelimit-remaining:"{gsub(/\r/,"",$2); print $2; exit}' "$h")
    line+="$code${rem:+(${rem})} "
    if [[ $code == 200 ]]; then ok=$((ok + 1)); last200=$h; fi
    if [[ $code == 429 ]]; then limited=$((limited + 1)); [[ -z $first429 ]] && first429="$h $b"; fi
  done
  printf '%s: %s\n' "$label" "$line"
  ok_if "  $label: $ok allowed (limit $limit/min)" test "$ok" = "$limit"
  ok_if "  $label: $limited blocked with 429" test "$limited" = "$((n - limit))"
  if [[ -n $first429 ]]; then
    h=${first429% *}; b=${first429#* }
    printf '%sfirst blocked response:%s\n' "$GREEN" "$RESET"
    grep -iE '^(HTTP/|retry-after|x-ratelimit-|content-type)' "$h" | tr -d '\r' | sed 's/^/    /'
    printf '    %s\n' "$(sanitize <"$b")"
    ok_if '  429 body is the product-spec rate_limited error' grep -q '"code":"rate_limited"' "$b"
    ok_if '  Retry-After: 60' grep -qi '^retry-after: 60' "$h"
    # F3: allowed responses carry x-ratelimit-*; the product-spec 429 override drops them (Envoy leaves %RESP()% empty
    # there), so the client learns the budget from the last allowed response and Retry-After from the 429.
    [[ -n $last200 ]] && ok_if '  last allowed response: x-ratelimit-remaining: 0 (F3)' grep -qi '^x-ratelimit-remaining: 0' "$last200"
  fi
}

section_ratelimit() {
  local s wait
  section '8. Rate limits block requests (POC limits: API key 10/min per project, anonymous 5/min per IP)' 'Envoy asks the rate-limit service after the auth service has stamped the tier and project. Over the limit, the caller gets the product-spec 429 with Retry-After and x-ratelimit headers. The counters are per minute, so this starts at a fresh window.'
  s=$(date +%S); wait=$((62 - 10#$s))
  printf 'waiting %ss for a fresh one-minute window…\n' "$wait"
  sleep "$wait"
  burst 'developer key' "$DEV_KEY" 15 10
  burst 'anonymous' '' 8 5
}

section_measured() {
  local file title summary
  section '14. Measured so far' 'The numbered POC result notes make the measured progress and any still-running work visible without hiding gaps.'
  printf '%s$ find auth-service/poc-results -maxdepth 1 -type f -name "[0-9][0-9]-*.md" -print | sort%s\n' "$CYAN" "$RESET"
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    title=$(sed -n 's/^# //p' "$file" | head -n 1)
    [[ -n "$title" ]] || title=$(basename "$file")
    printf '\n%s%s%s\n' "$GREEN" "$title" "$RESET"
    summary=$(awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$file")
    if [[ -n "$summary" ]]; then
      printf '%s\n' "$summary" | sanitize
    else
      printf 'running (no ## Summary section yet)\n'
    fi
  done < <(find "$AUTH_SERVICE/poc-results" -maxdepth 1 -type f -name '[0-9][0-9]-*.md' -print 2>/dev/null | sort)
}

section_jwt() {
  section '9. First-party JWT arm' 'The live JWT matrix and rotation result distinguish Envoy fail-open from auth-service verification.'
  local result="$AUTH_SERVICE/poc-results/20-jwt-arm.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 20 result is not available yet'
  fi
}

section_modes() {
  section '10. Enforce versus observe' 'Task 22 shows the gated-route contract and the Phase 1 observe-mode status matrix.'
  local result="$AUTH_SERVICE/poc-results/22-modes.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 22 result is not available yet'
  fi
}

section_drills() {
  section '11. Failure drills (POC round 1)' 'Task 24 records how auth-service, rate-limit Redis, JWKS, and Postgres outages behaved in the dev cauldron.'
  local result="$AUTH_SERVICE/poc-results/24-drills.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 24 result is not available yet'
  fi
}

section_capacity() {
  section '12. Capacity' 'Task 26 records the 10,000-key registry load, direct auth-service sweeps, and gated optional arms.'
  local result="$AUTH_SERVICE/poc-results/26-capacity.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 26 capacity result is not available yet'
  fi
}

section_latency() {
  section '13. Varnish-hit latency' 'Task 25 measures the added latency of auth enforcement on a cacheable anonymous request and compares credentialed arms.'
  local result="$AUTH_SERVICE/poc-results/25-latency.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 25 result is not available yet'
  fi
}

section_read_more() {
  section '15. Where to read more' 'The implementation, infrastructure rollout, and execution status each have a durable place for follow-up.'
  printf '%sDraft PR:%s https://github.com/Sefaria/Sefaria-Project/pull/3736\n' "$GREEN" "$RESET"
  printf '%sInfra PR:%s https://github.com/Sefaria/infrastructure/pull/687\n' "$GREEN" "$RESET"
  printf '%sWiki status:%s https://github.com/Sefaria/sefaria-wiki/wiki/projects/api-key-program/poc-execution-status.md\n' "$GREEN" "$RESET"
  printf '%sWiki source of truth:%s https://github.com/Sefaria/sefaria-wiki/wiki/projects/api-key-program/_index.md\n' "$GREEN" "$RESET"
  printf '%sKeyway (where we stand + playground):%s https://claude.ai/artifact/HYtnjgtbs3Coxr3FeizDR7\n' "$GREEN" "$RESET"
  printf '%sRegistry infra PR:%s https://github.com/Sefaria/infrastructure/pull/690\n' "$GREEN" "$RESET"
}

section_built
if $OFFLINE; then
  printf '\n%sOffline mode:%s skipped deployed, live HTTP, and cluster safety sections.\n' "$YELLOW" "$RESET"
else
  section_deployed
  section_enforced
  section_safe
  section_registry
  if ! $CLUSTER_OK; then
    printf '\n%sCluster unreachable:%s skipped sections 6 and 7; the registry was not changed.\n' "$YELLOW" "$RESET"
  elif $READ_ONLY; then
    printf '\n%sRead-only mode:%s skipped sections 6 and 7 (live registry change and listener drill).\n' "$YELLOW" "$RESET"
  else
    section_propagation
    section_listener_drill
  fi
  $CLUSTER_OK && section_ratelimit
fi
section_jwt
section_modes
section_drills
section_capacity
section_latency
section_measured
section_read_more
