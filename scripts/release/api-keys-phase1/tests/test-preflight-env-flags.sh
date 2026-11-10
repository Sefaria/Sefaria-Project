#!/usr/bin/env bash
# test-preflight-env-flags.sh: how preflight.sh reads two settings out of the env files, with no cluster. kubectl is a stub
# that prints nothing (but the context name) and succeeds, so every cluster check fails or warns; only the lines about the env files are judged.
#   - DEVELOPER_SETTINGS_ENABLED in envs/preprod at the code ref: only an explicit off value ("False", "false", "0",
#     quoted or not, with a comment or not) passes; "1", "True", a single-quoted value, an empty value, a missing entry
#     and an unreadable file all fail. Django enables it only for "true" (local-settings-file.yaml), so "1" is off there;
#     failing it is deliberate: a release check accepts what it knows to be off and nothing else.
#   - authService.enabled: the reader role and the registry Secret are required when EITHER the deployed env file
#     (origin/<env branch>) OR the code ref's enables it, and an unreadable file is a FAIL, never "not enabled".
#   tests/test-preflight-env-flags.sh [RELEASE_DIR]     (bash 4+, git, python3)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REL="$(cd "${1:-$HERE/..}" && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/preflight-env-flags.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

mkdir -p "$WORK/bin"
# shellcheck disable=SC2016  # the stub is a script of its own: its $1 and $2 are not ours
printf '#!/bin/sh\n[ "$1 $2" = "config get-contexts" ] && echo kind-flags\nexit 0\n' >"$WORK/bin/kubectl"
chmod +x "$WORK/bin/kubectl"

# A repository whose origin/master and origin/preprod hold the given preprod env file (master) and deployed file (preprod).
# make_repo DIR MASTER_FILE PREPROD_FILE ("-" leaves that ref without the file)
make_repo() {
  local dir="$1" master_file="$2" preprod_file="$3"
  git init -q -b master "$dir"
  git -C "$dir" config user.email release-tests@example.org
  git -C "$dir" config user.name "release tests"
  mkdir -p "$dir/envs/preprod"
  echo base >"$dir/README"
  git -C "$dir" add -A && git -C "$dir" commit -q -m base
  git -C "$dir" branch preprod
  if [[ "$master_file" != - ]]; then cp "$master_file" "$dir/envs/preprod/helmrelease.yaml" && git -C "$dir" add -A && git -C "$dir" commit -q -m master-env; fi
  if [[ "$preprod_file" != - ]]; then
    git -C "$dir" checkout -q preprod && mkdir -p "$dir/envs/preprod" && cp "$preprod_file" "$dir/envs/preprod/helmrelease.yaml"
    git -C "$dir" add -A && git -C "$dir" commit -q -m preprod-env && git -C "$dir" checkout -q master
  fi
  git -C "$dir" update-ref refs/remotes/origin/master master
  git -C "$dir" update-ref refs/remotes/origin/preprod preprod
}
# env_file OUT DEV_LINE AUTH_ENABLED: a minimal env file. DEV_LINE is the whole DEVELOPER_SETTINGS_ENABLED line, or "".
env_file() {
  {
    echo "spec:"
    echo "  values:"
    echo "    localSettings:"
    [[ -z "$2" ]] || echo "      $2"
    echo "      OTHER: x"
    echo "    authService:"
    echo "      enabled: $3"
  } >"$1"
}
run_preflight() { # repo [extra args]: prints the output
  local repo="$1"
  shift
  APIKEYS_RELEASE_TEST_CONTEXT=kind-flags PATH="$WORK/bin:$PATH" "$REL/preflight.sh" --env preprod --context kind-flags --repo "$repo" --no-fetch --skip-image-check "$@" 2>&1
}

