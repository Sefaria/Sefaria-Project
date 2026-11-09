#!/usr/bin/env bash
# e2e-tests/api-keys/perf/run-perf-cauldron.sh — the API-key latency benchmark and revoke-to-deny timing on a
# DEDICATED perf cauldron (release plan D6: approved by Brendan; never apisplit or any shared cauldron, whose Envoy
# fleet cauldron/SAFETY.md keeps free of load tests).
#
#   run-perf-cauldron.sh plan                 the guards, then print what latency and revoke would do; no cluster call
#   run-perf-cauldron.sh latency              a k6 Job in the dev cluster runs auth-service/k6/arms.js against the
#                                             cauldron's gateway; results/perf-runs/<run>/latency-flag-<on|off>.json
#   run-perf-cauldron.sh revoke               seeds the e2e fixtures, runs revoke_trials_pod.py in a web pod (create
#                                             key -> allowed -> revoke -> 401, timed on the pod's clock), tears down
#   run-perf-cauldron.sh compare OFF ON       added p50/p99 between a flag-off and a flag-on latency file (local only)
#   run-perf-cauldron.sh check                the self-check that every cluster call names the dev context
#
# Required for every cluster mode, checked before the first cluster call:
#   APIKEYS_CAULDRON=<name>        the perf cauldron; its name must contain "perf" and must not be a shared cauldron
#   APIKEYS_PERF_CAULDRON=<name>   the same name again: the go-ahead for this run
#   APIKEYS_KUBE_CONTEXT           unset, or the dev cluster's context (nothing else is accepted)
# latency:  APIKEYS_PERF_BASE      the gateway's in-cluster URL (the Envoy Service in envoy-gateway-system, plain
#                                  http), so the numbers leave out Cloudflare as the POC's did; the Host header is
#                                  www.<cauldron>.cauldron.sefaria.org
#           APIKEYS_PERF_KEY_FILE  a valid key of the cauldron (bare value or "x-api-key: <value>", made in its
#                                  settings page); without it the hit arm is left out
#           RATE (per arm, default 25, cap 50), DURATION (default 120s, cap 180s), ARMS (anon,hit,miss)
# revoke:   APIKEYS_E2E_PASSWORD_FILE (the fixture password, as for cauldron/run.sh seeded), TRIALS (10, cap 20),
#           POLL (seconds, default 0.02, floor 0.02); the cauldron's auth service must be on and in enforce.
#           The fixtures land in sefaria_auth, which every cauldron sharing that database sees (as with
#           cauldron/run.sh seeded); they are torn down on exit and --leftovers must print 0.
#
# The baseline is a separate latency run with authService.enabled=false on the same cauldron (the POC's method);
# switching the flag is the cauldron owner's change in the cauldrons repo, never this script's. Then compare.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
KCTX=gke_development-205018_us-east1-b_cluster-1
NS=default
SHARED_CAULDRONS=" apisplit authpoc api-keys-poc apikeys-pipeline "
RATE_CAP=50; DURATION_CAP_S=180; TRIALS_CAP=20; POLL_FLOOR=0.02
K6_IMAGE="${K6_IMAGE:-grafana/k6:1.0.0}"
BASELINE_P50=1.30; BASELINE_P99=3.02
MODE="${1:-}"

die() { printf 'STOP: %s\n' "$*" >&2; exit 2; }
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; }
mask() { sed -E 's/sfr_[A-Za-z0-9_-]+/sfr_…/g'; }

# Every line that names the cluster CLI must carry the dev context (comments aside).
g1_check() {
  local bad
  bad="$(grep -HnE '(^|[^A-Za-z_])kubectl[[:space:]]' "$@" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' | grep -v -- '--context "\$KCTX"' || true)"
  [ -z "$bad" ] || { printf '%s\n' "$bad" >&2; die "a cluster call above lacks --context \"\$KCTX\""; }
}

compare() {
  [ -f "${1:-}" ] && [ -f "${2:-}" ] || die "compare needs a flag-off and a flag-on latency file"
  python3 - "$1" "$2" "$BASELINE_P50" "$BASELINE_P99" <<'PY'
import json, sys
off, on = (json.load(open(p)) for p in sys.argv[1:3])
b50, b99 = float(sys.argv[3]), float(sys.argv[4])
if off.get("flag") != "off" or on.get("flag") != "on":
    sys.exit("compare: the first file must be a flag-off run and the second a flag-on run (got %s, %s)" % (off.get("flag"), on.get("flag")))
for arm in ("anon", "hit", "miss"):
    a, b = off["k6"]["arms"].get(arm), on["k6"]["arms"].get(arm)
    if not a or not b:
        continue
    d50, d99 = b["p50"] - a["p50"], b["p99"] - a["p99"]
    print("%-4s off p50=%.3f p99=%.3f | on p50=%.3f p99=%.3f | added p50 %+.3f ms (baseline +%.2f), p99 %+.3f ms (baseline +%.2f)"
          % (arm, a["p50"], a["p99"], b["p50"], b["p99"], d50, b50, d99, b99))
PY
}

