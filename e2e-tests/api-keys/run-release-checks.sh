#!/usr/bin/env bash
# e2e-tests/api-keys/run-release-checks.sh — the API-keys checks to run before the phase 1 merge to master, with one
# summary table at the end. README.md "Before the master merge" says what each step proves and what a pass looks like.
#
#   run-release-checks.sh static            no stack, no cluster: per-env render checks, the gate-script tests, the
#                                           provisioning test (docker), the feature matrix and its unit tests
#   run-release-checks.sh local             static, then the local stack: up, smoke, seed, the A-series in enforce
#                                           and observe, every stack drill, the Playwright api-keys suite, demo.sh,
#                                           and a teardown that must leave 0 fixture rows
#   run-release-checks.sh cauldron          the read-only cauldron run (cauldron/run.sh free): no cluster writes
#   run-release-checks.sh cauldron-seeded   cauldron/run.sh seeded: refuses to start without
#                                           APIKEYS_ALLOW_SEEDING=<cauldron> (Yotam's go-ahead, cauldron/SAFETY.md)
#
# Env: APIKEYS_STACK_PYTHON  a Python with the repo's requirements and PyYAML (default: the checkout's .venv)
#      PLAYWRIGHT_WORKERS    default 2 (local); the cauldron is clamped to 2 by the config
#      SKIP_SLOW_DRILLS=1    leave out nm9-master-merge and nm14-bundle (each builds or tests a second checkout)
#      KEEP_FIXTURES=1       skip the final teardown (the next run's --reset replaces them anyway)
# Exit status: 0 when no step failed. Known gaps (@known-gap, GAP lines) are counted, never failures.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STACK="$REPO/auth-service/dev/local-stack"
SCRIPTS="$REPO/auth-service/scripts"
MODE="${1:-}"
case "$MODE" in static|local|cauldron|cauldron-seeded) ;; *) sed -n 2,20p "$0"; exit 2 ;; esac

if [ -z "${APIKEYS_STACK_PYTHON:-}" ] && [ -x "$REPO/.venv/bin/python" ]; then APIKEYS_STACK_PYTHON="$REPO/.venv/bin/python"; fi
PY="${APIKEYS_STACK_PYTHON:-python3}"
export APIKEYS_STACK_PYTHON="$PY"
export APIKEYS_E2E_PASSWORD_FILE="${APIKEYS_E2E_PASSWORD_FILE:-$REPO/.claude/scratch/api-keys-e2e/password}"
WORKERS="${PLAYWRIGHT_WORKERS:-2}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$MODE"
OUT="$HERE/results/release-checks/$RUN_ID"
mkdir -p "$OUT"
git -C "$REPO" check-ignore -q "$OUT" || { echo "refusing: $OUT is not git-ignored (it may hold request logs)"; exit 2; }
SUMMARY="$OUT/summary.tsv"; : >"$SUMMARY"
FAILED=0

# row STEP STATUS DETAIL LOG
row() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "${4#"$REPO"/}" >>"$SUMMARY"
  printf '[%s] %-34s %-6s %s\n' "$(date +%H:%M:%S)" "$1" "$2" "$3"
  [ "$2" = FAIL ] && FAILED=$((FAILED + 1))
  return 0
}
mask() { sed -E 's/sfr_[A-Za-z0-9_-]{1,}/sfr_…/g'; }
# step NAME COMMAND...: runs it with output to NAME.log; PASS on exit 0.
step() {
  local name="$1"; shift
  local log="$OUT/$name.log"
  ( "$@" ) 2>&1 | mask >"$log"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" = 0 ]; then row "$name" PASS "$(tail -1 "$log" | cut -c1-120)" "$log"
  else row "$name" FAIL "exit $rc: $(grep -m1 -E 'FAIL|MISMATCH|Error|error' "$log" | cut -c1-120)" "$log"; fi
  return "$rc"
}
# drill NAME: a stack scenario script; its last line is "done  NAME: P pass, G gap, F FAIL" and its exit is F.
drill() {
  local name="$1" log="$OUT/drill-$1.log"
  timeout 1800 "$STACK/scenarios/$name.sh" 2>&1 | mask >"$log"
  local rc=${PIPESTATUS[0]} done
  done="$(grep -E '^done' "$log" | tail -1 | sed -E 's/^done +//')"
  if [ "$rc" = 0 ] && [ -n "$done" ]; then row "drill $name" PASS "${done#*: }" "$log"
  else row "drill $name" FAIL "exit $rc: ${done:-$(tail -1 "$log" | cut -c1-100)}" "$log"; fi
}

