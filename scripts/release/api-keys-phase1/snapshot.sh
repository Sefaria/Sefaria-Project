#!/usr/bin/env bash
# snapshot.sh: record what an environment runs and what its database holds, before the phase 1 promotion.
#
#   snapshot.sh --env preprod|prod|staging --context <kube context> [--out DIR] [--upload gs://bucket/prefix]
#               [--repo DIR] [--no-fetch] [--pg-pod P --pg-namespace N --pg-container C --pg-user U] [--execute]
#
# Read-only. Without --execute it prints what it would run and touches nothing. With --execute it writes
# DIR/<env>-<UTC time>/ with manifest.json, the env files, the HelmRelease objects, helm history, each Rollout's images and
# revision, which expected Secrets exist (names only), django_migrations, per-table row counts, current_database() from a
# web pod of each env that shares the database, a full pg_dump --format=c of the database and a dump of the tables a
# scoped restore puts back, each with a sha256 and a pg_restore check. Preprod and prod share sefaria_auth, so a
# snapshot of either records both. --upload copies the directory with gcloud storage cp (no Slack, unlike the backup
# CronJob, which this does not trigger).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" OUT="${PWD}/api-keys-phase1-snapshots" UPLOAD="" REPO="" FETCH=1 EXECUTE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --upload) UPLOAD="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --no-fetch) FETCH=0; shift ;;
    --pg-pod) PG_POD="$2"; shift 2 ;;
    --pg-namespace) PG_NS="$2"; shift 2 ;;
    --pg-container) PG_CONTAINER="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done