case "$MODE" in
  plan|latency|revoke) ;;
  check) g1_check "$0"; echo "ok: every cluster call names the dev context"; exit 0 ;;
  compare) compare "${2:-}" "${3:-}"; exit $? ;;
  *) awk 'NR > 1 && /^#/ {print; next} NR > 1 {exit}' "$0"; die "unknown mode '$MODE'" ;;
esac

# --- guards: all of them before any cluster call --------------------------------------------------------------------
CAULDRON="${APIKEYS_CAULDRON:-}"
[ -n "$CAULDRON" ] || die "APIKEYS_CAULDRON is not set; this runner has no default target"
[[ $CAULDRON =~ ^[a-z0-9-]+$ ]] || die "APIKEYS_CAULDRON=$CAULDRON is not a cauldron name"
[[ $SHARED_CAULDRONS != *" $CAULDRON "* ]] || die "$CAULDRON is a shared cauldron; load tests are banned there (cauldron/SAFETY.md)"
[[ $CAULDRON == *perf* ]] || die "$CAULDRON does not look like a dedicated perf cauldron (its name must contain 'perf', release plan D6)"
[ "${APIKEYS_PERF_CAULDRON:-}" = "$CAULDRON" ] \
  || die "the perf run needs its go-ahead: APIKEYS_PERF_CAULDRON must equal APIKEYS_CAULDRON ($CAULDRON)"
if [ -n "${APIKEYS_KUBE_CONTEXT:-}" ] && [ "$APIKEYS_KUBE_CONTEXT" != "$KCTX" ]; then
  die "APIKEYS_KUBE_CONTEXT=$APIKEYS_KUBE_CONTEXT; only $KCTX is allowed"
