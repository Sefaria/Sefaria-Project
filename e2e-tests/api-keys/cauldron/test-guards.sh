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
  env -u APIKEYS_ALLOW_SEEDING -u APIKEYS_ALLOW_MUTATING_ON PATH="$tmp:$PATH" ${envs[@]+"${envs[@]}"} bash "$here/run.sh" "$@" >"$tmp/out" 2>&1
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
scales="$(grep -hE 'kubectl .* scale ' "$here"/scripts/*.sh "$here/run.sh" "$here/lib.sh" | grep -vc 'log "' || true)"
[ "$scales" = 2 ] && echo "ok: the only scale calls are drill-f1's scale-down and its restore" || { echo "FAIL: $scales scale calls"; fail=1; }
execs="$(grep -nE 'kubectl .* exec ' "$here"/scripts/*.sh "$here/run.sh" "$here/lib.sh" | grep -vc 'postgres\|PG_POD\|seed_exec\|"\$pod" -c web' || true)"
[ "$execs" = 0 ] && echo "ok: exec only into Postgres (read-only) and the seeder's web pod" || { echo "FAIL: other exec calls"; fail=1; }
# N-CR4: the key scan runs on every mode's exit path. The runner is copied into a scratch git repo with the three modes'
# bodies replaced by no-ops, and a run dir is pre-seeded with a file; a full key must fail the run in each mode, a
# display prefix ("sfr_" plus 6 characters, then bullets) must not, and the mode's own exit status is kept otherwise.
leak="$tmp/leakrepo"; mkdir -p "$leak/e2e-tests/api-keys" "$leak/auth-service/dev/local-stack/scenarios"
cp -R "$here" "$leak/e2e-tests/api-keys/cauldron"
touch "$leak/auth-service/dev/local-stack/scenarios/a-series.sh"
printf 'results/\n' >"$leak/e2e-tests/api-keys/.gitignore"; printf 'e2e-tests/api-keys/results/\n' >"$leak/.gitignore"
git -C "$leak" init -q
printf '\nseeded_guard() { :; }\nseeded_run() { :; }\nverify_off() { :; }\ndrill_f1() { :; }\n' >>"$leak/e2e-tests/api-keys/cauldron/scripts/modes.sh"
expect_scan() {  # expect_scan MODE CONTENT WANT_EXIT
  local mode=$1 content=$2 want=$3 rundir="$leak/e2e-tests/api-keys/results/cauldron-runs/leak-$1"
  rm -rf "$rundir"; mkdir -p "$rundir"; printf '%s\n' "$content" >"$rundir/evidence.log"
  env PATH="$tmp:$PATH" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_MUTATING_ON=apisplit APIKEYS_ALLOW_SEEDING=apisplit APIKEYS_RUN_ID="leak-$mode" \
    bash "$leak/e2e-tests/api-keys/cauldron/run.sh" "$mode" >"$tmp/out" 2>&1
  local rc=$?
  if [ "$rc" = "$want" ] && { [ "$want" = 0 ] || grep -q 'N-CR4-harness' "$tmp/out"; }; then echo "ok: key scan, $mode, exit $rc"
  else echo "FAIL: key scan, $mode: exit $rc, wanted $want"; sed 's/^/    /' "$tmp/out" | tail -6; fail=1; fi
}
for mode in seeded verify-off drill-f1; do
  expect_scan "$mode" "header sfr_AbCdEf0123456789AbCdEf0123456789" 1
  expect_scan "$mode" "shown as sfr_abcdef••••••••" 0
done
bash "$here/run.sh" check >/dev/null 2>&1 && echo "ok: G1 self-check (every cluster call names the dev context)" || { echo "FAIL: G1 self-check"; fail=1; }
exit $fail