static_checks() {
  command -v helm >/dev/null || row "static: helm" FAIL "helm is not on PATH (render checks need it)"
  step "render-check (staging, preprod, prod)" env PY="$PY" bash "$SCRIPTS/render-check.sh"
  step "render-check negative tests" env PY="$PY" bash "$SCRIPTS/test-render-check.sh"
  step "policy-gate tests (fake kubectl, each env's render)" env PY="$PY" bash "$SCRIPTS/test-policy-gate.sh"
  step "provision-cluster-registry tests" bash "$SCRIPTS/test-provision-cluster-registry.sh"
  step "feature matrix --strict" "$PY" "$HERE/check_features.py" --strict
  step "feature matrix unit tests" "$PY" -m unittest discover -s "$HERE/tests" -t "$REPO"
}

seed() {  # seed ARGS... with the stack's settings wrapper
  (cd "$REPO" && env -u FRONT_END_URL -u CI_RUN PYTHONPATH="$STACK" DJANGO_SETTINGS_MODULE=django_settings \
    "$PY" scripts/dev/seed_api_keys_e2e.py --target local "$@")
}

# The manifest holds key values: it is git-ignored and written with umask 077.
seed_reset() { seed --reset >/dev/null && (umask 077; seed --manifest-stdout >"$REPO/e2e-tests/.apikeys-e2e.json") && echo "manifest written"; }
# --teardown removes the fixtures (the stack sentinel stays); --leftovers exits 1 unless it counts 0.
seed_teardown() { seed --teardown && seed --leftovers; }