need kubectl helm git "$PYTHON"
check_context "$ENV" "$CTX"
[[ -z "$UPLOAD" || "$UPLOAD" == gs://* ]] || die "--upload takes a gs:// URL"
REPO="${REPO:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
DB="$(env_db "$ENV")"
SHARING="$(env_sharing "$ENV")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAP="${OUT%/}/${ENV}-${STAMP}"
TAB="$(printf '\t')"

if [[ "$EXECUTE" != 1 ]]; then
  cat >&2 <<PLAN
DRY RUN (read-only even with --execute). Would write ${SNAP}/ by running, on context ${CTX}:
  git -C ${REPO} fetch --tags origin $(for e in $SHARING; do printf '%s ' "$(env_branch "$e")"; done)
PLAN
  for e in $SHARING; do
    ns="$(env_namespace "$e")"
    cat >&2 <<PLAN
  [$e] kubectl get helmrelease $(env_hr "$e") -n $ns; kubectl get gitrepository $(env_gitrepo "$e" | tr / ' ')
  [$e] git show <release tag>:envs/$e/helmrelease.yaml; git show origin/$(env_branch "$e"):envs/$e/helmrelease.yaml
  [$e] helm history <release> -n $ns; kubectl get rollouts,pods -n $ns; kubectl get secret <expected names> -n $ns (names only)
  [$e] kubectl exec <web-$(env_hr "$e") pod> -c web -- SELECT current_database()
PLAN
  done
  cat >&2 <<PLAN
  [db] kubectl exec -n ${PG_NS} ${PG_POD} -c ${PG_CONTAINER} -- psql (read-only session) -d ${DB}:
       django_migrations, per-table row counts, scoped table list, checksums and schema, reader role, apikeys_notify()
  [db] kubectl exec ... -- pg_dump --format=c -t <scoped tables> ${DB}  > db/scoped.dump
  [db] kubectl exec ... -- pg_dump --format=c ${DB}                    > db/${DB}.dump
  [db] sha256 and pg_restore --list / full read of each dump; the scoped checksums again (must not have changed)
$( [[ -n "$UPLOAD" ]] && echo "  gcloud storage cp --recursive ${SNAP} ${UPLOAD%/}/" )
Re-run with --execute to take the snapshot.
PLAN
  exit 0
fi

mkdir -p "$SNAP/k8s" "$SNAP/envfiles" "$SNAP/db"
step "snapshot of $ENV (database $DB, shared by: $SHARING) into $SNAP"
kc get namespace "$(env_namespace "$ENV")" -o name >/dev/null || die "namespace $(env_namespace "$ENV") not found on $CTX"
kc -n "$PG_NS" get pod "$PG_POD" -o name >/dev/null || die "Postgres pod $PG_NS/$PG_POD not found on $CTX"

if [[ "$FETCH" == 1 ]]; then
  branches=()
  for e in $SHARING; do branches+=("$(env_branch "$e")"); done
  git -C "$REPO" fetch -q --tags origin "${branches[@]}" || log "WARNING: git fetch failed; using local refs"
fi

branch_shas="{}"
for e in $SHARING; do
  ns="$(env_namespace "$e")"
  hr="$(env_hr "$e")"
  dir="$SNAP/k8s/$e"
  mkdir -p "$dir"
  step "$e: HelmRelease, release tag, env files"
  kc -n "$ns" get helmreleases.helm.toolkit.fluxcd.io "$hr" -o json >"$dir/helmrelease.json" \
    || { log "WARNING: HelmRelease $ns/$hr not found"; : >"$dir/helmrelease.json"; }
  gr="$(env_gitrepo "$e")"
  kc -n "${gr%/*}" get gitrepositories.source.toolkit.fluxcd.io "${gr#*/}" -o json >"$dir/gitrepository.json" \
    || { log "WARNING: GitRepository $gr not found"; : >"$dir/gitrepository.json"; }
  tag=""
  if [[ -s "$dir/gitrepository.json" ]]; then
    tag="$("$PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("spec",{}).get("ref",{}).get("tag",""))' "$dir/gitrepository.json")"
  fi
  if [[ -n "$tag" ]] && git -C "$REPO" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    git -C "$REPO" show "refs/tags/$tag:envs/$e/helmrelease.yaml" >"$SNAP/envfiles/$e.deployed.helmrelease.yaml"
    log "  deployed release tag $tag"
  else
    log "WARNING: release tag '${tag}' is not in $REPO; the deployed env file is not recorded (git fetch --tags)"
  fi
  branch="$(env_branch "$e")"
  if git -C "$REPO" rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null; then
    git -C "$REPO" show "origin/$branch:envs/$e/helmrelease.yaml" >"$SNAP/envfiles/$e.branch.helmrelease.yaml"
    sha="$(git -C "$REPO" rev-parse "origin/$branch")"
    branch_shas="$("$PYTHON" -c 'import json,sys; d=json.loads(sys.argv[1]); d[sys.argv[2]]=sys.argv[3]; print(json.dumps(d))' "$branch_shas" "$branch" "$sha")"
  fi

  step "$e: helm history, Rollouts, pods, Secrets (names only)"
  release="$hr"
  if [[ -s "$dir/helmrelease.json" ]]; then
    release="$("$PYTHON" -c '
import json, sys
hr = json.load(open(sys.argv[1]))
spec = hr.get("spec", {})
name = hr["metadata"]["name"]
target = spec.get("targetNamespace")
print(spec.get("releaseName") or (f"{target}-{name}" if target else name))' "$dir/helmrelease.json")"
  fi
  echo "$release" >"$dir/helm-release.txt"
  helm history "$release" -n "$ns" --kube-context "$CTX" --max 20 -o json >"$dir/helm-history.json" \
    || { log "WARNING: no helm history for release $release in $ns"; : >"$dir/helm-history.json"; }
  kc -n "$ns" get rollouts.argoproj.io -o json | "$PYTHON" "$RELEASE_PY" rollout-images >"$dir/rollouts.tsv"
  kc -n "$ns" get pods -o json | "$PYTHON" "$RELEASE_PY" pod-images >"$dir/pods.tsv"
  web_pods "$ns" "$hr" >"$dir/web-pods.tsv"
  if [[ -s "$dir/helmrelease.json" ]]; then
    "$PYTHON" "$RELEASE_PY" secret-refs <"$dir/helmrelease.json" >"$dir/secrets-expected.txt"
  else
    echo auth-service-registry >"$dir/secrets-expected.txt"
  fi
  # Default table output is printed server side, so no Secret data reaches this machine.
  # shellcheck disable=SC2046
  kc -n "$ns" get secret $(cat "$dir/secrets-expected.txt") --ignore-not-found --no-headers 2>/dev/null \
    | awk '{print $1}' >"$dir/secrets-present.txt" || true
  pod="$(awk -F'\t' '$2 == "Running" {print $1; exit}' "$dir/web-pods.tsv")"
  if [[ -n "$pod" ]]; then
    web_current_database "$ns" "$pod" >"$dir/current-database.txt" || log "WARNING: current_database() failed on $ns/$pod"
    log "  current_database() on $ns/$pod: $(cat "$dir/current-database.txt" 2>/dev/null)"
  else
    log "WARNING: no Running web pod (app=web-$hr) in $ns"
  fi
done

step "database $DB on $PG_NS/$PG_POD"
scoped_tables_sql | pg_ro "$DB" -At >"$SNAP/db/scoped-tables.txt"
mapfile -t SCOPED <"$SNAP/db/scoped-tables.txt"
log "  scoped tables: ${SCOPED[*]:-(none)}"
checksums_sql "${SCOPED[@]}" | pg_ro "$DB" -At -F "$TAB" >"$SNAP/db/scoped-checksums.tsv"
scoped_schema "$DB" "${SCOPED[@]}" >"$SNAP/db/scoped-schema.sql"
if grep -qx powered_by_project "$SNAP/db/scoped-tables.txt"; then
  pg_ro "$DB" -At -F "$TAB" -c 'SELECT id, md5(p::text) FROM public.powered_by_project p ORDER BY id' >"$SNAP/db/powered_by_project-rows.tsv"
fi
pg_ro "$DB" -At -F "$TAB" -c 'SELECT id, app, name, applied::text FROM public.django_migrations ORDER BY id' >"$SNAP/db/django_migrations.tsv"
pg_ro "$DB" -At -F "$TAB" -c "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1" >"$SNAP/db/row_counts.tsv"
pg_ro "$DB" -At -c "SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = '$READER_ROLE')" >"$SNAP/db/reader-role.txt"
fn="$(pg_ro "$DB" -At -c "SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'apikeys_notify'")"
if [[ -n "$fn" ]]; then printf '%s;\n' "$fn" >"$SNAP/db/apikeys_notify.sql"; fi

step "dumps"
scoped_args=()
for t in "${SCOPED[@]}"; do scoped_args+=(-t "public.\"$t\""); done
if [[ ${#scoped_args[@]} -gt 0 ]]; then
  pg_dump_pod "$DB" --format=c "${scoped_args[@]}" >"$SNAP/db/scoped.dump"
fi
pg_dump_pod "$DB" --format=c >"$SNAP/db/$DB.dump"
for f in "$SNAP"/db/*.dump; do
  sha256_of "$f" >"$f.sha256"
  pg_restore_local "$f" --list >"$f.list"
  sha256_of "$f.list" >"$f.list.sha256"
  # --list reads only the table of contents; a full read catches a truncated stream.
  pg_restore_local "$f" --file=/dev/null || die "pg_restore could not read $f in full"
  log "  $(basename "$f"): $(wc -c <"$f" | tr -d ' ') bytes, sha256 $(cut -c1-16 <"$f.sha256")..., $(grep -c 'TABLE DATA' "$f.list") tables with data"
done
grep -q "TABLE DATA public django_migrations" "$SNAP/db/$DB.dump.list" || die "the full dump has no django_migrations data"
for t in "${SCOPED[@]}"; do
  grep -q "TABLE DATA public $t " "$SNAP/db/scoped.dump.list" || die "the scoped dump has no data entry for $t"
done

checksums_sql "${SCOPED[@]}" | pg_ro "$DB" -At -F "$TAB" >"$SNAP/db/scoped-checksums.after.tsv"
if ! cmp -s "$SNAP/db/scoped-checksums.tsv" "$SNAP/db/scoped-checksums.after.tsv"; then
  diff "$SNAP/db/scoped-checksums.tsv" "$SNAP/db/scoped-checksums.after.tsv" >&2 || true
  die "the scoped tables changed while the snapshot ran; run it again"
fi
rm -f "$SNAP/db/scoped-checksums.after.tsv"

"$PYTHON" - "$SNAP/meta.json" <<PY
import json, sys
json.dump({
    "env": "$ENV",
    "context": "$CTX",
    "database": "$DB",
    "sharing_envs": "$SHARING".split(),
    "created_at": "$STAMP",
    "postgres": {"namespace": "$PG_NS", "pod": "$PG_POD", "container": "$PG_CONTAINER"},
    "repo_head": "$(git -C "$REPO" rev-parse HEAD)",
    "branch_heads": json.loads('$branch_shas'),
}, open(sys.argv[1], "w"), indent=2)
PY
"$PYTHON" "$RELEASE_PY" build-manifest --dir "$SNAP"

if [[ -n "$UPLOAD" ]]; then
  need gcloud
  step "upload to $UPLOAD"
  gcloud storage cp --recursive "$SNAP" "${UPLOAD%/}/"
fi

step "done"
for e in $SHARING; do
  log "  $e: release tag $("$PYTHON" "$RELEASE_PY" manifest-get "$SNAP/manifest.json" "envs.$e.release_tag" || echo '?')," \
    "helm revision $("$PYTHON" "$RELEASE_PY" manifest-get "$SNAP/manifest.json" "envs.$e.helm_revision" || echo '?')," \
    "current_database $(cat "$SNAP/k8s/$e/current-database.txt" 2>/dev/null || echo '?')"
done
log "  powered_by migrations: $(awk -F'\t' '$2 == "powered_by" {print $3}' "$SNAP/db/django_migrations.tsv" | tr '\n' ' ')"
echo "$SNAP"