fi
RATE="${RATE:-25}"; DURATION="${DURATION:-120s}"; ARMS="${ARMS:-anon,hit,miss}"
TRIALS="${TRIALS:-10}"; POLL="${POLL:-0.02}"
[[ $RATE =~ ^[0-9]+$ ]] && [ "$RATE" -ge 1 ] && [ "$RATE" -le "$RATE_CAP" ] || die "RATE=$RATE: 1 to $RATE_CAP requests/s per arm"
[[ $DURATION =~ ^([0-9]+)s$ ]] || die "DURATION=$DURATION: whole seconds, like 120s"
[ "${BASH_REMATCH[1]}" -ge 10 ] && [ "${BASH_REMATCH[1]}" -le "$DURATION_CAP_S" ] || die "DURATION=$DURATION: 10s to ${DURATION_CAP_S}s"
DURATION_S="${BASH_REMATCH[1]}"
[[ $ARMS =~ ^(anon|hit|miss)(,(anon|hit|miss)){0,2}$ ]] || die "ARMS=$ARMS: a comma list of anon, hit, miss"
[[ $TRIALS =~ ^[0-9]+$ ]] && [ "$TRIALS" -ge 1 ] && [ "$TRIALS" -le "$TRIALS_CAP" ] || die "TRIALS=$TRIALS: 1 to $TRIALS_CAP"
python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= $POLL_FLOOR else 1)" "$POLL" 2>/dev/null || die "POLL=$POLL: at least $POLL_FLOOR s"
g1_check "$0"
HOST="www.$CAULDRON.cauldron.sefaria.org"
if [ "$MODE" = latency ] || [ "$MODE" = plan ]; then
  BASE="${APIKEYS_PERF_BASE:-}"
  if [ "$MODE" = latency ]; then
    [[ $BASE =~ ^http://[a-z0-9.-]+(:[0-9]+)?$ ]] || die "APIKEYS_PERF_BASE must be the gateway's in-cluster http URL, like http://envoy-<hash>.envoy-gateway-system.svc.cluster.local"
  fi
  KEY_FILE="${APIKEYS_PERF_KEY_FILE:-}"
  if [ -z "$KEY_FILE" ]; then ARMS="$(echo "$ARMS" | tr ',' '\n' | grep -vx hit | paste -sd, -)"; [ -n "$ARMS" ] || die "no arm left without APIKEYS_PERF_KEY_FILE"
  elif [ ! -f "$KEY_FILE" ]; then die "APIKEYS_PERF_KEY_FILE=$KEY_FILE does not exist"; fi
fi
if [ "$MODE" = revoke ] || [ "$MODE" = plan ]; then
  if [ "$MODE" = revoke ]; then [ -f "${APIKEYS_E2E_PASSWORD_FILE:-}" ] || die "APIKEYS_E2E_PASSWORD_FILE must name the fixture password file"; fi
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$CAULDRON-$MODE"
OUT="$REPO/e2e-tests/api-keys/results/perf-runs/$RUN_ID"
NAME="apikeys-perf-$(date -u +%H%M%S)"
JOB_LABEL="app.kubernetes.io/name=apikeys-perf,apikeys-perf/run=$NAME"

job_manifest() {
  cat <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: $NAME
  namespace: $NS
  labels: {app.kubernetes.io/name: apikeys-perf, apikeys-perf/run: $NAME, apikeys-perf/cauldron: $CAULDRON}
spec:
  backoffLimit: 0
  activeDeadlineSeconds: $((DURATION_S + 180))
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels: {app.kubernetes.io/name: apikeys-perf, apikeys-perf/run: $NAME}
    spec:
      restartPolicy: Never
      containers:
        - name: k6
          image: $K6_IMAGE
          args: [run, --quiet, --no-color, /scripts/arms.js]
          env:
            - {name: BASE, value: "${BASE:-<APIKEYS_PERF_BASE>}"}
            - {name: HOST, value: "$HOST"}
            - {name: PATH_GATED, value: /api/texts/Genesis.1}
            - {name: ANON_PATH, value: /api/texts/Genesis.1}
            - {name: MISS_STATUS, value: "200"}
            - {name: AUTH_MODE, value: "${AUTH_MODE_SEEN:-enforce}"}
            - {name: ARMS, value: "$ARMS"}
            - {name: RATE, value: "$RATE"}
            - {name: DURATION, value: "$DURATION"}
            - {name: KEY_FILE, value: "${KEY_FILE:+/keys/key}"}
            - {name: SUMMARY_STDOUT, value: "1"}
          volumeMounts:
            - {name: scripts, mountPath: /scripts}
            - {name: keys, mountPath: /keys}
          resources: {requests: {cpu: 500m, memory: 256Mi}, limits: {cpu: "2", memory: 1Gi}}
      volumes:
        - {name: scripts, configMap: {name: $NAME}}
        - name: keys
          secret: {secretName: $NAME, optional: true}
YAML
}

# The k6 script as a ConfigMap and, with a key file, the key as a Secret; one JSON List, labelled for the run.
objects_manifest() {
  python3 - "$NAME" "$NS" "$REPO/auth-service/k6/arms.js" "${KEY_FILE:-}" <<'PY'
import json, sys
name, ns, script, key_file = sys.argv[1:5]
labels = {"app.kubernetes.io/name": "apikeys-perf", "apikeys-perf/run": name}
meta = {"name": name, "namespace": ns, "labels": labels}
items = [{"apiVersion": "v1", "kind": "ConfigMap", "metadata": meta, "data": {"arms.js": open(script).read()}}]
if key_file:
    raw = open(key_file).read().strip()
    if raw.lower().startswith("x-api-key"):
        raw = raw.split(":", 1)[1].strip()
    items.append({"apiVersion": "v1", "kind": "Secret", "type": "Opaque", "metadata": meta, "stringData": {"key": raw}})
print(json.dumps({"apiVersion": "v1", "kind": "List", "items": items}))
PY
}

if [ "$MODE" = plan ]; then
  cat <<EOF
perf cauldron: $CAULDRON ($HOST), context $KCTX, namespace $NS
latency: ConfigMap and Secret $NAME (arms.js; the key, from APIKEYS_PERF_KEY_FILE${KEY_FILE:+, set}), Job $NAME:
  arms $ARMS at $RATE/s each for $DURATION (Varnish-hit path /api/texts/Genesis.1), k6 log to results, then the three
  objects are deleted. Run it once with the flag off and once on; then: $0 compare OFF.json ON.json
revoke: the seeder (--leftovers 0, --reset) in a web pod, $TRIALS trials of revoke_trials_pod.py polling
  ${APIKEYS_PERF_BASE:-https://$HOST}/api/knn-search every ${POLL}s, then --teardown and --leftovers 0
EOF
  echo "--- ConfigMap and Secret (key redacted)"
  objects_manifest | python3 -c 'import json, sys
doc = json.load(sys.stdin)
for item in doc["items"]:
    if item["kind"] == "Secret":
        item["stringData"] = {"key": "<redacted>"}
    if item["kind"] == "ConfigMap":
        item["data"] = {k: "<%d bytes>" % len(v) for k, v in item["data"].items()}
print(json.dumps(doc, indent=1))'
  echo "--- Job manifest"; job_manifest
  exit 0
fi

mkdir -p "$OUT"
git -C "$REPO" check-ignore -q "$OUT" || die "$OUT is not git-ignored"
exec > >(mask | tee -a "$OUT/run.log") 2>&1

# --- cluster reads -------------------------------------------------------------------------------------------------
deploy_env() {  # deploy_env VAR -> the auth-service container's env value
  kubectl --context "$KCTX" -n "$NS" get "deploy/$CAULDRON-auth-service" \
    -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name==\"$1\")].value}" 2>/dev/null
}
# The HelmRelease's inline value when it has one; without it (values from a ConfigMap, say), whether the
# auth-service Deployment exists.
flag_state() {
  local v; v="$(kubectl --context "$KCTX" -n "$NS" get "helmrelease/$CAULDRON" -o jsonpath='{.spec.values.authService.enabled}' 2>/dev/null)"
  case "$v" in
    true) echo on ;;
    false) echo off ;;
    *) [ -n "$AUTH_MODE_SEEN" ] && echo on || echo off ;;
  esac
}
web_pod() {
  kubectl --context "$KCTX" -n "$NS" get pods -l "app=web-$CAULDRON" --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}'
}

