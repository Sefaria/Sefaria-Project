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
# a stub server. Negative tests: wrong context, dry runs change nothing, db --full refuses, preflight fails without the
# reader grant on powered_by_apikey. Uses ports 56441 (port-forward) and 56445 (rehearsal); the stub server takes an
# ephemeral port.
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
    -h | --help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
MASTER_TAG_PREPROD="v7.11.4-preprod.1" MASTER_TAG_PROD="v7.11.4-prod.1" PHASE1_TAG_PREPROD="v7.12.0-preprod.1"
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
  k -n "$1" patch helmreleases.helm.toolkit.fluxcd.io "$2" --subresource=status --type merge \
    -p '{"status":{"conditions":[{"type":"Ready","status":"True","reason":"Test","message":"stand-in","lastTransitionTime":"2026-11-09T00:00:00Z"}]}}' >/dev/null
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
kind load docker-image --name "$CLUSTER" kind.local/postgres:18 "$IMG:$MASTER_TAG_PREPROD" "$IMG:$MASTER_TAG_PROD" "$IMG:$PHASE1_TAG_PREPROD" >"$LOGS/kind-load.log" 2>&1 \
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
(cd "$PHASE1_CODE" && git ls-files '*/migrations/*.py' helm-chart/sefaria) | while read -r f; do mkdir -p "$FIX/$(dirname "$f")"; cp "$PHASE1_CODE/$f" "$FIX/$f"; done
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
check "listing-count before the merge" "$REL/listing-count.sh" --env preprod --context "$CTX" --repo "$MASTER_CODE" --record "$WORK/listing.json"
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

echo "# preflight"
mkdir -p "$WORK/infra/prod/cluster-1/spec/preprod"
printf 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: preprod\n' >"$WORK/infra/prod/cluster-1/spec/preprod/namespace.yaml"
refuses "preflight fails without the reader grant on powered_by_apikey" "lacks SELECT on powered_by_apikey" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
psql_pod -c "GRANT SELECT (id, key, project_id, label, allowed_origins, revoked_at) ON powered_by_apikey TO auth_service_reader" >/dev/null
check "preflight preprod passes once the grant exists" "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check --infra-repo "$WORK/infra"
PREPROD_PASS_N="$N"
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
refuses "preflight fails when the registry Secret is missing" "auth-service-registry is missing" \
  "$REL/preflight.sh" --env preprod --context "$CTX" --repo "$FIX" --no-fetch --skip-image-check
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

# ---------------------------------------------------------------------------------------------------------------
echo "# restore db"
before="$(db_state)"
check "restore db --scoped dry run" "$REL/restore.sh" db --snapshot "$SNAP" --env preprod --context "$CTX" --scoped
grep -q "DRY RUN" "$LOGS/$N.log" && [[ "$(db_state)" == "$before" ]] && ok "the db dry run changed nothing" || notok "the db dry run changed the database"
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
"$PY" - "$WORK/rehearsal/report.json" <<'PY' && ok "the rehearsal timed 0003_developer_settings through 0011_api_key_allowed_domains" || notok "rehearsal report"
import json, sys
r = json.load(open(sys.argv[1]))
names = [m["name"] for m in r["migrations"] if m["app"] == "powered_by"]
assert names[0] == "0003_developer_settings" and names[-1] == "0011_api_key_allowed_domains", names
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

echo
echo "1..$N"
if [[ "$FAILED" -gt 0 ]]; then
  echo "# $FAILED of $N failed"
  exit 1
fi
echo "# all $N passed"
