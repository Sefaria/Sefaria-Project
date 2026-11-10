#!/usr/bin/env bash
# test-discovery.sh: the migration discovery of `preflight.sh --stage promote` (and --env prod), run the way a real run
# does: from the repository root, over `git ls-tree -r` of a ref of the real tree. The fixture Django app of this test
# suite (scripts/release/api-keys-phase1/tests/fixtures/migrate-app/fixtureapp/migrations/) lives in that tree and must
# never be counted as pending. Also reads authService.enabled from env files. Needs bash, git and python3; no cluster.
#   tests/test-discovery.sh [REPO_ROOT]
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "${1:-$HERE}" rev-parse --show-toplevel)"
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

# The same function preflight.sh calls (lib.sh), from the repository root as a real run does.
found="$(cd "$ROOT" && bash -c 'source scripts/release/api-keys-phase1/lib.sh; code_migrations "$1" HEAD' _ "$ROOT")" || { bad "code_migrations failed"; exit 1; }
[[ -n "$found" ]] && ok "discovery lists $(wc -l <<<"$found" | tr -d ' ') migrations at HEAD of $ROOT" || bad "discovery listed nothing"

# Every migration file under scripts/ in the tree must be absent from the list; the fixture app must exist in the tree,
# or this test would pass for the wrong reason.
under_scripts="$(git -C "$ROOT" ls-tree -r --name-only HEAD | grep '^scripts/.*/migrations/[0-9]\{4\}_.*\.py$' || true)"
[[ -n "$under_scripts" ]] && ok "the tree holds migration files under scripts/ ($(wc -l <<<"$under_scripts" | tr -d ' '))" || bad "no migration file under scripts/ in the tree: the test proves nothing"
while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  app="$(basename "$(dirname "$(dirname "$path")")")"
  name="$(basename "$path" .py)"
  if grep -qxF "$app"$'\t'"$name" <<<"$found"; then bad "$path is counted as a pending-candidate migration ($app/$name)"; else ok "$app/$name (from $path) is not listed"; fi
done <<<"$under_scripts"
! grep -q '^fixtureapp'$'\t' <<<"$found" && ok "no fixtureapp migration in the discovery" || bad "fixtureapp is in the discovery"
grep -q '^powered_by'$'\t' <<<"$found" && ok "powered_by migrations are still discovered" || bad "powered_by migrations are not discovered"

# authService.enabled of an env file (a YAML boolean; anything else is an error: the reader fails closed).
PY="${APIKEYS_RELEASE_PYTHON3:-python3}"
RP="$HERE/../release_lib.py"
real="$(git -C "$ROOT" show HEAD:envs/preprod/helmrelease.yaml | "$PY" "$RP" auth-service-enabled)"
[[ "$real" == false ]] && ok "envs/preprod ships with authService.enabled false" || bad "envs/preprod authService.enabled read as '$real'"
flipped="$(git -C "$ROOT" show HEAD:envs/preprod/helmrelease.yaml | awk '/^    authService:/ {s=1} s && /^      enabled: false/ {sub(/false/, "true"); s=0} {print}' | "$PY" "$RP" auth-service-enabled)"
[[ "$flipped" == true ]] && ok "authService.enabled: true in the env file is read as true" || bad "flipped env file read as '$flipped'"
none_rc=0
none="$(printf 'kind: HelmRelease\nspec:\n  values:\n    web:\n      enabled: true\n' | "$PY" "$RP" auth-service-enabled 2>/dev/null)" || none_rc=$?
if [[ "$none_rc" == 2 && -z "$none" ]]; then ok "no authService section is an error, not false (another section's enabled is not mistaken for it)"; else bad "no authService section: exit $none_rc, output '$none'"; fi
quoted_rc=0
quoted="$(git -C "$ROOT" show HEAD:envs/preprod/helmrelease.yaml | sed 's/^      enabled: false/      enabled: "false"/' | "$PY" "$RP" auth-service-enabled 2>/dev/null)" || quoted_rc=$?
if [[ "$quoted_rc" == 2 && -z "$quoted" ]]; then ok 'authService.enabled: "false" (a string) is an error, not a guess'; else bad "quoted boolean: exit $quoted_rc, output '$quoted'"; fi
exit "$fail"
