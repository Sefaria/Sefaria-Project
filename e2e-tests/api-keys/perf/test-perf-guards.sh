#!/usr/bin/env bash
# e2e-tests/api-keys/perf/test-perf-guards.sh — run-perf-cauldron.sh refuses before any cluster call unless the run
# names a dedicated perf cauldron twice, stays inside its caps and uses the dev context; and every cluster call it
# does make names that context and the default namespace. A fake kubectl records every call. No cluster needed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
runner="$here/run-perf-cauldron.sh"
tmp=$(mktemp -d)
# Runs past the guards write results dirs for the made-up cauldron perf-guardtest; remove them on exit.
trap 'rm -rf "$tmp" "$here"/../results/perf-runs/*-perf-guardtest-*' EXIT
fail=0
DEV=gke_development-205018_us-east1-b_cluster-1
mkdir -p "$tmp/fake"
printf '#!/usr/bin/env bash\necho "kubectl $*" >>"%s/calls"\nexit 1\n' "$tmp" >"$tmp/kubectl"
chmod +x "$tmp/kubectl"
echo "sfr_testkeyvalue0000000000000000000000" >"$tmp/key"; echo pw >"$tmp/pw"
ok_env=(APIKEYS_CAULDRON=perf-guardtest APIKEYS_PERF_CAULDRON=perf-guardtest APIKEYS_PERF_BASE=http://envoy-default-eg-0a1b2c3d.envoy-gateway-system.svc.cluster.local
        APIKEYS_E2E_PASSWORD_FILE="$tmp/pw")