AUTH_MODE_SEEN="$(deploy_env AUTH_MODE)"
FLAG="$(flag_state)"
log "cauldron $CAULDRON: authService.enabled=$FLAG, AUTH_MODE=${AUTH_MODE_SEEN:-<no auth service>}"

# to_file FILE COMMAND... -> runs it with its output masked into FILE; returns the command's exit status
to_file() { local f="$1"; shift; "$@" 2>&1 | mask >"$f"; return "${PIPESTATUS[0]}"; }

delete_perf_objects() {
  kubectl --context "$KCTX" -n "$NS" delete job,configmap,secret -l "$JOB_LABEL" --ignore-not-found --wait=false >/dev/null 2>&1
}

latency() {
  [ "$FLAG" = off ] || [ -n "$AUTH_MODE_SEEN" ] || die "the flag is on but no auth-service Deployment was found"
  trap delete_perf_objects EXIT
  # The ConfigMap and the Secret carry the run's label from creation, so the exit trap's delete always finds them.
  # The key goes through stdin, never argv.
  objects_manifest | kubectl --context "$KCTX" -n "$NS" create -f - >/dev/null || die "configmap/secret create failed"
  job_manifest | kubectl --context "$KCTX" -n "$NS" create -f - >/dev/null || die "job create failed"
  log "job $NAME: $ARMS at $RATE/s for $DURATION"
  local deadline=$((SECONDS + DURATION_S + 240)) state=""
  while [ $SECONDS -lt $deadline ]; do
    state="$(kubectl --context "$KCTX" -n "$NS" get "job/$NAME" -o jsonpath='{.status.succeeded}/{.status.failed}' 2>/dev/null)"
    case "$state" in 1/*|*/1) break ;; esac
    sleep 10
  done
  to_file "$OUT/k6.log" kubectl --context "$KCTX" -n "$NS" logs "job/$NAME"
  local summary; summary="$(grep -m1 '^SUMMARY_JSON ' "$OUT/k6.log" | sed 's/^SUMMARY_JSON //')"
  [ -n "$summary" ] || die "no k6 summary in the job log (state $state; $OUT/k6.log)"
  python3 - "$OUT/latency-flag-$FLAG.json" "$CAULDRON" "$FLAG" "${AUTH_MODE_SEEN:-}" "$summary" <<'PY'
import json, sys
path, cauldron, flag, mode, summary = sys.argv[1:6]
doc = {"cauldron": cauldron, "flag": flag, "auth_mode": mode or None, "k6": json.loads(summary)}
json.dump(doc, open(path, "w"), indent=2)
for arm, v in doc["k6"]["arms"].items():
    print("%-4s n=%d p50=%.3f p99=%.3f max=%.3f ms checks=%s" % (arm, v["n"], v["p50"], v["p99"], v["max"], v["checks_rate"]))