# The Playwright api-keys projects; failures whose title carries @known-gap are known gaps, any other failure fails.
playwright_suite() {
  local log="$OUT/playwright.log" json="$OUT/playwright.json"
  (cd "$REPO" && env -u APIKEYS_TRACE APIKEYS_TARGET=local PLAYWRIGHT_JSON_OUTPUT_NAME="$json" \
    npx playwright test --project=apikeys --workers="$WORKERS" --reporter=line,json) 2>&1 | mask >"$log"
  local prc=${PIPESTATUS[0]} counts
  counts="$("$PY" - "$json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
n = {"passed": 0, "skipped": 0, "known_gap": 0, "failed": 0, "flaky": 0}
failed = []
def walk(suite):
    for s in suite.get("suites", []):
        walk(s)
    for spec in suite.get("specs", []):
        for t in spec.get("tests", []):
            status = t.get("status")
            if status == "skipped":
                n["skipped"] += 1
            elif status == "expected":
                n["passed"] += 1
            elif status == "flaky":
                n["flaky"] += 1
            elif "@known-gap" in spec["title"]:
                n["known_gap"] += 1
            else:
                n["failed"] += 1
                failed.append(spec["title"][:70])
for s in data.get("suites", []):
    walk(s)
# Report-level errors (a broken config, a crashed worker) and an empty run are failures too.
errors = data.get("errors") or []
if errors or not (n["passed"] + n["known_gap"] + n["failed"] + n["flaky"]):
    n["failed"] += max(len(errors), 1)
    failed.append("report errors: %d, tests run: %d" % (len(errors), n["passed"] + n["known_gap"] + n["flaky"]))
print("%(failed)d\t%(passed)d passed, %(skipped)d skipped, %(known_gap)d known-gap failures, %(flaky)d flaky, %(failed)d failed" % n
      + ("; failed: " + " | ".join(failed[:5]) if failed else ""))
PY
)"
  if [ -z "$counts" ]; then row "playwright apikeys (local)" FAIL "no JSON report; see the log" "$log"
  elif [ "${counts%%$'\t'*}" = 0 ] && { [ "$prc" = 0 ] || [[ ${counts#*$'\t'} != *" 0 known-gap"* ]]; }; then
    row "playwright apikeys (local)" PASS "${counts#*$'\t'}" "$log"
  elif [ "${counts%%$'\t'*}" = 0 ]; then row "playwright apikeys (local)" FAIL "exit $prc with no failing test: ${counts#*$'\t'}" "$log"
  else row "playwright apikeys (local)" FAIL "${counts#*$'\t'}" "$log"; fi
}

local_checks() {
  [ -x "$PY" ] || command -v "$PY" >/dev/null || { row "local: python" FAIL "no Python at $PY (set APIKEYS_STACK_PYTHON)"; return; }
  if [ ! -f "$APIKEYS_E2E_PASSWORD_FILE" ]; then
    mkdir -p "$(dirname "$APIKEYS_E2E_PASSWORD_FILE")"
    ( umask 077; "$PY" -c 'import secrets; print("E2e-" + secrets.token_urlsafe(18))' >"$APIKEYS_E2E_PASSWORD_FILE" )
  fi
  step "stack up" env SKIP_WEBPACK="${SKIP_WEBPACK:-}" "$STACK/up.sh" || { row "local" FAIL "the stack is not up; later steps skipped"; return; }
  step "smoke (S1-S4, revoke-to-deny)" "$STACK/smoke.sh"
  grep -E '^S4 ' "$OUT/smoke (S1-S4, revoke-to-deny).log" | sed 's/^/    /'
  step "seed: --reset and the manifest" seed_reset

  "$STACK/scenarios/a-series.sh" keepunchanged-envoy start >"$OUT/keepunchanged-envoy.log" 2>&1
  step "a-series (enforce)" "$STACK/scenarios/a-series.sh" --mode enforce
  step "auth service to observe" env AUTH_MODE=observe SKIP_WEBPACK=1 "$STACK/up.sh"
  step "a-series (observe)" "$STACK/scenarios/a-series.sh" --mode observe
  step "auth service back to enforce" env SKIP_WEBPACK=1 "$STACK/up.sh"
  "$STACK/scenarios/a-series.sh" keepunchanged-envoy stop >>"$OUT/keepunchanged-envoy.log" 2>&1

  local d
  for d in e1-registry e2-observe e3-helm f1-stop f2-bad-dsn f3-listen f4-rotate f5-latency ncr8-empty-start ne3-guard \
      ne4-grant ne5-badmode nf1-sigterm nf2-pause b9-legacy-body d-old-code nm7-migrate-roundtrip; do
    drill "$d"
  done
  if [ -z "${SKIP_SLOW_DRILLS:-}" ]; then drill nm9-master-merge; drill nm14-bundle
  else row "drill nm9-master-merge, nm14-bundle" SKIP "SKIP_SLOW_DRILLS=1"; fi

  playwright_suite
  step "demo.sh (local, mutating sections on)" bash "$SCRIPTS/demo.sh" --target local --allow-mutating

  if [ -z "${KEEP_FIXTURES:-}" ]; then
    step "seed: --teardown leaves 0 rows" seed_teardown
  else
    row "seed: --teardown leaves 0 rows" SKIP "KEEP_FIXTURES=1"
  fi
}

case "$MODE" in
  static) static_checks ;;
  local) static_checks; local_checks ;;
  cauldron) step "cauldron run (read-only)" bash "$HERE/cauldron/run.sh" free ;;
  cauldron-seeded) step "cauldron run (seeded)" bash "$HERE/cauldron/run.sh" seeded ;;
esac

echo
echo "== API-keys release checks ($MODE), run $RUN_ID"
column -t -s $'\t' "$SUMMARY" 2>/dev/null | cut -c1-220 || cat "$SUMMARY"
echo "logs: ${OUT#"$REPO"/}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL ($FAILED step(s))"
exit $((FAILED > 0))