run() {  # run ENV... -- ARGS -> exit status; output in $tmp/out, cluster calls in $tmp/calls
  local envs=()
  while [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : >"$tmp/calls"
  env -u APIKEYS_CAULDRON -u APIKEYS_PERF_CAULDRON -u APIKEYS_KUBE_CONTEXT -u APIKEYS_PERF_BASE -u APIKEYS_PERF_KEY_FILE \
    -u RATE -u DURATION -u ARMS -u TRIALS -u POLL PATH="$tmp:$PATH" "${envs[@]}" bash "$runner" "$@" >"$tmp/out" 2>&1
}
expect_refusal() {  # expect_refusal LABEL ENV... -- ARGS
  local label=$1; shift
  run "$@"; local rc=$?
  if [ $rc != 0 ] && grep -q STOP "$tmp/out" && [ ! -s "$tmp/calls" ]; then echo "ok: refuses $label"
  else echo "FAIL: $label (exit $rc, calls: $(tr '\n' ';' <"$tmp/calls"))"; sed 's/^/    /' "$tmp/out" | tail -5; fail=1; fi
}

for mode in latency revoke plan; do
  expect_refusal "$mode without APIKEYS_CAULDRON" APIKEYS_PERF_CAULDRON=perf-apikeys -- $mode
  expect_refusal "$mode without APIKEYS_PERF_CAULDRON" APIKEYS_CAULDRON=perf-apikeys -- $mode
  expect_refusal "$mode with a go-ahead for another cauldron" APIKEYS_CAULDRON=perf-apikeys APIKEYS_PERF_CAULDRON=perf-other -- $mode
done
for shared in apisplit authpoc api-keys-poc apikeys-pipeline; do
  expect_refusal "the shared cauldron $shared, even with a go-ahead" APIKEYS_CAULDRON=$shared APIKEYS_PERF_CAULDRON=$shared -- latency
done
expect_refusal "a cauldron whose name does not say perf" APIKEYS_CAULDRON=yotam APIKEYS_PERF_CAULDRON=yotam -- latency
expect_refusal "a name that is not a cauldron name" "APIKEYS_CAULDRON=perf;x" "APIKEYS_PERF_CAULDRON=perf;x" -- latency
expect_refusal "a kube context other than the dev cluster" "${ok_env[@]}" APIKEYS_KUBE_CONTEXT=gke_production -- latency
expect_refusal "RATE over the cap" "${ok_env[@]}" RATE=51 -- latency
expect_refusal "RATE 0" "${ok_env[@]}" RATE=0 -- latency
expect_refusal "DURATION over the cap" "${ok_env[@]}" DURATION=181s -- latency
expect_refusal "DURATION in minutes" "${ok_env[@]}" DURATION=3m -- latency
expect_refusal "an unknown arm" "${ok_env[@]}" ARMS=anon,flood -- latency
expect_refusal "TRIALS over the cap" "${ok_env[@]}" TRIALS=21 -- revoke
expect_refusal "POLL under the floor" "${ok_env[@]}" POLL=0.001 -- revoke
expect_refusal "latency with an arbitrary in-cluster host as the base" APIKEYS_CAULDRON=perf-apikeys APIKEYS_PERF_CAULDRON=perf-apikeys APIKEYS_PERF_BASE=http://evil.default.svc.cluster.local -- latency
expect_refusal "revoke with a base that is neither the Envoy Service nor the cauldron's host" "${ok_env[@]}" APIKEYS_PERF_BASE=https://www.apisplit.cauldron.sefaria.org -- revoke
expect_refusal "latency with a public URL as the base" APIKEYS_CAULDRON=perf-apikeys APIKEYS_PERF_CAULDRON=perf-apikeys APIKEYS_PERF_BASE=https://www.perf-apikeys.cauldron.sefaria.org -- latency
expect_refusal "a key file that does not exist" "${ok_env[@]}" APIKEYS_PERF_KEY_FILE=/nonexistent -- latency
expect_refusal "revoke without the fixture password file" APIKEYS_CAULDRON=perf-apikeys APIKEYS_PERF_CAULDRON=perf-apikeys -- revoke
expect_refusal "an unknown mode" "${ok_env[@]}" -- bogus

# plan: passes the guards, prints the Job, and makes no cluster call.
run "${ok_env[@]}" APIKEYS_PERF_KEY_FILE="$tmp/key" -- plan; rc=$?
if [ $rc = 0 ] && [ ! -s "$tmp/calls" ] && grep -q 'kind: Job' "$tmp/out" && grep -q 'value: "25"' "$tmp/out" \
    && grep -q '"kind": "Secret"' "$tmp/out" && grep -q '"apikeys-perf/run"' "$tmp/out" \
    && ! grep -q sfr_testkey "$tmp/out"; then echo "ok: plan prints the labelled ConfigMap, Secret and Job (rate 25) without a cluster call or the key"
else echo "FAIL: plan (exit $rc)"; tail -5 "$tmp/out" | sed 's/^/    /'; fail=1; fi
run "${ok_env[@]}" -- plan
grep -q 'value: "anon,miss"' "$tmp/out" && echo "ok: without a key file the hit arm is left out" || { echo "FAIL: hit arm without a key"; fail=1; }

# The Job manifest parses and has the shape a k6 Job needs (PyYAML from APIKEYS_STACK_PYTHON or python3).
run "${ok_env[@]}" APIKEYS_PERF_KEY_FILE="$tmp/key" -- plan
sed -n '/^--- Job manifest$/,$p' "$tmp/out" | tail -n +2 >"$tmp/job.yaml"
if "${APIKEYS_STACK_PYTHON:-python3}" - "$tmp/job.yaml" <<'PY'
import sys, yaml
job = yaml.safe_load(open(sys.argv[1]))
c = job["spec"]["template"]["spec"]["containers"][0]
env = {e["name"]: e["value"] for e in c["env"]}
assert job["kind"] == "Job" and job["metadata"]["namespace"] == "default", job["metadata"]
assert job["spec"]["backoffLimit"] == 0 and job["spec"]["activeDeadlineSeconds"] == 300
assert c["image"].startswith("grafana/k6:") and c["args"][-1] == "/scripts/arms.js"
assert env["HOST"] == "www.perf-guardtest.cauldron.sefaria.org" and env["MISS_STATUS"] == "200" and env["SUMMARY_STDOUT"] == "1"
assert env["KEY_FILE"] == "/keys/key"
PY
then echo "ok: the Job manifest parses (namespace default, backoffLimit 0, deadline, k6 env)"
else echo "FAIL: the Job manifest"; fail=1; fi

# compare: added p50/p99 between a flag-off and a flag-on file, and it refuses swapped files.
mk() { printf '{"flag": "%s", "k6": {"arms": {"anon": {"p50": %s, "p99": %s}}}}\n' "$1" "$2" "$3" >"$tmp/$1.json"; }
mk off 1.0 2.0; mk on 2.5 5.5
out="$(bash "$runner" compare "$tmp/off.json" "$tmp/on.json")"
echo "$out" | grep -q 'added p50 +1.500 ms (baseline +1.30), p99 +3.500 ms (baseline +3.02)' && echo "ok: compare computes the added p50/p99" \
  || { echo "FAIL: compare: $out"; fail=1; }
bash "$runner" compare "$tmp/on.json" "$tmp/off.json" >/dev/null 2>&1 && { echo "FAIL: compare accepted swapped files"; fail=1; } \
  || echo "ok: compare refuses a flag-on file as the baseline"
python3 -c "import ast, sys; ast.parse(open(sys.argv[1]).read())" "$here/revoke_trials_pod.py" && echo "ok: revoke_trials_pod.py compiles" || { echo "FAIL: revoke_trials_pod.py"; fail=1; }

# Past the guards, every cluster call names the dev context and the default namespace (the fake kubectl fails, so
# the runner stops at its first reads).
for mode in latency revoke; do
  run "${ok_env[@]}" -- $mode
  if [ -s "$tmp/calls" ] && ! grep -v -- "--context $DEV -n default " "$tmp/calls" | grep -q .; then
    echo "ok: $mode's cluster calls all name --context $DEV -n default ($(wc -l <"$tmp/calls") calls)"
  else echo "FAIL: $mode made a call without the dev context: $(tr '\n' ';' <"$tmp/calls")"; fail=1; fi
done

# A cluster read that fails (not a NotFound) stops the run: it is never taken for "the flag is off".
run "${ok_env[@]}" -- latency; rc=$?
[ $rc != 0 ] && grep -q "cluster read failed" "$tmp/out" && ! grep -q " create " "$tmp/calls" \
  && echo "ok: a failed cluster read stops the run before any create" || { echo "FAIL: failed read (exit $rc)"; fail=1; }

# Two runs never share a resource name (the exit trap deletes by the name's label).
run "${ok_env[@]}" -- plan; n1="$(grep -m1 -oE 'apikeys-perf-[0-9]{6}-[0-9a-f]{8}' "$tmp/out")"
run "${ok_env[@]}" -- plan; n2="$(grep -m1 -oE 'apikeys-perf-[0-9]{6}-[0-9a-f]{8}' "$tmp/out")"
[ -n "$n1" ] && [ "$n1" != "$n2" ] && echo "ok: each run gets its own resource name" || { echo "FAIL: names '$n1' '$n2'"; fail=1; }

# Happy paths against a fake cluster that answers: the flag on, enforce, one web pod, a finished Job.
cat >"$tmp/fake/kubectl" <<FAKE
#!/usr/bin/env bash
echo "kubectl \$*" >>"$tmp/calls"
case "\$*" in
  *" get helmrelease/"*) echo true ;;
  *" get deploy/"*) echo enforce ;;
  *" get pods "*) echo web-0 ;;
  *" get job/"*) echo 1/ ;;
  *" logs job/"*) [ -n "\${FAKE_EMPTY_SUMMARY:-}" ] && { echo 'SUMMARY_JSON {"arms": {}}'; exit 0; }; echo 'SUMMARY_JSON {"mode": "enforce", "arms": {"anon": {"n": 10, "p50": 1.0, "p99": 2.0, "max": 3.0, "checks_rate": 1}}}' ;;
  *" create -f -"*) cat >>"$tmp/created" ;;
  *" delete "*) exit "\${FAKE_DELETE_RC:-0}" ;;
  *" --reset"*) cat >/dev/null; case "\$*" in *--manifest-stdout*) echo '{"keys": [{"value": "sfr_fakemanifestkey000000000000"}]}' ;; *) echo "On the cauldron the manifest goes to stdout only" >&2; exit 1 ;; esac ;;
  *"manage.py shell"*) cat >/dev/null; echo 'PERF_JSON {"trials": [{"label": "t", "create_to_allow_ms": 50.0, "revoke_to_deny_ms": 55.0}], "errors": [], "poll_ms": 20.0}' ;;
  *" --teardown"*) cat >/dev/null; exit "\${FAKE_TEARDOWN_RC:-0}" ;;
  *" exec "*) cat >/dev/null ;;