# --- DEVELOPER_SETTINGS_ENABLED ---
n=0
dev_case() { # EXPECT(PASS|FAIL) DESC LINE
  n=$((n + 1))
  local expect="$1" desc="$2" line="$3" f="$WORK/dev$n.yaml" repo="$WORK/dev$n" out
  env_file "$f" "$line" false
  make_repo "$repo" "$f" "$f"
  out="$(run_preflight "$repo" | grep 'DEVELOPER_SETTINGS_ENABLED' || true)"
  if [[ "$out" == "$expect "* ]]; then ok "DEVELOPER_SETTINGS_ENABLED $desc -> $expect"; else bad "DEVELOPER_SETTINGS_ENABLED $desc: wanted $expect, got: ${out:-nothing}"; fi
}
dev_case PASS 'is "False"' 'DEVELOPER_SETTINGS_ENABLED: "False"'
dev_case PASS 'is false, unquoted' 'DEVELOPER_SETTINGS_ENABLED: false'
dev_case PASS 'is "0"' 'DEVELOPER_SETTINGS_ENABLED: "0"'
dev_case PASS 'is "False" with a trailing comment' 'DEVELOPER_SETTINGS_ENABLED: "False"  # off until prod runs it'
dev_case FAIL 'is "True"' 'DEVELOPER_SETTINGS_ENABLED: "True"'
dev_case FAIL 'is true, unquoted' 'DEVELOPER_SETTINGS_ENABLED: true'
dev_case FAIL "is 'True', single-quoted" "DEVELOPER_SETTINGS_ENABLED: 'True'"
dev_case FAIL 'is "1"' 'DEVELOPER_SETTINGS_ENABLED: "1"'
dev_case FAIL 'is 1, unquoted' 'DEVELOPER_SETTINGS_ENABLED: 1'
dev_case FAIL 'is empty' 'DEVELOPER_SETTINGS_ENABLED: ""'
dev_case FAIL 'has no value' 'DEVELOPER_SETTINGS_ENABLED:'
dev_case FAIL 'is missing' ''
dev_case FAIL 'is only in a comment' '# DEVELOPER_SETTINGS_ENABLED: "False"'
# unreadable: the code ref has no preprod env file
n=$((n + 1))
f="$WORK/auth-base.yaml"
env_file "$f" 'DEVELOPER_SETTINGS_ENABLED: "False"' false
make_repo "$WORK/dev$n" - "$f"
out="$(run_preflight "$WORK/dev$n" | grep 'DEVELOPER_SETTINGS_ENABLED' || true)"
if [[ "$out" == FAIL* ]]; then ok "DEVELOPER_SETTINGS_ENABLED: an unreadable env file at the code ref -> FAIL"; else bad "unreadable env file at the code ref: ${out:-nothing}"; fi

# --- authService.enabled ---
auth_case() { # DESC DEPLOYED_ENABLED CODE_ENABLED EXPECT(FAIL|WARN) [extra preflight args]
  local desc="$1" deployed="$2" code="$3" expect="$4"
  shift 4
  n=$((n + 1))
  local repo="$WORK/auth$n" out
  env_file "$WORK/auth-deployed$n.yaml" 'DEVELOPER_SETTINGS_ENABLED: "False"' "$deployed"
  env_file "$WORK/auth-code$n.yaml" 'DEVELOPER_SETTINGS_ENABLED: "False"' "$code"
  make_repo "$repo" "$WORK/auth-code$n.yaml" "$WORK/auth-deployed$n.yaml"
  out="$(run_preflight "$repo" "$@" | grep -E 'role sefaria_auth_reader|role .*reader' | head -1 || true)"
  if [[ "$out" == "$expect "* ]]; then ok "reader role check, $desc -> $expect"; else bad "reader role check, $desc: wanted $expect, got: ${out:-nothing}"; fi
}
auth_case 'enabled in neither file' false false WARN
auth_case 'enabled in the deployed file only' true false FAIL
auth_case 'enabled in the code ref only' false true FAIL
auth_case 'enabled in both' true true FAIL
auth_case 'enabled in neither, --require-auth-service' false false FAIL --require-auth-service
# unreadable deployed file (origin/preprod lacks it): a FAIL naming the file, and the reader checks are strict
n=$((n + 1))
env_file "$WORK/auth-code$n.yaml" 'DEVELOPER_SETTINGS_ENABLED: "False"' false
make_repo "$WORK/auth$n" "$WORK/auth-code$n.yaml" -
out="$(run_preflight "$WORK/auth$n")"
if grep -qE '^FAIL +cannot read envs/preprod/helmrelease.yaml at origin/preprod' <<<"$out"; then ok "an unreadable deployed env file -> FAIL"; else bad "unreadable deployed env file: $(grep -E 'cannot read|reader' <<<"$out" | head -3)"; fi
if grep -qE '^FAIL +role .*reader' <<<"$out"; then ok "an unreadable deployed env file makes the reader role required"; else bad "reader role not required after an unreadable file"; fi
exit "$fail"
