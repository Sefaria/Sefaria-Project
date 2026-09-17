#!/usr/bin/env bash
# Read-only, boss-facing progress demo for the API auth POC.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
AUTH_SERVICE="$ROOT/auth-service"
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
NS=${NS:-default}
HOST=${HOST:-https://www.authpoc.cauldron.sefaria.org}
PAUSE=false
OFFLINE=false
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
  for file in "${TMP_FILES[@]-}"; do
    [[ -n "$file" ]] || continue
    rm -f "$file"
  done
}
trap cleanup EXIT

usage() {
  printf 'Usage: %s [--pause] [--offline]\n' "$0"
}

while (($#)); do
  case "$1" in
    --pause) PAUSE=true ;;
    --offline) OFFLINE=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unavailable: unknown flag %s\n' "$1" >&2; usage; exit 0 ;;
  esac
  shift
done

mask_key() {
  printf '%s…' "${1:0:12}"
}

sanitize() {
  awk '
    {
      while (match($0, /sfr_[[:alnum:]_-]+/)) {
        token = substr($0, RSTART, RLENGTH)
        replacement = substr(token, 1, 12) "…"
        $0 = substr($0, 1, RSTART - 1) replacement substr($0, RSTART + RLENGTH)
      }
      print
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
  if ! capture "$output" "${k[@]}" get deploy auth-service-authpoc auth-service-postgres-authpoc mint-authpoc -o 'custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas,AVAILABLE:.status.availableReplicas' --no-headers; then
    unavailable 'auth-service, mint, or postgres deployments are not readable'
  fi

  output=$(new_tmp)
  if ! capture "$output" "${k[@]}" get securitypolicy authpoc-auth -o 'jsonpath=Accepted={range .status.ancestors[*].conditions[?(@.type=="Accepted")]}{.status} {.reason}{"\n"}{end}'; then
    unavailable 'SecurityPolicy authpoc-auth is not readable'
  fi

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

section_measured() {
  local file title summary
  section '5. Measured so far' 'The numbered POC result notes make the measured progress and any still-running work visible without hiding gaps.'
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
  section '5. First-party JWT arm' 'The live JWT matrix and rotation result distinguish Envoy fail-open from auth-service verification.'
  local result="$AUTH_SERVICE/poc-results/20-jwt-arm.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 20 result is not available yet'
  fi
}

section_modes() {
  section '6. Enforce versus observe' 'Task 22 shows the gated-route contract and the Phase 1 observe-mode status matrix.'
  local result="$AUTH_SERVICE/poc-results/22-modes.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 22 result is not available yet'
  fi
}

section_drills() {
  section '7. Failure drills' 'Task 24 records how auth-service, rate-limit Redis, JWKS, and Postgres outages behaved in the dev cauldron.'
  local result="$AUTH_SERVICE/poc-results/24-drills.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 24 result is not available yet'
  fi
}

section_capacity() {
  section '8. Capacity' 'Task 26 records the 10,000-key registry load, direct auth-service sweeps, and gated optional arms.'
  local result="$AUTH_SERVICE/poc-results/26-capacity.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 26 capacity result is not available yet'
  fi
}

section_latency() {
  section '9. Varnish-hit latency' 'Task 25 measures the added latency of auth enforcement on a cacheable anonymous request and compares credentialed arms.'
  local result="$AUTH_SERVICE/poc-results/25-latency.md"
  if [[ -f "$result" ]]; then
    awk '/^## Summary[[:space:]]*$/{found=1; next} found && /^## /{exit} found{print}' "$result" | sanitize
    printf '%sEvidence:%s %s\n' "$GREEN" "$RESET" "$result"
  else
    unavailable 'Task 25 result is not available yet'
  fi
}

section_read_more() {
  section '10. Where to read more' 'The implementation, infrastructure rollout, and execution status each have a durable place for follow-up.'
  printf '%sDraft PR:%s https://github.com/Sefaria/Sefaria-Project/pull/3736\n' "$GREEN" "$RESET"
  printf '%sInfra PR:%s https://github.com/Sefaria/infrastructure/pull/687\n' "$GREEN" "$RESET"
  printf '%sWiki status:%s https://github.com/Sefaria/sefaria-wiki/wiki/projects/api-key-program/poc-execution-status.md\n' "$GREEN" "$RESET"
}

section_built
if $OFFLINE; then
  printf '\n%sOffline mode:%s skipped deployed, live HTTP, and cluster safety sections.\n' "$YELLOW" "$RESET"
else
  section_deployed
  section_enforced
  section_safe
fi
section_jwt
section_modes
section_drills
section_capacity
section_latency
section_measured
section_read_more
