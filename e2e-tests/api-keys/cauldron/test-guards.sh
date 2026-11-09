#!/usr/bin/env bash
# e2e-tests/api-keys/cauldron/test-guards.sh — the runner's go-ahead guards hold before any cluster call. A fake kubectl
# and gh record every call; a guarded mode run without its go-ahead must stop with no call recorded. No cluster needed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for tool in kubectl gh; do
  printf '#!/usr/bin/env bash\necho "%s $*" >>"%s/calls"\nexit 1\n' "$tool" "$tmp" >"$tmp/$tool"
  chmod +x "$tmp/$tool"
done
# expect_refusal LABEL ENV... -- ARGS: the run must exit non-zero, print STOP, and make no cluster call.
expect_refusal() {
  local label=$1; shift
  local envs=()
  while [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : >"$tmp/calls"
  env -u APIKEYS_ALLOW_SEEDING -u APIKEYS_ALLOW_MUTATING_ON PATH="$tmp:$PATH" "${envs[@]}" bash "$here/run.sh" "$@" >"$tmp/out" 2>&1
  local rc=$?
  if [ $rc != 0 ] && grep -q STOP "$tmp/out" && [ ! -s "$tmp/calls" ]; then echo "ok: $label"
  else echo "FAIL: $label (exit $rc, calls: $(tr '\n' ';' <"$tmp/calls"))"; sed 's/^/    /' "$tmp/out" | tail -5; fail=1; fi
}
expect_refusal "seeded without APIKEYS_ALLOW_SEEDING" APIKEYS_CAULDRON=apisplit -- seeded
expect_refusal "seeded with a go-ahead for another cauldron" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_SEEDING=other -- seeded
expect_refusal "seeded on a shared cauldron, even with a go-ahead" APIKEYS_CAULDRON=authpoc APIKEYS_ALLOW_SEEDING=authpoc -- seeded
expect_refusal "seeded without a password file" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_SEEDING=apisplit APIKEYS_E2E_PASSWORD_FILE=/nonexistent -- seeded
expect_refusal "drill-f1 without APIKEYS_ALLOW_MUTATING_ON" APIKEYS_CAULDRON=apisplit -- drill-f1
expect_refusal "drill-f1 with a go-ahead for another cauldron" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_MUTATING_ON=other -- drill-f1
expect_refusal "a kube context other than the dev cluster" APIKEYS_KUBE_CONTEXT=gke_production -- free
expect_refusal "an unknown mode" -- bogus
# Writes stay behind the guards: outside modes.sh's two guarded functions, no runner line names a write verb.
if grep -nE 'kubectl[^|]*\b(apply|patch|delete|edit|replace|annotate|label|create|rollout|cordon|drain)\b' "$here/run.sh" "$here/lib.sh" "$here"/scripts/*.sh; then
  echo "FAIL: a cluster write verb appears in the runner"; fail=1
else echo "ok: no apply/patch/delete/edit/create/rollout in the runner"; fi
scales="$(grep -cE 'kubectl .* scale ' "$here"/scripts/*.sh "$here/run.sh" "$here/lib.sh" | awk -F: '{s+=$2} END {print s}')"
[ "$scales" = 2 ] && echo "ok: the only scale calls are drill-f1's scale-down and its restore" || { echo "FAIL: $scales scale calls"; fail=1; }
execs="$(grep -nE 'kubectl .* exec ' "$here"/scripts/*.sh "$here/run.sh" "$here/lib.sh" | grep -vc 'postgres\|PG_POD\|seed_exec\|"\$pod" -c web' || true)"
[ "$execs" = 0 ] && echo "ok: exec only into Postgres (read-only) and the seeder's web pod" || { echo "FAIL: other exec calls"; fail=1; }
bash "$here/run.sh" check >/dev/null 2>&1 && echo "ok: G1 self-check (every cluster call names the dev context)" || { echo "FAIL: G1 self-check"; fail=1; }
exit $fail