esac
exit 0
FAKE
chmod +x "$tmp/fake/kubectl"
happy_env=(APIKEYS_CAULDRON=perf-guardtest APIKEYS_PERF_CAULDRON=perf-guardtest APIKEYS_E2E_PASSWORD_FILE="$tmp/pw"
           APIKEYS_PERF_BASE=http://envoy-default-eg-0a1b2c3d.envoy-gateway-system.svc.cluster.local)
results="$here/../results/perf-runs"
run_fake() { : >"$tmp/calls"; : >"$tmp/created"; env PATH="$tmp/fake:$tmp:$PATH" "$@" >"$tmp/out" 2>&1; }
run_fake "${happy_env[@]}" APIKEYS_PERF_KEY_FILE="$tmp/key" bash "$runner" latency; rc=$?
latest="$(ls -td "$results"/*-perf-guardtest-latency 2>/dev/null | head -1)"
if [ $rc = 0 ] && [ -f "$latest/latency-flag-on.json" ] && grep -q '"apikeys-perf/run"' "$tmp/created" && grep -q 'kind: Job' "$tmp/created" \
    && grep -qE ' delete job,configmap,secret -l app.kubernetes.io/name=apikeys-perf,apikeys-perf/run=apikeys-perf-' "$tmp/calls" \
    && ! grep -q sfr_testkey "$latest"/* && ! grep -v -- "--context $DEV -n default " "$tmp/calls" | grep -q .; then
  echo "ok: latency on a fake cluster writes latency-flag-on.json, creates labelled objects and deletes them by label"
else echo "FAIL: latency happy path (exit $rc)"; tail -5 "$tmp/out" | sed 's/^/    /'; fail=1; fi
run_fake "${happy_env[@]}" bash "$runner" revoke; rc=$?
latest="$(ls -td "$results"/*-perf-guardtest-revoke 2>/dev/null | head -1)"
if [ $rc = 0 ] && [ -f "$latest/revoke.json" ] && grep -q -- '--teardown' "$tmp/calls" && grep -q -- '--reset' "$tmp/calls"; then
  echo "ok: revoke on a fake cluster seeds, times the trials and tears down"
else echo "FAIL: revoke happy path (exit $rc)"; tail -5 "$tmp/out" | sed 's/^/    /'; fail=1; fi
grep -rq sfr_fakemanifest "$latest" && { echo "FAIL: the seeder's manifest reached the results"; fail=1; } || echo "ok: the seeder's manifest (key values) never reaches the results"
run_fake "${happy_env[@]}" FAKE_EMPTY_SUMMARY=1 bash "$runner" latency; rc=$?
[ $rc != 0 ] && echo "ok: a k6 summary with no samples fails the latency run" || { echo "FAIL: empty summary passed"; fail=1; }
run_fake "${happy_env[@]}" FAKE_DELETE_RC=1 APIKEYS_PERF_KEY_FILE="$tmp/key" bash "$runner" latency; rc=$?
[ $rc = 4 ] && grep -q "CLEANUP FAILED" "$tmp/out" && echo "ok: a failed cleanup fails the latency run (exit 4)" \
  || { echo "FAIL: failed cleanup gave exit $rc"; fail=1; }
run_fake "${happy_env[@]}" FAKE_TEARDOWN_RC=1 bash "$runner" revoke; rc=$?
[ $rc = 3 ] && grep -q "TEARDOWN FAILED" "$tmp/out" && echo "ok: a failed teardown fails the revoke run (exit 3)" \
  || { echo "FAIL: failed teardown gave exit $rc"; fail=1; }

# The self-check catches a cluster call without the context.
bash "$runner" check >/dev/null 2>&1 && echo "ok: G1 self-check passes on the runner" || { echo "FAIL: G1 self-check"; fail=1; }
cp "$runner" "$tmp/bad.sh"; printf '\nkubectl get pods\n' >>"$tmp/bad.sh"
bash "$tmp/bad.sh" check >/dev/null 2>&1 && { echo "FAIL: G1 self-check missed a bare cluster call"; fail=1; } || echo "ok: G1 self-check catches a bare cluster call"
# The cluster verbs in the runner: get, logs, create (ConfigMap, Secret, Job), label (those), delete (by the run's
# label), exec (the seeder and the trials, into a web pod). Never apply, patch, edit, scale, rollout or port-forward.
if grep -nE 'kubectl[^|]*\b(apply|patch|edit|replace|scale|rollout|cordon|drain|port-forward|annotate)\b' "$runner"; then
  echo "FAIL: a forbidden cluster verb appears in the runner"; fail=1
else echo "ok: no apply/patch/edit/scale/rollout/port-forward in the runner"; fi
deletes="$(grep -cE 'kubectl .* delete ' "$runner")"
grep -E 'kubectl .* delete ' "$runner" | grep -q -- '-l "\$JOB_LABEL"' && [ "$deletes" = 1 ] \
  && echo "ok: the one delete is by the run's own label" || { echo "FAIL: deletes: $deletes"; fail=1; }
exit $fail