PY
  log "results: ${OUT#"$REPO"/}/latency-flag-$FLAG.json; with both runs: $0 compare <off.json> <on.json>"
  [ "$state" = "1/" ] || { log "the k6 job did not succeed ($state): a threshold crossed (see k6.log)"; return 1; }
}

seed_exec() {
  local pod; pod="$(web_pod)"; [ -n "$pod" ] || die "no running web pod"
  { printf 'APIKEYS_E2E_PASSWORD = %s\n' "$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read().strip()))' "$APIKEYS_E2E_PASSWORD_FILE")"
    cat "$REPO/scripts/dev/seed_api_keys_e2e.py"; } |
    kubectl --context "$KCTX" -n "$NS" exec -i "$pod" -c web -- \
      env APIKEYS_CAULDRON="$CAULDRON" APIKEYS_ALLOW_MUTATING_ON="$CAULDRON" sh -c 'cd /app && python - --target cauldron "$@"' seed "$@"
}

seeded_teardown() {
  to_file "$OUT/teardown.txt" seed_exec --teardown
  to_file "$OUT/leftovers-after.txt" seed_exec --leftovers || log "LEFTOVERS: clean up by hand ($OUT/leftovers-after.txt)"
}

# trials_exec POD ARGS_JSON -> revoke_trials_pod.py in the pod, script and arguments on stdin
trials_exec() {
  { printf 'PERF_ARGS = %s\n' "$2"; cat "$HERE/revoke_trials_pod.py"; } |
    kubectl --context "$KCTX" -n "$NS" exec -i "$1" -c web -- sh -c 'cd /app && python manage.py shell --no-imports'
}

revoke() {
  [ "$FLAG" = on ] || die "revoke timing needs authService.enabled=true on $CAULDRON"
  [ "$AUTH_MODE_SEEN" = enforce ] || die "revoke timing needs AUTH_MODE=enforce (got ${AUTH_MODE_SEEN:-none}): observe never denies"
  to_file "$OUT/leftovers-before.txt" seed_exec --leftovers || die "--leftovers is not 0 before seeding ($OUT/leftovers-before.txt)"
  trap seeded_teardown EXIT
  to_file "$OUT/seed.txt" seed_exec --reset || die "seeding failed ($OUT/seed.txt)"
  local pod args; pod="$(web_pod)"
  args="$(python3 -c 'import json,sys; print(json.dumps({"user_id": 2098000001, "base": sys.argv[1], "host": sys.argv[2], "path": "/api/knn-search", "poll": sys.argv[3], "timeout": 10, "trials": int(sys.argv[4])}))' \
    "${APIKEYS_PERF_BASE:-https://$HOST}" "$HOST" "$POLL" "$TRIALS")"
  log "revoke: $TRIALS trials in $pod, polling every ${POLL}s"
  to_file "$OUT/trials.txt" trials_exec "$pod" "$args"
  local line; line="$(grep -m1 '^PERF_JSON ' "$OUT/trials.txt" | sed 's/^PERF_JSON //')"
  [ -n "$line" ] || die "no trial output ($OUT/trials.txt)"
  python3 - "$OUT/revoke.json" "$CAULDRON" "$line" <<'PY'
import json, statistics, sys
path, cauldron, line = sys.argv[1:4]
doc = json.loads(line)
doc["cauldron"] = cauldron
for k in ("create_to_allow_ms", "revoke_to_deny_ms"):
    vals = sorted(t[k] for t in doc["trials"] if t.get(k) is not None)
    doc[k.replace("_ms", "")] = {"n": len(vals), "p50": statistics.median(vals), "max": vals[-1]} if vals else None
json.dump(doc, open(path, "w"), indent=2)
r = doc["revoke_to_deny"]
print("revoke-to-deny: %s (target ~50 ms via NOTIFY, 60 s periodic reload as the backstop); errors: %d" % (r, len(doc["errors"])))
sys.exit(1 if doc["errors"] else 0)
PY
}

rc=0
case "$MODE" in
  latency) latency || rc=1 ;;
  revoke) revoke || rc=1 ;;
esac
if grep -rEq 'sfr_[A-Za-z0-9]{5,}' "$OUT"; then log "UNMASKED KEY MATERIAL under $OUT"; rc=1; fi
exit $rc
