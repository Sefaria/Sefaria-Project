#!/usr/bin/env bash
# run-tests.sh: end-to-end test of the release scripts on a local kind cluster.
#
#   tests/run-tests.sh --master-code DIR [--phase1-code DIR] [--python PY] [--keep-cluster] [--keep-work]
#
#   --master-code   a checkout of origin/master with sefaria/local_settings.py (the code before the merge)
#   --phase1-code   a checkout of the phase 1 head (default: this repository)
#   --python        a Python with the project's requirements (Django 6); default $APIKEYS_RELEASE_PYTHON or python3
#
# Builds kind cluster apikeys-release-test (namespaces default, preprod, flux-system; a postgres:18 StatefulSet
# postgres-18; minimal Flux HelmRelease/GitRepository and Argo Rollout CRDs; stand-in web pods and Rollouts installed as
# helm releases preprod and production; the Secrets by name). Then: master's migrations and listing rows; snapshot;
# phase 1's migrations and rows; the preprod release flipped to a phase 1 image; restore chart (dry run, normal, then
# --emergency --execute); restore db --scoped (refused while phase 1 runs, then done); schema and rows equal to the
# snapshot; master's code creates, lists and deletes a listing on the restored database; phase 1 migrates forward again;
# rehearse-migration on the snapshot dump; watch-promotion on a short window, with its lock-wait and 5xx alarms; the
# preflight's prod-only checks (CronJobs, Datadog labels) and namespace check; staging-smoke's legacy apikey write against
# a stub server; then (at the end) the maintenance fence of restore db, the concurrent-migrate case, premigrate.sh
# (lock timeout and retry, the final migrate --check, no-op, refusals) and preflight --stage promote, with a stand-in
# web image (tests/fixtures/migrate-app: Django 6 and a fixture app) that the premigrate pod runs with the Rollout's
# volumes, env and Secret copied. Negative tests: wrong context, dry runs change nothing, db --full refuses, preflight
# fails without the reader grant on powered_by_apikey and on a stale HelmRelease Ready. Uses ports 56441 (port-forward)
# and 56445 (rehearsal); the stub server takes an ephemeral port.
# The cluster and the work directory are deleted at the end unless --keep-cluster / --keep-work.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REL="$(cd "$HERE/.." && pwd)"
MASTER_CODE="" PHASE1_CODE="" PY="${APIKEYS_RELEASE_PYTHON:-python3}" KEEP_CLUSTER=0 KEEP_WORK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --master-code) MASTER_CODE="$(cd "$2" && pwd)"; shift 2 ;;
    --phase1-code) PHASE1_CODE="$(cd "$2" && pwd)"; shift 2 ;;
    --python) PY="$2"; shift 2 ;;
    --keep-cluster) KEEP_CLUSTER=1; shift ;;
    --keep-work) KEEP_WORK=1; shift ;;
    -h | --help) sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
PHASE1_CODE="${PHASE1_CODE:-$(git -C "$REL" rev-parse --show-toplevel)}"
[[ -n "$MASTER_CODE" && -f "$MASTER_CODE/manage.py" ]] || { echo "--master-code DIR (an origin/master checkout) is required" >&2; exit 2; }
[[ -f "$MASTER_CODE/sefaria/local_settings.py" ]] || { echo "$MASTER_CODE/sefaria/local_settings.py is missing" >&2; exit 2; }
[[ -f "$PHASE1_CODE/sefaria/local_settings.py" ]] || { echo "$PHASE1_CODE/sefaria/local_settings.py is missing" >&2; exit 2; }

CLUSTER=apikeys-release-test
CTX="kind-$CLUSTER"
PF_PORT=56441
REHEARSAL_PORT=56445
PROD_CTX="gke_production-deployment_us-east1-b_cluster-1"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/apikeys-release-tests.XXXXXX")"
LOGS="$WORK/logs"
mkdir -p "$LOGS"
export APIKEYS_RELEASE_TEST_CONTEXT="$CTX"
MASTER_TAG_PREPROD="v7.11.4-preprod.1" MASTER_TAG_PROD="v7.11.4-prod.1" PHASE1_TAG_PREPROD="v7.12.0-preprod.1" FIXTURE_TAG="fixture"
CHART_PREPROD="0.92.5-preprod.1" CHART_PROD="0.92.5-prod.1" PHASE1_CHART_PREPROD="0.93.0-preprod.1"
IMG=kind.local/sefaria-web

N=0 FAILED=0 PF_PID=""
ok() { N=$((N + 1)); echo "ok $N - $*"; }
notok() { N=$((N + 1)); FAILED=$((FAILED + 1)); echo "not ok $N - $*"; }
# check DESC CMD...: the command must succeed. Output goes to $LOGS/<n>.log.
check() {
  local desc="$1" log="$LOGS/$((N + 1)).log"
  shift
  if "$@" >"$log" 2>&1; then ok "$desc"; else notok "$desc (log: $log)"; tail -n 25 "$log" | sed 's/^/    /'; fi
}
# refuses DESC PATTERN CMD...: the command must fail and print PATTERN.
refuses() {
  local desc="$1" pattern="$2"
  shift 2
  local log="$LOGS/$((N + 1)).log"
  if "$@" >"$log" 2>&1; then
    notok "$desc (succeeded; log: $log)"
  elif grep -qE "$pattern" "$log"; then
    ok "$desc"
  else
    notok "$desc (failed without /$pattern/; log: $log)"
    tail -n 15 "$log" | sed 's/^/    /'
  fi
}
# exits CODE DESC PATTERN CMD...: the command must exit with CODE and print PATTERN.
exits() {
  local want="$1" desc="$2" pattern="$3" rc=0
  shift 3
  local log="$LOGS/$((N + 1)).log"
  "$@" >"$log" 2>&1 || rc=$?
  if [[ "$rc" == "$want" ]] && grep -qE "$pattern" "$log"; then
    ok "$desc"
  else
    notok "$desc (exit $rc, wanted $want and /$pattern/; log: $log)"
    tail -n 15 "$log" | sed 's/^/    /'
  fi
}
fatal() {
  FAILED=$((FAILED + 1))
  echo "Bail out! $*"
  exit 1
}

cleanup() {
  [[ -n "$PF_PID" ]] && kill "$PF_PID" 2>/dev/null
  [[ -n "${STUB_PID:-}" ]] && kill "$STUB_PID" 2>/dev/null
  docker rm -f "apikeys-rehearsal-$REHEARSAL_PORT" >/dev/null 2>&1
  if [[ "$KEEP_CLUSTER" == 1 ]]; then echo "# kept kind cluster $CLUSTER"; else kind delete cluster --name "$CLUSTER" >/dev/null 2>&1; fi
  if [[ "$KEEP_WORK" == 1 || "$FAILED" -gt 0 ]]; then echo "# work directory kept: $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

k() { kubectl --context "$CTX" "$@"; }
psql_pod() { k -n default exec -i postgres-18-0 -c postgres-18 -- psql -X -q -v ON_ERROR_STOP=1 -U postgres -d sefaria_auth "$@"; }
django() {
  local code="$1"
  shift
  (cd "$code" && RELEASE_PG_HOST=127.0.0.1 RELEASE_PG_PORT="$PF_PORT" RELEASE_PG_DB=sefaria_auth RELEASE_PG_USER=postgres RELEASE_PG_PASSWORD=postgres PYTHONPATH="$code:$REL/django" DJANGO_SETTINGS_MODULE=release_settings "$PY" "$@")
}
manage() {
  local code="$1"
  shift
  django "$code" manage.py "$@"
}
start_port_forward() {
  [[ -n "$PF_PID" ]] && kill "$PF_PID" 2>/dev/null
  k -n default port-forward pod/postgres-18-0 "$PF_PORT:5432" >"$LOGS/port-forward.log" 2>&1 &
  PF_PID=$!
  for _ in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/$PF_PORT") 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
wait_web() {
  local ns="$1" deploy="$2" image="$3"
  for _ in $(seq 1 90); do
    local imgs
    imgs="$(k -n "$ns" get pods -l "app=web-$deploy" -o jsonpath='{range .items[*]}{.status.phase}={.spec.containers[0].image}{"\n"}{end}' | sort -u)"
    [[ "$imgs" == "Running=$image" ]] && return 0
    sleep 2
  done
  echo "web pods of $deploy: $imgs" >&2
  return 1
}
set_tags() { # file web-tag chart-version
  "$PY" - "$@" <<'PY'
import re, sys
path, tag, chart = sys.argv[1:]
text = open(path).read()
text = re.sub(r'(chart: sefaria\s*\n\s*version: )"[^"]*"', rf'\g<1>"{chart}"', text)
text = re.sub(r'(containerImage:\s*\n\s*imageRegistry: [^\n]+\n\s*tag: )"[^"]*"', rf'\g<1>"{tag}"', text)
open(path, "w").write(text)
PY
}
mark_healthy() { # ns hr
  local ro
  for ro in $(k -n "$1" get rollouts.argoproj.io -o name); do
    k -n "$1" patch "$ro" --subresource=status --type merge -p '{"status":{"phase":"Healthy"}}' >/dev/null
  done
  # Ready=True for the HelmRelease's current generation, as Flux writes it once it has reconciled.
  local gen
  gen="$(k -n "$1" get helmreleases.helm.toolkit.fluxcd.io "$2" -o jsonpath='{.metadata.generation}')"
  k -n "$1" patch helmreleases.helm.toolkit.fluxcd.io "$2" --subresource=status --type merge \
    -p "{\"status\":{\"conditions\":[{\"type\":\"Ready\",\"status\":\"True\",\"reason\":\"Test\",\"message\":\"stand-in\",\"lastTransitionTime\":\"2026-11-09T00:00:00Z\",\"observedGeneration\":$gen}]}}" >/dev/null
}
# Calls a lib.sh function in a child shell (lib.sh sets -e, which this runner must not inherit).
libcall() { CTX="$CTX" PG_USER="" bash -c 'source "$1"; shift; "$@"' _ "$REL/lib.sh" "$@"; }
db_state() { # scoped tables, their checksums and the powered_by migrations, for "nothing changed" checks
  local tables
  tables="$(libcall scoped_tables_sql | psql_pod -At | tr '\n' ' ')"
  echo "$tables"
  # shellcheck disable=SC2086
  libcall checksums_sql $tables | psql_pod -At -F "$(printf '\t')"
}

echo "# work directory $WORK"
echo "# master code $MASTER_CODE ($(git -C "$MASTER_CODE" rev-parse --short HEAD)), phase 1 code $PHASE1_CODE ($(git -C "$PHASE1_CODE" rev-parse --short HEAD))"
for tool in kind kubectl helm docker git "$PY"; do command -v "$tool" >/dev/null || fatal "$tool not found"; done
"$PY" -c 'import django' 2>/dev/null || fatal "$PY cannot import django (pass --python)"

# ---------------------------------------------------------------------------------------------------------------
echo "# cluster"
# Always a fresh cluster, so every run starts from an empty database.
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then kind delete cluster --name "$CLUSTER" >/dev/null 2>&1; fi
kind create cluster --name "$CLUSTER" --wait 120s >"$LOGS/kind.log" 2>&1 || fatal "kind create cluster failed (log: $LOGS/kind.log)"
# A single-platform copy of postgres:18: kind load fails on a multi-platform image whose other platforms are not local.
printf 'FROM postgres:18\n' | docker build -q -t kind.local/postgres:18 - >"$LOGS/docker-build.log" 2>&1 || fatal "docker build of kind.local/postgres:18 failed"
for tag in "$MASTER_TAG_PREPROD" "$MASTER_TAG_PROD" "$PHASE1_TAG_PREPROD"; do docker tag kind.local/postgres:18 "$IMG:$tag"; done
# The stand-in web image the premigrate pods run: Django 6.0.4 and psycopg2-binary 2.9.9 (as requirements.txt), a manage.py
# and a fixture app (pip needs the network; the base image is python:3.12-slim-bookworm).
docker build -q -t "$IMG:$FIXTURE_TAG" "$HERE/fixtures/migrate-app" >"$LOGS/docker-build-fixture.log" 2>&1 || fatal "docker build of the fixture web image failed (log: $LOGS/docker-build-fixture.log)"
kind load docker-image --name "$CLUSTER" kind.local/postgres:18 "$IMG:$MASTER_TAG_PREPROD" "$IMG:$MASTER_TAG_PROD" "$IMG:$PHASE1_TAG_PREPROD" "$IMG:$FIXTURE_TAG" >"$LOGS/kind-load.log" 2>&1 \
  || fatal "kind load failed"
k apply -f "$HERE/fixtures/crds.yaml" >/dev/null || fatal "CRDs"
k wait --for condition=established --timeout=60s crd/helmreleases.helm.toolkit.fluxcd.io crd/gitrepositories.source.toolkit.fluxcd.io crd/rollouts.argoproj.io >/dev/null || fatal "CRDs not established"
for ns in preprod flux-system; do k create namespace "$ns" --dry-run=client -o yaml | k apply -f - >/dev/null; done
k apply -f "$HERE/fixtures/postgres-18.yaml" >/dev/null || fatal "postgres"
k -n default rollout status statefulset/postgres-18 --timeout=180s >/dev/null || fatal "postgres-18 not ready"
for _ in $(seq 1 30); do psql_pod -c 'SELECT 1' >/dev/null 2>&1 && break; sleep 1; done
start_port_forward || fatal "port-forward to postgres-18-0 failed"
ok "kind cluster with postgres-18, Flux and Argo CRDs"

# ---------------------------------------------------------------------------------------------------------------
echo "# master state"
# The reader role exists before the migrations, as on prod, so 0008 takes its grant path.
psql_pod -c "CREATE ROLE auth_service_reader NOLOGIN; GRANT CONNECT ON DATABASE sefaria_auth TO auth_service_reader;" >/dev/null
check "master's migrations on sefaria_auth" manage "$MASTER_CODE" migrate --noinput
check "master's code writes listing rows" django "$MASTER_CODE" "$HERE/django/seed_master.py"

# A fixture repository standing in for Sefaria-Project: env files with release tags, branches, and the migrations
# file list (preflight's pending check reads it from the code ref).
FIX="$WORK/repo"
git init -q --bare "$WORK/origin.git"
git init -q -b master "$FIX"
git -C "$FIX" config user.email release-tests@example.org
git -C "$FIX" config user.name "release tests"
mkdir -p "$FIX/envs"
for e in staging preprod prod; do mkdir -p "$FIX/envs/$e"; cp "$PHASE1_CODE/envs/$e/helmrelease.yaml" "$FIX/envs/$e/"; done
set_tags "$FIX/envs/preprod/helmrelease.yaml" "$MASTER_TAG_PREPROD" "$CHART_PREPROD"
set_tags "$FIX/envs/prod/helmrelease.yaml" "$MASTER_TAG_PROD" "$CHART_PROD"
(cd "$PHASE1_CODE" && git ls-files '*/migrations/*.py' helm-chart/sefaria ':!:scripts/release/api-keys-phase1/tests/fixtures') | while read -r f; do mkdir -p "$FIX/$(dirname "$f")"; cp "$PHASE1_CODE/$f" "$FIX/$f"; done
git -C "$FIX" add -A && git -C "$FIX" commit -q -m "fixture: master state"
git -C "$FIX" branch preprod && git -C "$FIX" branch prod
TAG_PREPROD="preprod/${MASTER_TAG_PREPROD#v}+chart.$CHART_PREPROD"
TAG_PROD="prod/${MASTER_TAG_PROD#v}+chart.$CHART_PROD"
git -C "$FIX" tag "$TAG_PREPROD" preprod && git -C "$FIX" tag "$TAG_PROD" prod
git -C "$FIX" remote add origin "$WORK/origin.git"
git -C "$FIX" push -q origin master preprod prod --tags

# What Flux and Argo would have made of that: HelmReleases from the env files, GitRepositories at the tags, the web
# Rollout and pods as helm releases (so helm history and helm rollback are real), the Secrets by name.
apply_gitrepo() { # ns name tag
  k apply -f - >/dev/null <<YAML
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata: {name: $2, namespace: $1}
spec: {interval: 5m, ref: {tag: "$3"}, url: ssh://git@github.com/Sefaria/Sefaria-Project}
YAML
}
k apply -f "$FIX/envs/preprod/helmrelease.yaml" >/dev/null
k apply -f "$FIX/envs/prod/helmrelease.yaml" >/dev/null
apply_gitrepo preprod sefaria-project-preprod "$TAG_PREPROD"
apply_gitrepo default sefaria-project-prod "$TAG_PROD"
helm install preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --set deployEnv=preprod --set "web.image=$IMG:$MASTER_TAG_PREPROD" >/dev/null
# What the real chart renders for prod at the fixture's origin/prod (read here with PyYAML, independently of the scripts):
# the web pods' Datadog labels and annotations go onto the stand-in pods, and each CronJob gets a stand-in with its name,
# schedule and release label (a no-op container), as Flux would have applied them.
helm template production "$FIX/helm-chart/sefaria" -n default \
  -f <("$PY" -c 'import sys, yaml; d = next(x for x in yaml.safe_load_all(open(sys.argv[1])) if x and x.get("kind") == "HelmRelease"); yaml.safe_dump(d["spec"]["values"], sys.stdout)' "$FIX/envs/prod/helmrelease.yaml") \
  >"$WORK/prod-render.yaml" || fatal "helm template of the fixture's prod chart failed"
"$PY" - "$WORK/prod-render.yaml" "$WORK/standin-production.yaml" "$WORK/cronjobs.yaml" <<'PY' || fatal "reading the rendered prod chart"
import json, re, sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
web = next(d for d in docs if d["kind"] == "Rollout" and d["metadata"]["name"] == "production-web")
meta = web["spec"]["template"]["metadata"]
dd = lambda m: {k: str(v) for k, v in (m or {}).items() if "datadoghq.com/" in k}
values = {"nginx": {"enabled": True}, "web": {"podLabels": dd(meta.get("labels")), "podAnnotations": dd(meta.get("annotations"))}}
assert values["web"]["podLabels"] and values["web"]["podAnnotations"], "prod renders no Datadog metadata"
yaml.safe_dump(values, open(sys.argv[2], "w"))
cronjobs = [d for d in docs if d["kind"] == "CronJob"]
assert cronjobs, "prod renders no CronJob"
out = []
for c in cronjobs:
    out.append({"apiVersion": "batch/v1", "kind": "CronJob",
                "metadata": {"name": c["metadata"]["name"], "namespace": "default",
                             "labels": {"app.kubernetes.io/instance": "production"}},
                "spec": {"schedule": c["spec"]["schedule"], "jobTemplate": {"spec": {"template": {"spec": {
                    "restartPolicy": "Never",
                    "containers": [{"name": "noop", "image": "kind.local/postgres:18", "imagePullPolicy": "Never",
                                    "command": ["true"]}]}}}}}})
open(sys.argv[3], "w").write("---\n".join(yaml.safe_dump(o) for o in out))
print(len(out))
PY
helm install production "$HERE/fixtures/standin-chart" -n default --kube-context "$CTX" --set deployEnv=production --set "web.image=$IMG:$MASTER_TAG_PROD" \
  -f "$WORK/standin-production.yaml" >/dev/null
k apply -f "$WORK/cronjobs.yaml" >/dev/null || fatal "stand-in CronJobs"
for ns in preprod default; do
  for s in $(k -n "$ns" get helmreleases.helm.toolkit.fluxcd.io -o json | "$PY" "$REL/release_lib.py" secret-refs); do
    k -n "$ns" create secret generic "$s" --from-literal=placeholder=not-a-secret --dry-run=client -o yaml | k apply -f - >/dev/null
  done
done
mark_healthy preprod preprod
mark_healthy default production
wait_web preprod preprod "$IMG:$MASTER_TAG_PREPROD" && wait_web default production "$IMG:$MASTER_TAG_PROD" \
  && ok "stand-in releases preprod and production run master images" || fatal "stand-in web pods did not start"
k -n default rollout status deployment/production-nginx-standin --timeout=120s >/dev/null || fatal "stand-in nginx did not start"

# ---------------------------------------------------------------------------------------------------------------
echo "# negative: wrong context"
refuses "snapshot refuses a kind context that is not the test cluster" "not the cluster of preprod" \
  "$REL/snapshot.sh" --env preprod --context kind-some-other-cluster --repo "$FIX"
refuses "snapshot refuses the prod context while the test override is set" "not the cluster of preprod" \
  "$REL/snapshot.sh" --env preprod --context "$PROD_CTX" --repo "$FIX"
refuses "without the override, the kind context is not preprod's cluster" "expected '$PROD_CTX'" \
  env -u APIKEYS_RELEASE_TEST_CONTEXT "$REL/snapshot.sh" --env preprod --context "$CTX" --repo "$FIX"
refuses "the override accepts only kind- contexts" "must name a kind- context" \
  env APIKEYS_RELEASE_TEST_CONTEXT="$PROD_CTX" "$REL/snapshot.sh" --env preprod --context "$PROD_CTX" --repo "$FIX"
refuses "restore refuses the staging cluster for preprod" "not the cluster of" \
  env -u APIKEYS_RELEASE_TEST_CONTEXT "$REL/restore.sh" db --snapshot "$HERE" --env preprod --context gke_development-205018_us-east1-b_cluster-1 --scoped

echo "# snapshot"
SNAPS="$WORK/snapshots"
check "snapshot dry run exits 0" "$REL/snapshot.sh" --env preprod --context "$CTX" --repo "$FIX" --out "$SNAPS"
[[ ! -e "$SNAPS" ]] && ok "snapshot dry run wrote nothing" || notok "snapshot dry run created $SNAPS"
refuses "listing-count refuses to infer which code serves the listing (--listing is required)" "listing before\|after is required|--listing before.after is required" \
  "$REL/listing-count.sh" --env preprod --context "$CTX" --repo "$MASTER_CODE"
check "listing-count before the merge" "$REL/listing-count.sh" --env preprod --context "$CTX" --repo "$MASTER_CODE" --listing before --record "$WORK/listing.json"
"$PY" - "$WORK/listing.json" <<'PY' && ok "listing count: 3 listed now, 1 hidden by the merge, 2 after" || notok "listing count (see $WORK/listing.json)"
import json, sys
d = json.load(open(sys.argv[1]))
sys.exit(0 if (d["schema"], d["listed_now"], d["hidden_after_merge"], d["listed_after_merge"]) == ("request_not_to_publish", 3, 1, 2) else 1)
PY
"$REL/snapshot.sh" --env preprod --context "$CTX" --repo "$FIX" --out "$SNAPS" --execute >"$LOGS/snapshot.out" 2>"$LOGS/snapshot.log"
SNAP="$(tail -n 1 "$LOGS/snapshot.out")"
[[ -f "$SNAP/manifest.json" ]] && ok "snapshot --execute wrote $SNAP" || { tail -n 30 "$LOGS/snapshot.log"; fatal "snapshot failed"; }
"$PY" - "$SNAP" "$TAG_PREPROD" "$TAG_PROD" "$IMG:$MASTER_TAG_PREPROD" "$IMG:$MASTER_TAG_PROD" <<'PY' >"$LOGS/manifest-check.log" 2>&1 \
  && ok "manifest: tags, helm revisions, images, current_database, Secrets, migrations, dumps" || { notok "manifest content (log: $LOGS/manifest-check.log)"; cat "$LOGS/manifest-check.log"; }
import hashlib, json, sys
from pathlib import Path
snap, tag_pp, tag_p, img_pp, img_p = sys.argv[1:]
m = json.load(open(Path(snap) / "manifest.json"))
pp, p = m["envs"]["preprod"], m["envs"]["prod"]
assert m["sharing_envs"] == ["preprod", "prod"], m["sharing_envs"]
assert (pp["release_tag"], p["release_tag"]) == (tag_pp, tag_p)
assert pp["helm_release"] == "preprod" and pp["helm_revision"] == 1 and p["helm_revision"] == 1
assert pp["rollouts"][0]["images"] == img_pp and p["rollouts"][0]["images"] == img_p, (pp["rollouts"], p["rollouts"])
assert pp["current_database"] == p["current_database"] == "sefaria_auth"
assert pp["secrets"].get("auth-service-registry") is True and all(pp["secrets"].values()), pp["secrets"]
assert "deployed" in pp["envfile"] and "branch" in pp["envfile"]
names = [r["name"] for r in m["database"]["django_migrations"] if r["app"] == "powered_by"]
assert names[-1] == "0003_request_not_to_publish", names
assert m["database"]["scoped_tables"] == ["powered_by_project"], m["database"]["scoped_tables"]
assert not m["database"]["apikeys_notify_exists"]
for rel, sha in m["files"].items():
    assert hashlib.sha256((Path(snap) / rel).read_bytes()).hexdigest() == sha, rel
assert "db/sefaria_auth.dump" in m["files"] and "db/scoped.dump" in m["files"]
print("manifest ok")
PY
grep -rqE "placeholder|not-a-secret" "$SNAP" && notok "the snapshot contains a Secret value" || ok "the snapshot holds no Secret value"
[[ "$(stat -c %a "$SNAP" 2>/dev/null || stat -f %Lp "$SNAP")" == 700 && "$(stat -c %a "$SNAP/db/sefaria_auth.dump" 2>/dev/null || stat -f %Lp "$SNAP/db/sefaria_auth.dump")" == 600 ]] \
  && ok "the snapshot directory and dumps are private (700/600)" || notok "snapshot permissions"

# ---------------------------------------------------------------------------------------------------------------
echo "# phase 1"
check "phase 1's migrations on sefaria_auth" manage "$PHASE1_CODE" migrate --noinput
check "phase 1's code writes a tier, a project and a key" django "$PHASE1_CODE" "$HERE/django/seed_phase1.py"
# The promotion: a release tag with phase 1 images, Flux applying it, the web pods rolling to the phase 1 image.
git -C "$FIX" checkout -q preprod
set_tags "$FIX/envs/preprod/helmrelease.yaml" "$PHASE1_TAG_PREPROD" "$PHASE1_CHART_PREPROD"
git -C "$FIX" commit -qam "deploy(preprod): phase 1"
git -C "$FIX" merge -q --no-ff -m "Merge master into preprod (fixture promotion)" master 2>/dev/null || true
TAG_PHASE1="preprod/${PHASE1_TAG_PREPROD#v}+chart.$PHASE1_CHART_PREPROD"
git -C "$FIX" tag "$TAG_PHASE1" && git -C "$FIX" push -q origin preprod --tags && git -C "$FIX" checkout -q master
k apply -f <(git -C "$FIX" show "$TAG_PHASE1:envs/preprod/helmrelease.yaml") >/dev/null
apply_gitrepo preprod sefaria-project-preprod "$TAG_PHASE1"
helm upgrade preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --set deployEnv=preprod --set "web.image=$IMG:$PHASE1_TAG_PREPROD" >/dev/null
mark_healthy preprod preprod
wait_web preprod preprod "$IMG:$PHASE1_TAG_PREPROD" && ok "preprod runs the phase 1 image (helm revision 2)" || notok "preprod did not roll to phase 1"

# The interval between the preprod promotion (which migrated the shared database) and the prod promotion: the schema is
# phase 1's, but prod's code is still master's and lists every published row. The expected behaviour is a parameter.
echo "# listing-count with the phase 1 schema and each code serving the listing"
check "listing-count --listing before on the phase 1 schema (master's code still serving)" \
  "$REL/listing-count.sh" --env preprod --context "$CTX" --repo "$MASTER_CODE" --listing before --record "$WORK/listing-before.json"
check "listing-count --listing after on the phase 1 schema (phase 1's code serving)" \
  "$REL/listing-count.sh" --env preprod --context "$CTX" --repo "$MASTER_CODE" --listing after --record "$WORK/listing-after.json"
"$PY" - "$WORK/listing-before.json" "$WORK/listing-after.json" <<'PY' && ok "listing: before = master's filter on the new schema (hidden rows reported), after = phase 1's filter (nothing more hidden); both agree on what is listed after" || notok "listing before/after on the phase 1 schema (see $WORK/listing-*.json)"
import json, sys
b, a = (json.load(open(p)) for p in sys.argv[1:3])
assert b["schema"] == "master-code-on-phase1-schema" and a["schema"] == "phase1-code", (b["schema"], a["schema"])
assert b["hidden_after_merge"] >= 1, b            # the schema inference reported 0 here: the old behaviour
assert b["listed_now"] == b["listed_after_merge"] + b["hidden_after_merge"], b
assert a["hidden_after_merge"] == 0 and a["listed_now"] == a["listed_after_merge"] == b["listed_after_merge"], (a, b)
PY

echo "# preflight"
mkdir -p "$WORK/infra/prod/cluster-1/spec/preprod"
printf 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: preprod\n' >"$WORK/infra/prod/cluster-1/spec/preprod/namespace.yaml"
refuses "preflight fails without the reader grant on powered_by_apikey" "lacks SELECT on powered_by_apikey" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
psql_pod -c "GRANT SELECT (id, key, project_id, label, allowed_origins, revoked_at) ON powered_by_apikey TO auth_service_reader" >/dev/null
check "preflight preprod passes once the grant exists" "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
PREPROD_PASS_N="$N"
# A Ready=True that describes an older generation (or carries no generation) is not readiness.
gen="$(k -n preprod get hr preprod -o jsonpath='{.metadata.generation}')"
k -n preprod patch hr preprod --subresource=status --type merge \
  -p "{\"status\":{\"conditions\":[{\"type\":\"Ready\",\"status\":\"True\",\"reason\":\"Old\",\"message\":\"previous reconciliation\",\"lastTransitionTime\":\"2026-11-09T00:00:00Z\",\"observedGeneration\":$((gen - 1))}]}}" >/dev/null
refuses "preflight fails on a HelmRelease whose Ready=True is for an older generation" "Ready=True is stale \(observedGeneration=$((gen - 1)),generation=$gen\)" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
k -n preprod patch hr preprod --subresource=status --type merge \
  -p '{"status":{"conditions":[{"type":"Ready","status":"True","reason":"Old","message":"no generation","lastTransitionTime":"2026-11-09T00:00:00Z"}]}}' >/dev/null
refuses "preflight fails on a Ready=True that names no observedGeneration" "Ready=True is stale \(observedGeneration=None" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
mark_healthy preprod preprod
check "preflight preprod passes again once Ready describes the current generation" "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
k -n default delete rollouts.argoproj.io production-web >/dev/null
refuses "preflight fails when the web Rollout is missing" "Rollout default/production-web not found" \
  "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
helm upgrade production "$HERE/fixtures/standin-chart" -n default --kube-context "$CTX" --reuse-values >/dev/null
mark_healthy default production
check "preflight prod passes (nothing pending, Secret in default)" "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
PROD_LOG="$LOGS/$N.log"
NCRON="$(grep -c '^kind: CronJob' "$WORK/prod-render.yaml")"
grep -qE "^PASS +$NCRON of $NCRON CronJobs the chart renders for production exist" "$PROD_LOG" \
  && grep -qE "^PASS +all 1 Running web pods carry the [0-9]+ Datadog labels and annotations" "$PROD_LOG" \
  && ok "preflight prod: the chart's $NCRON CronJobs and its Datadog labels and annotations are found" || notok "prod-only checks not reported (log: $PROD_LOG)"
CRON1="$(k -n default get cronjobs.batch -o jsonpath='{.items[0].metadata.name}')"
k -n default get cronjob "$CRON1" -o json >"$WORK/cron1.json"
k -n default delete cronjob "$CRON1" >/dev/null
refuses "preflight prod fails when a CronJob the chart renders is missing" "FAIL +CronJob $CRON1 .*missing in the cluster" \
  "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
k apply -f "$WORK/cron1.json" >/dev/null
WEBPOD="$(k -n default get pods -l app=web-production -o jsonpath='{.items[0].metadata.name}')"
k -n default annotate pod "$WEBPOD" ad.datadoghq.com/web.logs_exclude- >/dev/null
refuses "preflight prod fails when a prod web pod lacks a Datadog annotation" "FAIL +web pod $WEBPOD lacks Datadog ad.datadoghq.com/web.logs_exclude" \
  "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
k -n default annotate pod "$WEBPOD" ad.datadoghq.com/web.logs_exclude=true >/dev/null
check "preflight prod passes again with the CronJob and the annotation back" "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
# Where the registry Secret's namespace must be declared: namespaces.yaml, another Namespace manifest, or a MANUAL line.
grep -qE "^PASS +namespace preprod .*declared in prod/cluster-1/spec/preprod/namespace.yaml" "$LOGS/$PREPROD_PASS_N.log" \
  && ok "preflight preprod: namespace preprod found in its own namespace.yaml" || notok "namespace check (log: $LOGS/$PREPROD_PASS_N.log)"
mkdir -p "$WORK/infra-nsfile/prod/cluster-1/spec" "$WORK/infra-missing/prod/cluster-1/spec"
printf 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: monitoring\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: preprod\n' >"$WORK/infra-nsfile/prod/cluster-1/spec/namespaces.yaml"
printf 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: monitoring\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: preprod-other\n' >"$WORK/infra-missing/prod/cluster-1/spec/namespaces.yaml"
check "preflight preprod: namespace preprod listed in namespaces.yaml" bash -c "'$REL/preflight.sh' --env preprod --context '$CTX' --repo '$FIX' --no-fetch --skip-image-check --infra-repo '$WORK/infra-nsfile' | grep -E '^PASS +namespace preprod .*is listed in prod/cluster-1/spec/namespaces.yaml'"
refuses "preflight preprod fails when no manifest declares namespace preprod" "FAIL +namespace preprod .*is not declared" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra-missing"
check "preflight preprod without --infra-repo passes and prints the namespace check as MANUAL" bash -c "'$REL/preflight.sh' --env preprod --context '$CTX' --repo '$FIX' --no-fetch --skip-image-check | grep -E '^MANUAL namespace preprod .*prod/cluster-1/spec/namespaces.yaml'"
# A migration outside phase 1 pending at the code ref fails the preprod preflight unless it is named.
git -C "$FIX" checkout -q master && mkdir -p "$FIX/reader/migrations" && touch "$FIX/reader/migrations/0099_release_test.py" \
  && git -C "$FIX" add -A && git -C "$FIX" commit -qm "fixture: an extra migration" && git -C "$FIX" push -q origin master
refuses "preflight fails when a migration outside phase 1 is pending" "outside phase 1 would also run" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
check "preflight passes when that migration is acknowledged with --allow-pending" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --allow-pending reader/0099_release_test
git -C "$FIX" reset -q --hard HEAD~1 && git -C "$FIX" push -q -f origin master
# The Artifact Registry check, with a stand-in gcloud that knows only the prod env file's tag.
mkdir -p "$WORK/bin"
printf '#!/bin/sh\necho "$@" >>"%s/gcloud.calls"\ncase "$*" in *":%s "*) exit 0 ;; esac\nexit 1\n' "$WORK" "$MASTER_TAG_PROD" >"$WORK/bin/gcloud"
chmod +x "$WORK/bin/gcloud"
check "preflight prod checks web, nodejs and nginx images in the registry" env PATH="$WORK/bin:$PATH" "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch
[[ "$(grep -c "artifacts docker images describe" "$WORK/gcloud.calls")" == 3 ]] && ok "three image lookups, authService (no tag yet) skipped" || notok "image lookups: $(cat "$WORK/gcloud.calls")"
printf '#!/bin/sh\nexit 1\n' >"$WORK/bin/gcloud"
refuses "preflight fails when an image tag is not in the registry" "not found in Artifact Registry" \
  env PATH="$WORK/bin:$PATH" "$REL/preflight.sh" --env prod --context "$CTX" --repo "$FIX" --no-fetch
k -n preprod delete secret auth-service-registry >/dev/null
check "preflight does not fail on a missing registry Secret while authService.enabled is false (WARN, not needed yet)" \
  bash -c "'$REL/preflight.sh' --env preprod --context '$CTX' --repo '$FIX' --no-fetch --skip-image-check | grep -E '^WARN +Secret auth-service-registry is missing .*not needed yet'"
refuses "preflight --require-auth-service fails when the registry Secret is missing" "FAIL +Secret auth-service-registry is missing" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --require-auth-service
k -n preprod create secret generic auth-service-registry --from-literal=placeholder=not-a-secret >/dev/null

# ---------------------------------------------------------------------------------------------------------------
echo "# watch-promotion"
refuses "watch-promotion refuses a context that is not the env's cluster" "not the cluster of preprod" \
  "$REL/watch-promotion.sh" --env preprod --context kind-some-other-cluster --interval 1 --duration 1
NEWEST="$(psql_pod -At -c "SELECT name FROM django_migrations WHERE app = 'powered_by' ORDER BY id DESC LIMIT 1")"
before="$(db_state)"
exits 0 "watch-promotion: a clean short window exits 0" "no threshold crossed" \
  "$REL/watch-promotion.sh" --env preprod --context "$CTX" --interval 2 --duration 8 --out "$WORK/watch-clean"
"$PY" - "$WORK/watch-clean/watch.jsonl" "$NEWEST" <<'PY' >"$LOGS/watch-clean.log" 2>&1 \
  && ok "each tick recorded no lock wait, the newest powered_by migration ($NEWEST), 1/1 prod web pod ready, nginx requests and no 5xx" \
  || { notok "watch-promotion JSON lines (log: $LOGS/watch-clean.log)"; tail -n 15 "$LOGS/watch-clean.log"; }
import json, sys
ticks = [json.loads(l) for l in open(sys.argv[1])]
assert len(ticks) >= 3, len(ticks)
for t in ticks:
    assert not t["alarms"] and not t["errors"], t
    assert t["db"]["lock_waits"] == [], t["db"]
    assert t["db"]["newest_powered_by"]["name"] == sys.argv[2], t["db"]
    assert t["web_pods"]["total"] == t["web_pods"]["ready"] == 1, t["web_pods"]
    assert t["nginx"]["requests"] > 0 and t["nginx"]["5xx"] == 0, t["nginx"]
print(len(ticks), "ticks")
PY
# Stopped early (Ctrl-C, or here TERM, which a background job can trap), it still prints the summary and exits 0.
"$REL/watch-promotion.sh" --env preprod --context "$CTX" --interval 2 --duration 300 --out "$WORK/watch-stop" >"$LOGS/watch-stop.log" 2>&1 &
STOP_PID=$!
sleep 7
kill -TERM "$STOP_PID"
rc=0
wait "$STOP_PID" || rc=$?
[[ "$rc" == 0 ]] && grep -q "no threshold crossed" "$LOGS/watch-stop.log" && [[ "$(wc -l <"$WORK/watch-stop/watch.jsonl")" -ge 2 ]] \
  && ok "watch-promotion stopped by a signal prints its summary and exits 0" || { notok "watch-promotion stop (exit $rc, log: $LOGS/watch-stop.log)"; tail -n 10 "$LOGS/watch-stop.log"; }
# A transaction holding ACCESS EXCLUSIVE on powered_by_project, and a reader queued behind it whose query carries a
# literal that must never reach the watch's output.
MARKER="sfr_watchmarker$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
psql_pod -c "SET application_name = 'release-test-lock'; BEGIN; LOCK TABLE powered_by_project IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(120); COMMIT;" </dev/null >/dev/null 2>&1 &
HOLD_PID=$!
for _ in $(seq 1 30); do
  [[ "$(psql_pod -At -c "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'powered_by_project' AND l.mode = 'AccessExclusiveLock' AND l.granted")" == 1 ]] && break
  sleep 1
done
psql_pod -c "SET application_name = 'release-test-waiter'; SELECT count(*) FROM powered_by_project WHERE name = 'x' /* it's */ OR name = '$MARKER'" </dev/null >/dev/null 2>&1 &
WAIT_PID=$!
exits 2 "watch-promotion: the lock-wait alarm fires while a transaction holds ACCESS EXCLUSIVE on powered_by_project" "ALARM: lock wait [0-9.]+s > 2s" \
  "$REL/watch-promotion.sh" --env preprod --context "$CTX" --interval 2 --duration 30 --max-lock-wait 2 --long-query 1 --stop-on-alarm --out "$WORK/watch-lock"
WATCH_LOCK_LOG="$LOGS/$N.log"
"$PY" - "$WORK/watch-lock/watch.jsonl" <<'PY' >"$LOGS/watch-lock.log" 2>&1 \
  && ok "the alarm tick names the waiter, its lock on powered_by_project, the blocking pid and the holder as long-running" \
  || { notok "watch-promotion lock record (log: $LOGS/watch-lock.log)"; tail -n 15 "$LOGS/watch-lock.log"; }
import json, sys
last = [json.loads(l) for l in open(sys.argv[1])][-1]
assert last["alarms"], last
w = last["db"]["lock_waits"][0]
assert w["application_name"] == "release-test-waiter" and w["waiting_for"].startswith("powered_by_project:"), w
assert w["blocked_by"] and "'?'" in w["query"], w
holder = [r for r in last["db"]["long_running"] if r["application_name"] == "release-test-lock"]
assert holder and holder[0]["pid"] in w["blocked_by"], last["db"]["long_running"]
PY
! grep -rq "$MARKER" "$WORK/watch-lock" "$WATCH_LOCK_LOG" && ok "the query literal never reaches the watch output or its JSON lines" || notok "the query literal leaked"
psql_pod -At -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name LIKE 'release-test-%'" >/dev/null
wait "$HOLD_PID" "$WAIT_PID" 2>/dev/null
[[ "$(db_state)" == "$before" ]] && ok "the watches changed nothing in the database" || notok "the database changed during the watches"
# prod nginx answering 503: the 5xx alarm.
k -n default exec deploy/production-nginx-standin -c nginx -- sh -c 'echo 503 >/tmp/status'
sleep 3
exits 2 "watch-promotion: the 5xx alarm fires when prod nginx answers 503" "ALARM: prod 5xx [0-9.]+% > 5%" \
  "$REL/watch-promotion.sh" --env preprod --context "$CTX" --interval 2 --duration 20 --max-5xx-pct 5 --min-requests 10 --stop-on-alarm --out "$WORK/watch-5xx"
k -n default exec deploy/production-nginx-standin -c nginx -- rm -f /tmp/status
# An unreadable database is an incomplete watch (exit 1), not a clean one.
exits 1 "watch-promotion: a tick that cannot read the database exits 1" "could not read: db, migrations" \
  env PG_POD=postgres-18-9 "$REL/watch-promotion.sh" --env preprod --context "$CTX" --interval 1 --duration 1 --out "$WORK/watch-nodb"
exits 2 "watch-promotion: three ticks in a row without the database raise an alarm" "ALARM: the database could not be read for 3 ticks in a row" \
  env PG_POD=postgres-18-9 "$REL/watch-promotion.sh" --env preprod --context "$CTX" --interval 1 --duration 30 --stop-on-alarm --out "$WORK/watch-nodb3"

# ---------------------------------------------------------------------------------------------------------------
echo "# restore db refused while phase 1 runs"
before="$(db_state)"
refuses "restore db --scoped refuses while a preprod pod runs the phase 1 image" "runs an image other than the snapshot" \
  bash -c "echo preprod | '$REL/restore.sh' db --snapshot '$SNAP' --env preprod --context '$CTX' --scoped --execute"
[[ "$(db_state)" == "$before" ]] && ok "the refused restore changed nothing" || notok "the refused restore changed the database"
# A snapshot that recorded no running web pod for an env cannot prove the pods are safe: refuse.
cp -r "$SNAP" "$WORK/snap-nopods"
"$PY" - "$WORK/snap-nopods/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m["envs"]["prod"]["web_pods"] = []; json.dump(m, open(sys.argv[1], "w"))
PY
refuses "restore db --scoped refuses when the snapshot recorded no running web pod" "recorded no running web pod" \
  "$REL/restore.sh" db --snapshot "$WORK/snap-nopods" --env preprod --context "$CTX" --scoped
# The env file image parser reports a missing web tag instead of dropping it.
"$PY" - "$REL/release_lib.py" "$PHASE1_CODE/envs/prod/helmrelease.yaml" <<'PY' && ok "env-images reads every component and reports a missing tag" || notok "env-images parsing"
import subprocess, sys
text = open(sys.argv[2]).read()
def parse(t):
    out = subprocess.run([sys.executable, sys.argv[1], "env-images"], input=t, capture_output=True, text=True, check=True).stdout
    return {l.split("\t")[0]: l.split("\t")[1:] for l in out.splitlines()}
full = parse(text)
assert all(full[c][0] and full[c][1] for c in ("web", "nodejs", "nginx")), full
import re
broken = re.sub(r'(web:\s*\n\s*containerImage:\s*\n\s*imageRegistry: [^\n]+\n\s*)tag: "[^"]*"', r'\1tag: ""', text, count=1)
assert broken != text
assert parse(broken)["web"][1] == "" and parse(broken)["nodejs"][1], parse(broken)
PY
# A web pod pinned by digest is still not the snapshot's image.
"$PY" - "$REL/release_lib.py" <<'PY' && ok "the image guard parses digests, tags and registry ports" || notok "image guard parsing"
import json, subprocess, sys
def pod(name, image, app="web-preprod", phase="Running", cname="web"):
    return {"metadata": {"name": name, "labels": {"app": app}}, "status": {"phase": phase},
            "spec": {"containers": [{"name": cname, "image": image}]}}
def guard(pods):
    doc = json.dumps({"kind": "PodList", "items": pods})
    r = subprocess.run([sys.executable, sys.argv[1], "image-guard", "--allowed", "reg.io:5000/sefaria-web:v1", "--web-label", "web-preprod"],
                       input=doc, capture_output=True, text=True)
    return r.returncode, r.stdout
assert guard([pod("a", "reg.io:5000/sefaria-web:v1")]) == (0, "")
assert guard([pod("b", "reg.io:5000/sefaria-web@sha256:" + "0" * 64)])[0] == 1
assert guard([pod("c", "reg.io:5000/sefaria-web:v2", app="tasks-preprod", cname="task")])[0] == 1
assert guard([pod("d", "other.io/thing:v9", app="web-preprod")])[0] == 1
assert guard([pod("e", "other.io/thing:v9", app="redis")])[0] == 0
assert guard([pod("f", "reg.io:5000/sefaria-web:v2", phase="Succeeded")])[0] == 0
PY
refuses "restore db --full refuses and prints the procedure" "refusing to run a full-database restore" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --full

echo "# restore chart"
check "restore chart dry run" "$REL/restore.sh" chart --snapshot "$SNAP" --env preprod --context "$CTX" --repo "$FIX"
grep -q "trigger-infra-deploy.yml .*-f tag=$TAG_PREPROD" "$LOGS/$N.log" && ok "the dry run prints the redeploy of $TAG_PREPROD" || notok "redeploy command missing"
[[ -z "$(git -C "$FIX" branch --list 'rollback/*')" ]] && ok "the dry run created no branch" || notok "the dry run created a branch"
check "restore chart --execute prepares the rollback branch" "$REL/restore.sh" chart --snapshot "$SNAP" --env preprod --context "$CTX" --repo "$FIX" --execute
RB="$(git -C "$FIX" branch --list 'rollback/*' --format='%(refname:short)')"
if [[ -n "$RB" ]] && git -C "$FIX" show "$RB:envs/preprod/helmrelease.yaml" | cmp -s - "$SNAP/envfiles/preprod.deployed.helmrelease.yaml"; then
  ok "branch $RB carries the snapshot's env file"
else
  notok "rollback branch '$RB' missing or wrong"
fi
[[ -z "$(git -C "$WORK/origin.git" branch --list 'rollback/*')" ]] && ok "nothing was pushed" || notok "the rollback branch reached origin"
helm_rev() { helm history preprod -n preprod --kube-context "$CTX" --max 1 -o json | "$PY" "$REL/release_lib.py" helm-release-revision; }
check "restore chart --emergency dry run" "$REL/restore.sh" chart --snapshot "$SNAP" --env preprod --context "$CTX" --emergency
[[ "$(helm_rev)" == 2 && "$(k -n preprod get hr preprod -o jsonpath='{.spec.suspend}')" != true ]] && ok "the emergency dry run changed nothing" || notok "the emergency dry run changed the release"
refuses "the emergency rollback refuses a wrong confirmation" "confirmation did not match" \
  bash -c "echo prod | '$REL/restore.sh' chart --snapshot '$SNAP' --env preprod --context '$CTX' --emergency --execute"
[[ "$(helm_rev)" == 2 ]] && ok "a wrong confirmation changed nothing" || notok "a wrong confirmation changed the release"
EMERGENCY_N=$((N + 1))
check "restore chart --emergency --execute" bash -c "echo preprod | '$REL/restore.sh' chart --snapshot '$SNAP' --env preprod --context '$CTX' --emergency --execute"
[[ "$(k -n preprod get hr preprod -o jsonpath='{.spec.suspend}')" == true ]] && ok "HelmRelease preprod is suspended" || notok "HelmRelease not suspended"
[[ "$(helm_rev)" == 3 ]] && helm get values preprod -n preprod --kube-context "$CTX" -o json | grep -q "$IMG:$MASTER_TAG_PREPROD" \
  && ok "helm revision 3 is revision 1's values" || notok "helm rollback state"
[[ "$(k -n preprod get rollouts.argoproj.io preprod-web -o jsonpath='{.spec.template.spec.containers[0].image}')" == "$IMG:$MASTER_TAG_PREPROD" ]] \
  && ok "Rollout preprod-web is back on the snapshot's image" || notok "Rollout image"
wait_web preprod preprod "$IMG:$MASTER_TAG_PREPROD" && ok "preprod web pods run the snapshot's image again" || notok "web pods did not roll back"
# The git side, as Flux would apply it once trigger-infra-deploy points the GitRepository back at the snapshot's tag.
[[ -n "$RB" ]] || fatal "no rollback branch to apply"
k apply -f <(git -C "$FIX" show "$RB:envs/preprod/helmrelease.yaml") >/dev/null
apply_gitrepo preprod sefaria-project-preprod "$TAG_PREPROD"
k -n preprod patch hr preprod --type merge -p '{"spec":{"suspend":false}}' >/dev/null
k -n preprod get hr preprod -o json >"$WORK/hr-after.json"
"$PY" -c 'import json,sys; m=json.load(open(sys.argv[1])); json.dump({"spec": m["envs"]["preprod"]["helmrelease_spec"]}, open(sys.argv[2], "w"))' "$SNAP/manifest.json" "$WORK/hr-snap.json"
check "HelmRelease preprod equals the snapshot's (spec)" "$PY" "$REL/release_lib.py" hr-spec-equal "$WORK/hr-snap.json" "$WORK/hr-after.json"
[[ "$(k -n preprod get gitrepositories.source.toolkit.fluxcd.io sefaria-project-preprod -o jsonpath='{.spec.ref.tag}')" == "$TAG_PREPROD" ]] \
  && ok "GitRepository preprod is at the snapshot's tag" || notok "GitRepository tag"
# The resume command is printed only when Flux serves the snapshot's tag: pinned to it AND an artifact fetched for it.
grep -q "NOT printing the resume command" "$LOGS/$EMERGENCY_N.log" && ! grep -q "flux resume hr" "$LOGS/$EMERGENCY_N.log" \
  && ok "the emergency rollback's log did not print the resume command (no artifact for the snapshot's tag yet)" || notok "the emergency log printed or lacked the resume refusal"
refuses "restore resume refuses while the GitRepository has fetched no artifact for the snapshot's tag" "NOT printing the resume command.*has not fetched" \
  "$REL/restore.sh" resume --snapshot "$SNAP" --env preprod --context "$CTX"
k -n preprod patch gitrepositories.source.toolkit.fluxcd.io sefaria-project-preprod --type merge -p '{"spec":{"ref":{"tag":"preprod/0.0.0+chart.0"}}}' >/dev/null
k -n preprod patch gitrepositories.source.toolkit.fluxcd.io sefaria-project-preprod --subresource=status --type merge -p "{\"status\":{\"artifact\":{\"revision\":\"preprod/0.0.0+chart.0@sha1:0123456789abcdef\"}}}" >/dev/null
refuses "restore resume refuses while the GitRepository serves another tag" "NOT printing the resume command.*spec.ref.tag is 'preprod/0.0.0\+chart.0'" \
  "$REL/restore.sh" resume --snapshot "$SNAP" --env preprod --context "$CTX"
k -n preprod patch gitrepositories.source.toolkit.fluxcd.io sefaria-project-preprod --type merge -p "{\"spec\":{\"ref\":{\"tag\":\"$TAG_PREPROD\"}}}" >/dev/null
refuses "restore resume refuses while the artifact is still the other tag's" "has not fetched" \
  "$REL/restore.sh" resume --snapshot "$SNAP" --env preprod --context "$CTX"
k -n preprod patch gitrepositories.source.toolkit.fluxcd.io sefaria-project-preprod --subresource=status --type merge -p "{\"status\":{\"artifact\":{\"revision\":\"$TAG_PREPROD@sha1:0123456789abcdef\"}}}" >/dev/null
check "restore resume prints the flux resume command once the GitRepository serves the snapshot's tag" \
  bash -c "'$REL/restore.sh' resume --snapshot '$SNAP' --env preprod --context '$CTX' | grep -F 'flux resume hr preprod -n preprod --context $CTX'"

# ---------------------------------------------------------------------------------------------------------------
echo "# restore db: the maintenance fence"
before="$(db_state)"
refuses "restore db --scoped refuses while the HelmReleases are not suspended" "HelmRelease preprod/preprod is not suspended" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
grep -q "HelmRelease default/production is not suspended" "$LOGS/$N.log" && ok "the refusal lists prod's HelmRelease too (both envs share the database)" || notok "prod's HelmRelease not listed"
refuses "restore db --scoped --execute refuses without the fence and changes nothing" "maintenance fence is not in place" \
  bash -c "echo preprod | '$REL/restore.sh' db --snapshot '$SNAP' --env preprod --context '$CTX' --scoped --execute"
[[ "$(db_state)" == "$before" ]] && ok "the refused restore changed nothing" || notok "the refused restore changed the database"
k -n preprod patch hr preprod --type merge -p '{"spec":{"suspend":true}}' >/dev/null
k -n default patch hr production --type merge -p '{"spec":{"suspend":true}}' >/dev/null
# A CronJob that runs the web image writes the database: it must be suspended too.
k -n default create cronjob release-test-web-cron --image="$IMG:$MASTER_TAG_PROD" --schedule="0 0 1 1 *" -- true >/dev/null
refuses "restore db --scoped refuses an unsuspended CronJob that runs the web image" "CronJob/release-test-web-cron: it runs the web image and is not suspended" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
k -n default patch cronjob release-test-web-cron --type merge -p '{"spec":{"suspend":true}}' >/dev/null
# A controller whose pod template is on the phase 1 image can start phase 1 pods at any time, even with no pod now.
helm upgrade preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --reuse-values --set "rolloutImage=$IMG:$PHASE1_TAG_PREPROD" >/dev/null
refuses "restore db --scoped refuses a Rollout whose pod template is on the phase 1 image (no pod of it needs to exist)" "Rollout/preprod-web: its pod template runs .*$PHASE1_TAG_PREPROD" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
helm upgrade preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --reuse-values --set rolloutImage= >/dev/null
# Another session writing the scoped tables: one holding a write lock, and one that writes in short transactions.
psql_pod -c "SET application_name = 'release-test-writer'; BEGIN; UPDATE powered_by_project SET project_name = project_name WHERE id = (SELECT min(id) FROM powered_by_project); SELECT pg_sleep(90); COMMIT;" </dev/null >/dev/null 2>&1 &
HOLD_PID=$!
for _ in $(seq 1 30); do
  [[ "$(psql_pod -At -c "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'powered_by_project' AND l.mode = 'RowExclusiveLock' AND l.granted")" -ge 1 ]] && break
  sleep 1
done
refuses "restore db --scoped refuses while another session holds a write lock on a scoped table" "session [0-9]+ \(app release-test-writer, .*\) holds RowExclusiveLock on powered_by_project: a writer" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
psql_pod -At -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'release-test-writer'" >/dev/null
wait "$HOLD_PID" 2>/dev/null
printf "SET application_name = 'release-test-watcher';\nUPDATE powered_by_project SET project_name = project_name WHERE id = (SELECT min(id) FROM powered_by_project);\n\\watch 0.3\n" | psql_pod >/dev/null 2>&1 &
WATCH_PID=$!
sleep 3
refuses "restore db --scoped refuses while another session writes the scoped tables in short transactions" "rows of the scoped tables were written within|holds RowExclusiveLock on powered_by_project: a writer" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
psql_pod -At -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'release-test-watcher'" >/dev/null
wait "$WATCH_PID" 2>/dev/null
[[ "$(db_state)" == "$before" ]] && ok "none of the refused restores changed the database" || notok "a refused restore changed the database"

echo "# restore db"
before="$(db_state)"
check "restore db --scoped dry run" "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
DRYLOG="$LOGS/$N.log"
grep -q "DRY RUN" "$DRYLOG" && [[ "$(db_state)" == "$before" ]] && ok "the db dry run changed nothing" || notok "the db dry run changed the database"
grep -q "fence in place (before the dump)" "$DRYLOG" && ok "the dry run reports the fence in place" || notok "no fence report in the dry run"
# The restore SQL: pg_restore's own SET statement_timeout/lock_timeout = 0 lines are gone, the bounds are set again after
# the dump's statements, and the transaction takes the tables ACCESS EXCLUSIVE first and aborts on queued writers.
SQLF="$(ls -t "$SNAP"/restore-*/restore.sql | head -1)"
libcall pg_restore_local "$SNAP/db/scoped.dump" --file=- >"$WORK/raw-restore.sql" 2>/dev/null
grep -qE '^SET (statement_timeout|lock_timeout) = 0' "$WORK/raw-restore.sql" \
  && ok "pg_restore's raw output does set statement_timeout and lock_timeout to 0 (so the next check can fail)" || notok "pg_restore's raw output has no timeout reset; the check below proves nothing"
! grep -qE '^SET (statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = ' "$SQLF" \
  && ok "the restore SQL carries none of the dump's timeout settings" || notok "the restore SQL still resets a timeout ($SQLF)"
"$PY" - "$SQLF" <<'PY' && ok "the lock and statement bounds are set at the start and again after the dump's statements; the tables are locked ACCESS EXCLUSIVE first and queued writers abort the transaction" || notok "restore SQL structure ($SQLF)"
import sys
lines = open(sys.argv[1]).read().splitlines()
lock = [i for i, l in enumerate(lines) if l == "SET LOCAL lock_timeout = '15s';"]
stmt = [i for i, l in enumerate(lines) if l == "SET LOCAL statement_timeout = '10min';"]
begin = lines.index("BEGIN;")
lt = next(i for i, l in enumerate(lines) if l.startswith("LOCK TABLE"))
do = next(i for i, l in enumerate(lines) if l.startswith("DO $fence$"))
drop = next(i for i, l in enumerate(lines) if l.startswith("DROP TABLE"))
assert len(lock) >= 2 and len(stmt) >= 2, (lock, stmt)
assert begin < lock[0] < lt < do < drop, (begin, lock, lt, do, drop)
assert "ACCESS EXCLUSIVE" in lines[lt]
assert lock[-1] > drop and stmt[-1] > drop, "the bounds are set again after the dump's statements"
PY
# A failure at the last statement (the django_migrations rows) must roll back the drops and the table restore.
psql_pod -c "CREATE FUNCTION release_test_block() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'release test: blocked'; END \$\$;
  CREATE TRIGGER release_test_block BEFORE INSERT ON django_migrations FOR EACH ROW WHEN (NEW.app = 'powered_by') EXECUTE FUNCTION release_test_block();" >/dev/null
before="$(db_state)"
refuses "a restore that fails at its last statement reports the rollback" "failed and was rolled back" \
  bash -c "echo preprod | '$REL/restore.sh' db --snapshot '$SNAP' --env preprod --context '$CTX' --scoped --execute"
[[ "$(db_state)" == "$before" && "$(psql_pod -At -c "SELECT count(*) FROM pg_proc WHERE proname = 'apikeys_notify'")" == 1 ]] \
  && ok "the failed restore left the database as it was (one transaction)" || notok "the failed restore changed the database"
psql_pod -c "DROP TRIGGER release_test_block ON django_migrations; DROP FUNCTION release_test_block();" >/dev/null
check "restore db --scoped --execute" bash -c "echo preprod | '$REL/restore.sh' db --snapshot '$SNAP' --env preprod --context '$CTX' --scoped --execute"
tables="$(libcall scoped_tables_sql | psql_pod -At | tr '\n' ' ')"
[[ "$tables" == "powered_by_project " ]] && ok "only powered_by_project remains of the scoped tables" || notok "tables after restore: $tables"
# shellcheck disable=SC2086
libcall checksums_sql $tables | psql_pod -At -F "$(printf '\t')" | diff - "$SNAP/db/scoped-checksums.tsv" >"$LOGS/checksums.diff" \
  && ok "row checksums and powered_by migrations equal the snapshot" || notok "checksums differ ($LOGS/checksums.diff)"
# shellcheck disable=SC2086
libcall scoped_schema sefaria_auth $tables >"$WORK/schema-after.sql"
diff "$SNAP/db/scoped-schema.roundtrip.sql" "$WORK/schema-after.sql" >"$LOGS/schema.diff" \
  && ok "the powered_by_project schema equals the snapshot's dump restored into a scratch Postgres (pg_dump --schema-only)" \
  || notok "schema differs from the round-tripped snapshot ($LOGS/schema.diff)"
diff <("$PY" "$REL/release_lib.py" canonical-schema <"$SNAP/db/scoped-schema.sql") <("$PY" "$REL/release_lib.py" canonical-schema <"$WORK/schema-after.sql") \
  >"$LOGS/schema-canonical.diff" && ok "and equals the original snapshot schema up to how Postgres prints CHECK expressions" \
  || notok "schema differs from the original snapshot ($LOGS/schema-canonical.diff)"
[[ "$(psql_pod -At -c "SELECT count(*) FROM pg_proc WHERE proname = 'apikeys_notify'")" == 0 && \
   "$(psql_pod -At -c "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'powered_by_project'::regclass AND NOT tgisinternal")" == 0 ]] \
  && ok "apikeys_notify() and the NOTIFY triggers are gone" || notok "phase 1 function or triggers remain"
ls "$SNAP"/restore-*/pre-restore.dump >/dev/null 2>&1 && ok "a fresh dump was taken before the restore" || notok "no pre-restore dump"
check "master's code: no unapplied migrations on the restored database" manage "$MASTER_CODE" migrate --check
check "master's code creates, lists and deletes a listing" django "$MASTER_CODE" "$HERE/django/master_listing_check.py"
# A leftover apikeys_notify() alone means the database does not match the snapshot.
psql_pod -c "CREATE FUNCTION apikeys_notify() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$" >/dev/null
"$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped >"$LOGS/fn-only.log" 2>&1
! grep -q "already matches" "$LOGS/fn-only.log" && grep -q "DRY RUN" "$LOGS/fn-only.log" \
  && ok "a leftover apikeys_notify() is not 'already matches'" || notok "function-only difference ($LOGS/fn-only.log)"
psql_pod -c "DROP FUNCTION apikeys_notify()" >/dev/null
# A snapshot without apikeys_notify.state could not be verified after a restore: refused before anything changes.
mv "$SNAP/db/apikeys_notify.state" "$SNAP/db/apikeys_notify.state.hidden"
refuses "restore db --scoped refuses a snapshot without apikeys_notify.state" "no db/apikeys_notify.state" \
  "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
mv "$SNAP/db/apikeys_notify.state.hidden" "$SNAP/db/apikeys_notify.state"
check "restore db --scoped again is a no-op" bash -c "'$REL/restore.sh' db --snapshot '$SNAP' --env preprod --context '$CTX' --scoped 2>&1 | grep 'already matches'"
check "phase 1 migrates forward again after the restore" manage "$PHASE1_CODE" migrate --noinput
check "master's code still lists after phase 1 re-migrated (old code on the new schema)" django "$MASTER_CODE" "$HERE/django/master_listing_check.py"

# ---------------------------------------------------------------------------------------------------------------
echo "# rehearsal"
check "rehearse-migration on the snapshot dump" "$REL/rehearse-migration.sh" --dump "$SNAP/db/sefaria_auth.dump" --code "$PHASE1_CODE" \
  --python "$PY" --port "$REHEARSAL_PORT" --out "$WORK/rehearsal" --concurrent-reads
"$PY" - "$WORK/rehearsal/report.json" <<'PY' && ok "the rehearsal timed 0003_developer_settings through 0010_seed_mcp_tier" || notok "rehearsal report"
import json, sys
r = json.load(open(sys.argv[1]))
names = [m["name"] for m in r["migrations"] if m["app"] == "powered_by"]
assert names[0] == "0003_developer_settings" and names[-1] == "0010_seed_mcp_tier", names
print(r["total_seconds"])
PY
sed 's/^/    /' "$WORK/rehearsal/report.txt"
: >"$WORK/empty-samples.tsv"
refuses "a rehearsal summary with no sampler output is an error, not 'no lock waits'" "recorded nothing" \
  "$PY" "$REL/release_lib.py" rehearse-summary --timings "$WORK/rehearsal/timings.jsonl" --samples "$WORK/empty-samples.tsv" --out "$WORK/empty-report.json"

# ---------------------------------------------------------------------------------------------------------------
echo "# staging-smoke: the legacy apikey write, against a stub of the two endpoints"
LEG="$WORK/legacy"
mkdir -p "$LEG"
LEGACY_KEY="legacy-smoke-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$LEGACY_KEY" >"$LEG/key"
printf 'session-%s\n' "$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')" >"$LEG/session"
"$PY" "$HERE/fixtures/legacy_api_stub.py" --key-file "$LEG/key" --session-file "$LEG/session" --port-file "$LEG/port" --log "$LEG/requests.jsonl" &
STUB_PID=$!
for _ in $(seq 1 20); do [[ -s "$LEG/port" ]] && break; sleep 0.5; done
STUB="http://127.0.0.1:$(cat "$LEG/port")"
"$REL/staging-smoke.sh" --base-url "$STUB" --no-gh >"$LEG/without.log" 2>&1
grep -q "^MANUAL legacy apikey write" "$LEG/without.log" && ! grep -qi "^PASS.*legacy" "$LEG/without.log" \
  && ok "staging-smoke without --legacy-apikey-file lists the legacy write as MANUAL, not PASS" || notok "legacy write without the flag ($LEG/without.log)"
refuses "staging-smoke refuses --legacy-apikey-file without --session-cookie-file (nothing would delete the collection)" "needs --session-cookie-file" \
  "$REL/staging-smoke.sh" --base-url "$STUB" --no-gh --legacy-apikey-file "$LEG/key"
"$REL/staging-smoke.sh" --base-url "$STUB" --no-gh --legacy-apikey-file "$LEG/key" --session-cookie-file "$LEG/session" >"$LEG/with.log" 2>&1
grep -q "^PASS  POST /api/collections with an unknown legacy key is refused" "$LEG/with.log" \
  && grep -q "^PASS  legacy apikey write: POST /api/collections with the key in the body created collection" "$LEG/with.log" \
  && grep -q "^PASS  the collection the legacy write created was deleted" "$LEG/with.log" \
  && ! grep -q "^MANUAL legacy" "$LEG/with.log" \
  && ok "staging-smoke --legacy-apikey-file: unknown key refused, write created a collection, the collection deleted" || { notok "legacy write checks ($LEG/with.log)"; grep -i legacy "$LEG/with.log" | sed 's/^/    /'; }
"$PY" - "$LEG/requests.jsonl" <<'PY' && ok "the stub saw the key in the POST body and a CSRF-checked DELETE of the collection it created" || notok "stub request log ($LEG/requests.jsonl)"
import json, sys
reqs = [json.loads(l) for l in open(sys.argv[1])]
created = [r["created"] for r in reqs if r.get("created")]
deleted = [r["deleted"] for r in reqs if r.get("deleted")]
assert len(created) == 1 and deleted == created, reqs
assert any(r.get("key") == "unknown" for r in reqs), reqs
PY
! grep -rqF "$LEGACY_KEY" "$LEG/with.log" "$LEG/without.log" && ok "the legacy key never appears in staging-smoke's output" || notok "the legacy key was printed"
kill "$STUB_PID" 2>/dev/null
STUB_PID=""

# ---------------------------------------------------------------------------------------------------------------
echo "# staging-smoke and pytest-failure-diff on fixtures (no cluster)"
check "staging-smoke never puts a credential on curl's command line (fake curl)" "$HERE/test-staging-smoke-secrets.sh"
check "pytest-failure-diff on JUnit, plain and run-id fixtures" "$HERE/test-pytest-failure-diff.sh"
check "migration discovery and authService.enabled reading, from a real checkout's root" "$HERE/test-discovery.sh" "$PHASE1_CODE"
check "snapshot.sh output directory refusals and default" "$HERE/test-snapshot-out.sh"
check "preflight reads DEVELOPER_SETTINGS_ENABLED and authService.enabled fail-closed (no cluster)" "$HERE/test-preflight-env-flags.sh"
check "scoped schema round trip checks every step and removes its container on every path (fake docker)" "$HERE/test-schema-roundtrip.sh"
check "env file reader: booleans, quoted strings, missing paths, invalid YAML, comments, single quotes, flags, images" "$PY" "$HERE/test_env_reader.py" "$REL/release_lib.py" "$PHASE1_CODE/envs/prod/helmrelease.yaml"

# ---------------------------------------------------------------------------------------------------------------
echo "# concurrent migrate"
# Every web pod runs `manage.py migrate && gunicorn` at start, with no lock between pods. Two migrate processes started
# at once on a copy of the database at master's schema (with rows): Django takes no lock, so two clean exits are not
# expected. What must hold: at least one succeeds, a loser fails loudly ("already exists" class) and leaves no partial
# state, a third migrate then exits 0 (self-heals), each powered_by migration is recorded once, and the leaf is 0010.
SCRATCH=release_scratch
psql_pod -c "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null
psql_pod -c "CREATE DATABASE $SCRATCH" >/dev/null
k -n default exec -i postgres-18-0 -c postgres-18 -- pg_restore -U postgres -d "$SCRATCH" <"$SNAP/db/sefaria_auth.dump" >"$LOGS/scratch-restore.log" 2>&1 || true
psql_scratch() { k -n default exec -i postgres-18-0 -c postgres-18 -- psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d "$SCRATCH" "$@"; }
django_scratch() {
  local code="$1"
  shift
  (cd "$code" && RELEASE_PG_HOST=127.0.0.1 RELEASE_PG_PORT="$PF_PORT" RELEASE_PG_DB="$SCRATCH" RELEASE_PG_USER=postgres RELEASE_PG_PASSWORD=postgres PYTHONPATH="$code:$REL/django" DJANGO_SETTINGS_MODULE=release_settings "$PY" "$@")
}
[[ "$(psql_scratch -c "SELECT count(*) FROM powered_by_project")" -ge 1 && "$(psql_scratch -c "SELECT name FROM django_migrations WHERE app = 'powered_by' ORDER BY id DESC LIMIT 1")" == 0003_request_not_to_publish ]] \
  && ok "scratch database $SCRATCH: master's schema with rows (leaf 0003_request_not_to_publish)" || notok "scratch database (log: $LOGS/scratch-restore.log)"
django_scratch "$PHASE1_CODE" manage.py migrate --noinput >"$LOGS/concurrent-1.log" 2>&1 &
CM1=$!
django_scratch "$PHASE1_CODE" manage.py migrate --noinput >"$LOGS/concurrent-2.log" 2>&1 &
CM2=$!
cm1=0 cm2=0
wait "$CM1" || cm1=$?
wait "$CM2" || cm2=$?
echo "# two concurrent migrates exited $cm1 and $cm2"
[[ "$cm1" == 0 || "$cm2" == 0 ]] && ok "concurrent migrate: at least one of the two exits 0" || notok "concurrent migrate: both failed ($cm1, $cm2; logs $LOGS/concurrent-*.log)"
for pair in "1 $cm1" "2 $cm2"; do
  set -- $pair
  if [[ "$2" != 0 ]]; then
    grep -qiE "already exists|DuplicateTable|DuplicateColumn|DuplicateObject|duplicate" "$LOGS/concurrent-$1.log" \
      && ok "concurrent migrate: the loser (process $1) failed with an 'already exists' class error" || { notok "concurrent migrate: process $1 failed with another error"; tail -n 8 "$LOGS/concurrent-$1.log" | sed 's/^/    /'; }
  fi
done
check "concurrent migrate: a third migrate exits 0 (the database self-heals)" django_scratch "$PHASE1_CODE" manage.py migrate --noinput
check "concurrent migrate: migrate --check then reports nothing pending" django_scratch "$PHASE1_CODE" manage.py migrate --check
[[ "$(psql_scratch -c "SELECT count(*) - count(DISTINCT name) FROM django_migrations WHERE app = 'powered_by'")" == 0 ]] \
  && ok "concurrent migrate: django_migrations holds each powered_by migration exactly once" || notok "a powered_by migration is recorded twice: $(psql_scratch -c "SELECT name, count(*) FROM django_migrations WHERE app = 'powered_by' GROUP BY name HAVING count(*) > 1" | tr '\n' ' ')"
[[ "$(psql_scratch -c "SELECT name FROM django_migrations WHERE app = 'powered_by' ORDER BY name DESC LIMIT 1")" == 0010_seed_mcp_tier ]] \
  && ok "concurrent migrate: the leaf is 0010_seed_mcp_tier" || notok "the powered_by leaf is not 0010"
# PGOPTIONS reaches Django's connection: the real project's Django 6 (psycopg2, libpq) with a DATABASES that has no OPTIONS,
# the same shape as the chart's local settings. Without it the session has no lock timeout.
SHOW_LT='import django; django.setup(); from django.db import connection as c; cur = c.cursor(); cur.execute("SHOW lock_timeout"); print(cur.fetchone()[0])'
[[ "$(PGOPTIONS='-c lock_timeout=5s' django_scratch "$PHASE1_CODE" -c "$SHOW_LT" 2>/dev/null | tail -n 1)" == 5s && "$(django_scratch "$PHASE1_CODE" -c "$SHOW_LT" 2>/dev/null | tail -n 1)" == 0 ]] \
  && ok "PGOPTIONS='-c lock_timeout=5s' makes SHOW lock_timeout print 5s on the project's Django connection (and 0 without it)" || notok "PGOPTIONS did not reach the project's Django connection"
psql_pod -c "DROP DATABASE $SCRATCH" >/dev/null

# ---------------------------------------------------------------------------------------------------------------
echo "# premigrate and preflight --stage promote"
# The fixture app's migrations are in the fixture repository's master too (preflight reads the migrations of its code ref).
git -C "$FIX" checkout -q master
mkdir -p "$FIX/fixtureapp/migrations"
cp "$HERE"/fixtures/migrate-app/fixtureapp/migrations/*.py "$FIX/fixtureapp/migrations/"
git -C "$FIX" add -A && git -C "$FIX" commit -qm "fixture: the fixture app's migrations" && git -C "$FIX" push -q origin master
psql_pod -c "CREATE TABLE fx_item (id serial PRIMARY KEY)" >/dev/null
# The HelmReleases are running again, as before the promotion (the restore tests suspended them); the reader grant is back.
k -n preprod patch hr preprod --type merge -p '{"spec":{"suspend":false}}' >/dev/null
k -n default patch hr production --type merge -p '{"spec":{"suspend":false}}' >/dev/null
mark_healthy preprod preprod
mark_healthy default production
psql_pod -c "GRANT SELECT (id, key, project_id, label, allowed_origins, revoked_at) ON powered_by_apikey TO auth_service_reader" >/dev/null
PM() { "$REL/premigrate.sh" --env preprod --context "$CTX" --image-tag "$FIXTURE_TAG" --backoff 1 "$@"; }
fx_applied() { psql_pod -At -c "SELECT coalesce(string_agg(name, ',' ORDER BY name), '') FROM django_migrations WHERE app = 'fixtureapp'"; }
no_pm_pods() { [[ -z "$(k get pods -A -l release.sefaria.org/purpose -o name)" ]]; }

# An idle-in-transaction session, left open for over 60 s while the quick cases below run.
(printf "SET application_name = 'release-test-idle';\nBEGIN;\nSELECT 1;\n"; sleep 150) | psql_pod >/dev/null 2>&1 &
IDLE_PID=$!
IDLE_T0="$(date +%s)"
refuses "premigrate refuses a directory with no manifest.json" "has no manifest.json" PM --snapshot "$WORK/no-such-snapshot"
mkdir -p "$WORK/empty-snapshot"
refuses "premigrate refuses an empty snapshot directory" "has no manifest.json" PM --snapshot "$WORK/empty-snapshot"
mkdir -p "$WORK/old-snapshot"
"$PY" - "$SNAP/manifest.json" "$WORK/old-snapshot/manifest.json" <<'PY'
import datetime as d, json, sys
m = json.load(open(sys.argv[1]))
m["created_at"] = (d.datetime.now(d.timezone.utc) - d.timedelta(hours=3)).strftime("%Y%m%dT%H%M%SZ")
json.dump(m, open(sys.argv[2], "w"))
PY
refuses "premigrate refuses a snapshot older than 2 hours" "older than 2 hours" PM --snapshot "$WORK/old-snapshot"
exits 0 "premigrate --allow-old-snapshot overrides the age only (a dry run proceeds past it)" "DRY RUN" PM --snapshot "$WORK/old-snapshot" --allow-old-snapshot
exits 0 "premigrate dry run with a fresh snapshot creates nothing" "DRY RUN \(nothing created\)" PM --snapshot "$SNAP"
no_pm_pods && [[ "$(fx_applied)" == "" ]] && ok "the dry run created no pod and applied no migration" || notok "the dry run changed something"
refuses "premigrate refuses the wrong context" "not the cluster of preprod" "$REL/premigrate.sh" --env preprod --context kind-some-other-cluster --snapshot "$SNAP" --image-tag "$FIXTURE_TAG"
refuses "premigrate refuses --execute with a wrong confirmation" "confirmation did not match" bash -c "echo prod | '$REL/premigrate.sh' --env preprod --context '$CTX' --snapshot '$SNAP' --image-tag '$FIXTURE_TAG' --execute"

# The pod spec is a copy of the live Rollout's pod template.
k -n preprod get rollouts.argoproj.io preprod-web -o json >"$WORK/preprod-web.json"
printf 'echo hi\n' >"$WORK/script.sh"
"$PY" "$REL/release_lib.py" oneoff-pod --image-tag "$FIXTURE_TAG" --script-file "$WORK/script.sh" --name premigrate-x --namespace preprod --label premigrate-preprod --purpose premigrate --deadline 60 <"$WORK/preprod-web.json" >"$WORK/pod.json"
"$PY" - "$WORK/preprod-web.json" "$WORK/pod.json" "$IMG:$FIXTURE_TAG" <<'PY' && ok "the one-off pod copies the Rollout's volumes, env, envFrom, Secret reference, serviceAccount and imagePullSecrets, with the image tag replaced, and leaves out probes, ports, fleet labels and anti-affinity" || notok "one-off pod spec (see $WORK/pod.json)"
import json, sys
ro = json.load(open(sys.argv[1]))["spec"]["template"]["spec"]
pod = json.load(open(sys.argv[2]))
spec = pod["spec"]
web = ro["containers"][0]
c = spec["containers"][0]
assert len(spec["containers"]) == 1 and c["name"] == "web"
assert c["image"] == sys.argv[3], c["image"]
assert c["env"] == web["env"] and c["envFrom"] == web["envFrom"] and c["volumeMounts"] == web["volumeMounts"]
assert any(e.get("valueFrom", {}).get("secretKeyRef") for e in c["env"])
assert spec["volumes"] == ro["volumes"] and spec["serviceAccountName"] == ro["serviceAccountName"] and spec["imagePullSecrets"] == ro["imagePullSecrets"]
for gone in ("startupProbe", "livenessProbe", "readinessProbe", "ports", "lifecycle"):
    assert gone not in c, gone
assert "affinity" not in spec and spec["restartPolicy"] == "Never"
assert pod["metadata"]["labels"]["app"] == "premigrate-preprod" and "tier" not in pod["metadata"]["labels"] and not pod["metadata"].get("annotations")
assert c["command"] == ["/bin/bash", "-c"] and c["args"] == ["echo hi\n"]
PY

# Wait out the 60 s of the idle session, then refuse on it.
while (($(date +%s) - IDLE_T0 < 63)); do sleep 1; done
refuses "premigrate refuses while a session has been idle in transaction for over 60 s (and prints it)" "idle in transaction.*release-test-idle|app release-test-idle" PM --snapshot "$SNAP"
grep -q "idle in transaction for over 60s" "$LOGS/$N.log" && ok "the refusal names the 60 s limit" || notok "refusal text"
no_pm_pods && ok "the refused run created no pod" || notok "the refused run left a pod"
psql_pod -At -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'release-test-idle'" >/dev/null
wait "$IDLE_PID" 2>/dev/null

# migrate exits 0 but a migration is left pending: the final migrate --check must stop it before 'premigrate: ok'.
helm upgrade preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --reuse-values --set fixturePartial=1 >/dev/null
echo preprod | PM --snapshot "$SNAP" --execute >"$LOGS/pm-partial.log" 2>&1
rc=$?
[[ "$rc" == 1 ]] && grep -q "premigrate: FAILED" "$LOGS/pm-partial.log" && grep -q "migrate --check exited 1 after a successful migrate" "$LOGS/pm-partial.log" && ! grep -qx "premigrate: ok" "$LOGS/pm-partial.log" \
  && ok "premigrate: migrate exited 0 with a migration pending -> FAILED, exit 1 and no 'premigrate: ok'" || { notok "partial migrate (exit $rc, log $LOGS/pm-partial.log)"; tail -n 20 "$LOGS/pm-partial.log" | sed 's/^/    /'; }
grep -q "database state: each Django migration is atomic" "$LOGS/pm-partial.log" && grep -q "latest applied migrations" "$LOGS/pm-partial.log" \
  && ok "the failure says what state the database is in (atomic migrations, the latest applied ones)" || notok "no database state in the failure message"
[[ "$(fx_applied)" == 0001_alter_fx_item ]] && no_pm_pods && ok "the database has the first fixture migration only, and no pod is left" || notok "state after the partial run: $(fx_applied)"
PMDIR="$(ls -dt "$SNAP"/premigrate-* | head -1)"
grep -q "lock_timeout=5s" "$PMDIR/attempt-1.log" \
  && ok "SHOW lock_timeout in the pod's Django connection printed 5s (PGOPTIONS reaches psycopg2/libpq in the copied pod)" || notok "no lock_timeout=5s in $PMDIR/attempt-1.log"
# preflight --stage promote with that migration pending.
refuses "preflight --stage promote fails with a pending migration (migrate --check exits 1)" "FAIL +migrate --check exits 1 for web image tag $FIXTURE_TAG" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra" --stage promote --image-tag "$FIXTURE_TAG"
grep -q "FAIL  pending at origin/master: fixtureapp/0002_alter_fx_item_again" "$LOGS/$N.log" && ok "and the code ref's pending migration is named (a promotion must not start with migrations pending)" || notok "pending migration not named"
refuses "preflight --stage promote needs --image-tag" "needs --image-tag" "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --stage promote
no_pm_pods && ok "the preflight pod is deleted" || notok "a pod is left"

# A held lock on a table the migration alters: an attempt fails within about 5 s, and the run retries.
helm upgrade preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --reuse-values --set fixturePartial= >/dev/null
psql_pod -c "SET application_name = 'release-test-hold'; BEGIN; LOCK TABLE fx_item IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(25); COMMIT;" </dev/null >/dev/null 2>&1 &
HOLD_PID=$!
for _ in $(seq 1 30); do
  [[ "$(psql_pod -At -c "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'fx_item' AND l.mode = 'AccessExclusiveLock' AND l.granted")" == 1 ]] && break
  sleep 1
done
echo preprod | PM --snapshot "$SNAP" --execute >"$LOGS/pm-lock.log" 2>&1
rc=$?
wait "$HOLD_PID" 2>/dev/null
PMDIR="$(ls -dt "$SNAP"/premigrate-* | head -1)"
[[ "$rc" == 0 ]] && grep -qx "premigrate: ok" "$LOGS/pm-lock.log" && ok "premigrate with a lock held for 25 s: retried and ended with 'premigrate: ok'" || { notok "held-lock run (exit $rc, log $LOGS/pm-lock.log)"; tail -n 25 "$LOGS/pm-lock.log" | sed 's/^/    /'; }
grep -qiE "lock timeout|lock_timeout" "$PMDIR/attempt-1.log" && grep -qE "migrate: exit 1 after (4|5|6|7|8|9|10)s" "$PMDIR/attempt-1.log" \
  && ok "attempt 1 failed on the lock timeout within about 5 s: $(grep -E 'migrate: exit' "$PMDIR/attempt-1.log")" || { notok "attempt 1 (log $PMDIR/attempt-1.log)"; tail -n 8 "$PMDIR/attempt-1.log" | sed 's/^/    /'; }
grep -q "retrying in" "$LOGS/pm-lock.log" && [[ "$(ls "$PMDIR"/attempt-*.log | wc -l)" -ge 2 ]] && ok "a failed attempt was retried ($(ls "$PMDIR"/attempt-*.log | wc -l) attempts, one pod each, all deleted)" || notok "no retry"
grep -q "lock_timeout=5s" "$PMDIR/attempt-1.log" && ok "SHOW lock_timeout in the pod's Django connection prints 5s (attempt 1)" || notok "lock_timeout=5s missing from the pod log"
[[ "$(fx_applied)" == "0001_alter_fx_item,0002_alter_fx_item_again" ]] && no_pm_pods && ok "both fixture migrations are applied and no pod is left" || notok "state: $(fx_applied)"
# A lock held for the whole run: after its attempts the run fails, says so, and stops (no 'premigrate: ok').
psql_pod -c "DELETE FROM django_migrations WHERE app = 'fixtureapp' AND name LIKE '0002%'; ALTER TABLE fx_item DROP COLUMN note2" >/dev/null
psql_pod -c "SET application_name = 'release-test-hold'; BEGIN; LOCK TABLE fx_item IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(60); COMMIT;" </dev/null >/dev/null 2>&1 &
HOLD_PID=$!
for _ in $(seq 1 30); do
  [[ "$(psql_pod -At -c "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'fx_item' AND l.mode = 'AccessExclusiveLock' AND l.granted")" == 1 ]] && break
  sleep 1
done
echo preprod | PM --snapshot "$SNAP" --execute --attempts 2 >"$LOGS/pm-fail.log" 2>&1
rc=$?
psql_pod -At -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'release-test-hold'" >/dev/null
wait "$HOLD_PID" 2>/dev/null
[[ "$rc" == 1 ]] && grep -q "premigrate: FAILED: migrate did not succeed in 2 attempts" "$LOGS/pm-fail.log" && ! grep -qx "premigrate: ok" "$LOGS/pm-fail.log" && grep -q "do not promote" "$LOGS/pm-fail.log" \
  && ok "premigrate after its attempts: FAILED, exit 1, 'do not promote', no 'premigrate: ok'" || { notok "failing run (exit $rc, log $LOGS/pm-fail.log)"; tail -n 15 "$LOGS/pm-fail.log" | sed 's/^/    /'; }
[[ "$(fx_applied)" == 0001_alter_fx_item ]] && no_pm_pods && ok "the failed run left the database as it was (0002 not applied) and no pod" || notok "state after the failed run: $(fx_applied)"
# Now it works again, and a second run is a no-op.
check "premigrate succeeds once the lock is gone" bash -c "echo preprod | '$REL/premigrate.sh' --env preprod --context '$CTX' --image-tag '$FIXTURE_TAG' --backoff 1 --snapshot '$SNAP' --execute | grep -x 'premigrate: ok'"
[[ "$(fx_applied)" == "0001_alter_fx_item,0002_alter_fx_item_again" ]] && ok "the fixture migrations are applied" || notok "state: $(fx_applied)"
check "preflight --stage promote passes with nothing pending" "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra" --stage promote --image-tag "$FIXTURE_TAG"
grep -qE "^PASS +migrate --check exits 0 for web image tag $FIXTURE_TAG on sefaria_auth" "$LOGS/$N.log" && ok "preflight --stage promote reports migrate --check exit 0" || notok "promote check line missing"
# The Rollout now runs the migrating image: the same tag with nothing pending is a no-op.
helm upgrade preprod "$HERE/fixtures/standin-chart" -n preprod --kube-context "$CTX" --reuse-values --set "rolloutImage=$IMG:$FIXTURE_TAG" >/dev/null
echo preprod | PM --snapshot "$SNAP" --execute >"$LOGS/pm-noop.log" 2>&1
rc=$?
PMDIR="$(ls -dt "$SNAP"/premigrate-* | head -1)"
[[ "$rc" == 0 ]] && grep -q "premigrate: no-op" "$LOGS/pm-noop.log" && grep -qx "premigrate: ok" "$LOGS/pm-noop.log" && ! ls "$PMDIR"/attempt-*.log >/dev/null 2>&1 \
  && ok "premigrate with the running tag and nothing pending is a no-op (exit 0, no migrate attempt)" || { notok "no-op run (exit $rc, log $LOGS/pm-noop.log)"; tail -n 12 "$LOGS/pm-noop.log" | sed 's/^/    /'; }
no_pm_pods && ok "no one-off pod is left anywhere" || notok "a one-off pod is left"

echo
echo "1..$N"
if [[ "$FAILED" -gt 0 ]]; then
  echo "# $FAILED of $N failed"
  exit 1
fi
echo "# all $N passed"
