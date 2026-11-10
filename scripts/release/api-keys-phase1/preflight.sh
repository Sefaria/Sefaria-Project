#!/usr/bin/env bash
# preflight.sh: read-only checks before the preprod promotion (which migrates prod's database) and before the prod one.
#
#   preflight.sh --env preprod|prod --context C [--code-ref REF] [--repo DIR] [--infra-repo DIR] [--no-fetch]
#                [--skip-image-check] [--allow-pending app/name,...] [--chart-ref REF]
#                [--stage promote --image-tag TAG]
#
# Checks (from the release plan's Preprod and Prod lists), each printed as PASS, FAIL, WARN or SKIP:
#   - current_database() on a preprod web pod and on a prod web pod is sefaria_auth (they share it)
#   - role auth_service_reader exists, may CONNECT, and has SELECT on every column the auth service loader reads
#     (powered_by_apikey included); tables not created yet are WARN, a missing grant on an existing table is FAIL
#   - Secret auth-service-registry exists in the env's namespace (name only)
#   - pending migrations: the code at --code-ref against django_migrations. preprod: only phase 1 migrations (and those
#     named in --allow-pending) may be pending; prod: nothing may be pending (the preprod promotion migrated the database)
#   - the image tags of the env file on origin/<env branch> exist in Artifact Registry (gcloud; SKIP without it)
#   - every Rollout in the namespace is Healthy and the HelmRelease is Ready
#   - long transactions on the database (a migration would queue behind them)
#   - DEVELOPER_SETTINGS_ENABLED is off in preprod's env file at --code-ref
#   - the Secret's namespace is declared for the prod cluster: with --infra-repo, in prod/cluster-1/spec/namespaces.yaml
#     or another Namespace manifest there; without it, a MANUAL line says what to look for (the file is not in this repo)
#   - prod only: the chart and env file at --chart-ref (default origin/prod, what is deployed; after the promotion that
#     is the new release) rendered with helm template: every CronJob it renders exists in namespace default, and the
#     Datadog labels and annotations it renders on the web pod template are on every Running prod web pod
#     (needs helm and PyYAML; SKIP without them)
# --stage promote (right before the promotion, after premigrate.sh) runs every check above, and in addition requires
# that nothing is pending at all: no migration of --code-ref may be pending (the preprod leniency for phase 1 ends), and
# `python manage.py migrate --check` must exit 0 in a one-off pod copied from the env's live web Rollout with the image
# tag --image-tag (the web image the promotion deploys) on the target database. A promotion that would start with
# migrations pending fails here. The pod is deleted afterwards.
# Exits 1 when any check FAILs. WARN, SKIP and MANUAL lines do not fail the run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" CODE_REF="" REPO="" INFRA="" FETCH=1 IMAGE_CHECK=1 ALLOW_PENDING="" CHART_REF="" STAGE=default IMAGE_TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --code-ref) CODE_REF="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --infra-repo) INFRA="$2"; shift 2 ;;
    --no-fetch) FETCH=0; shift ;;
    --skip-image-check) IMAGE_CHECK=0; shift ;;
    --allow-pending) ALLOW_PENDING="$2"; shift 2 ;;
    --chart-ref) CHART_REF="$2"; shift 2 ;;
    --stage) STAGE="$2"; shift 2 ;;
    --image-tag) IMAGE_TAG="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ "$ENV" == preprod || "$ENV" == prod ]] || die "--env must be preprod or prod"
[[ "$STAGE" == default || "$STAGE" == promote ]] || die "--stage must be default or promote"
if [[ "$STAGE" == promote ]]; then
  [[ -n "$IMAGE_TAG" && "$IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "--stage promote needs --image-tag TAG (the web image tag the promotion deploys)"
elif [[ -n "$IMAGE_TAG" ]]; then
  die "--image-tag is only used with --stage promote"
fi
need kubectl git "$PYTHON"
check_context "$ENV" "$CTX"
REPO="${REPO:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
DB="$(env_db "$ENV")"
NS="$(env_namespace "$ENV")"
TAB="$(printf '\t')"
# preprod takes master; prod takes preprod.
CODE_REF="${CODE_REF:-origin/$([[ "$ENV" == preprod ]] && echo master || echo preprod)}"
if [[ "$FETCH" == 1 ]]; then
  git -C "$REPO" fetch -q origin master preprod prod 2>/dev/null || log "WARNING: git fetch failed; using local refs"
fi

FAILS=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
warn() { printf 'WARN  %s\n' "$*"; }
skip() { printf 'SKIP  %s\n' "$*"; }
manual() { printf 'MANUAL %s\n' "$*"; }
# Prints the STATUS<TAB>message lines of a release_lib.py check through the functions above (in this shell, so FAILS
# counts them).
report() {
  local status msg
  while IFS="$TAB" read -r status msg; do
    case "$status" in
      PASS) pass "$msg" ;;
      FAIL) fail "$msg" ;;
      WARN) warn "$msg" ;;
      SKIP) skip "$msg" ;;
      *) if [[ -n "$status$msg" ]]; then fail "unexpected check output: $status $msg"; fi ;;
    esac
  done
}

echo "preflight for $ENV on $CTX (database $DB, code $CODE_REF)"

# 1. current_database() on a web pod of each env sharing the database.
for e in $(env_sharing "$ENV"); do
  ns="$(env_namespace "$e")"
  pod="$(web_pods "$ns" "$(env_hr "$e")" | awk -F'\t' '$2 == "Running" {print $1; exit}')"
  if [[ -z "$pod" ]]; then
    fail "$e: no Running web pod (app=web-$(env_hr "$e")) in $ns"
    continue
  fi
  got="$(web_current_database "$ns" "$pod" 2>/dev/null || true)"
  if [[ "$got" == "$DB" ]]; then pass "$e: current_database() on $ns/$pod is $got"; else fail "$e: current_database() on $ns/$pod is '${got}', expected $DB"; fi
done

# 2. The reader role and its grants: the columns of auth-service/internal/registry/pgload.go.
LOADER_COLUMNS="powered_by_apikey:id,key,project_id,label,allowed_origins,revoked_at api_project:id,tier_id,deleted_at api_tier:id,per_minute_per_project api_tier_meter_limit:tier_id,meter,monthly_per_project"
role="$(pg_ro "$DB" -At -c "SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = '$READER_ROLE')")"
if [[ "$role" != t ]]; then
  fail "role $READER_ROLE does not exist (infrastructure provisions it with the auth-service-registry Secret)"
else
  pass "role $READER_ROLE exists"
  if [[ "$(pg_ro "$DB" -At -c "SELECT has_database_privilege('$READER_ROLE', current_database(), 'CONNECT')")" == t ]]; then
    pass "$READER_ROLE may CONNECT to $DB"
  else
    fail "$READER_ROLE may not CONNECT to $DB"
  fi
  for spec in $LOADER_COLUMNS; do
    table="${spec%%:*}"
    cols="${spec#*:}"
    exists="$(pg_ro "$DB" -At -c "SELECT to_regclass('public.$table') IS NOT NULL")"
    if [[ "$exists" != t ]]; then
      warn "$table does not exist yet (before the migration); re-run after it, before authService.enabled: true"
      continue
    fi
    missing="$(pg_ro "$DB" -At -c "SELECT string_agg(c, ',') FROM unnest(string_to_array('$cols', ',')) c
      WHERE NOT has_column_privilege('$READER_ROLE', 'public.$table', c, 'SELECT')")"
    if [[ -z "$missing" ]]; then
      pass "$READER_ROLE has SELECT on $table($cols)"
    else
      fail "$READER_ROLE lacks SELECT on $table($missing): GRANT SELECT ($missing) ON $table TO $READER_ROLE;"
    fi
  done
fi

# 3. The registry Secret, by name.
if kc -n "$NS" get secret auth-service-registry --no-headers >/dev/null 2>&1; then
  pass "Secret auth-service-registry exists in namespace $NS"
else
  fail "Secret auth-service-registry is missing in namespace $NS"
fi

# 4. Pending migrations.
tmp="$(mktemp -d)"
trap 'web_pod_cleanup; rm -rf "$tmp"' EXIT
if git -C "$REPO" rev-parse -q --verify "$CODE_REF^{commit}" >/dev/null; then
  git -C "$REPO" ls-tree -r --name-only "$CODE_REF" | grep '/migrations/' | "$PYTHON" "$RELEASE_PY" migrations-from-paths >"$tmp/code.tsv"
  pg_ro "$DB" -At -F "$TAB" -c 'SELECT app, name FROM public.django_migrations' >"$tmp/applied.tsv"
  result="$("$PYTHON" "$RELEASE_PY" compare-migrations --code "$tmp/code.tsv" --applied "$tmp/applied.tsv")"
  pending="$("$PYTHON" -c 'import json,sys; print(" ".join(json.loads(sys.argv[1])["pending"]))' "$result")"
  unknown="$("$PYTHON" -c 'import json,sys; print(" ".join(json.loads(sys.argv[1])["unknown"]))' "$result")"
  if [[ -n "$unknown" ]]; then
    fail "applied migrations that $CODE_REF does not have (the database is ahead of the code): $unknown"
  fi
  if [[ "$ENV" == prod || "$STAGE" == promote ]]; then
    if [[ -z "$pending" ]]; then
      pass "no migration of $CODE_REF is pending"
    elif [[ "$STAGE" == promote ]]; then
      fail "pending at $CODE_REF: $pending (run premigrate.sh first; a promotion must not start with migrations pending)"
    else
      fail "pending at $CODE_REF: $pending (the preprod promotion should have applied them)"
    fi
  else
    allowed=" powered_by/0003_request_not_to_publish "
    for m in $PHASE1_MIGRATIONS; do allowed+="powered_by/$m "; done
    other=""
    for m in $pending; do [[ "$allowed" == *" $m "* ]] || other+="$m "; done
    for m in ${ALLOW_PENDING//,/ }; do other="${other//$m /}"; done
    if [[ -n "${other// /}" ]]; then
      fail "pending migrations outside phase 1 would also run against the shared database: $other(review them; --allow-pending app/name,... once they are understood)"
    else
      pass "pending at $CODE_REF: ${pending:-none} (the first preprod pod applies them to the shared database)"
    fi
  fi
else
  fail "code ref $CODE_REF not found in $REPO"
fi

# 4b. --stage promote: the target image sees nothing pending on the target database (what its pods' own
# `migrate && gunicorn` start would otherwise apply, unlocked, while serving).
if [[ "$STAGE" == promote ]]; then
  rc=0
  run_web_pod "$ENV" "$IMAGE_TAG" migcheck "$tmp/migcheck.log" "$(cat <<'POD'
export PGOPTIONS='-c lock_timeout=5s'
python manage.py migrate --check
rc=$?
echo "migrate --check: exit $rc"
if [ $rc -ne 0 ]; then echo '--- pending (migrate --plan):'; python manage.py migrate --plan 2>&1 | head -n 40; fi
exit $rc
POD
)" 300 || rc=$?
  case "$rc" in
    0) pass "migrate --check exits 0 for web image tag $IMAGE_TAG on $DB (nothing pending)" ;;
    1) fail "migrate --check exits 1 for web image tag $IMAGE_TAG on $DB (migrations pending, or the check could not run): $(grep -vE '^$' "$tmp/migcheck.log" | tail -n 12 | tr '\n' ';')" ;;
    *) fail "could not run migrate --check in a pod for web image tag $IMAGE_TAG (exit $rc): $(grep -vE '^$' "$tmp/migcheck.log" 2>/dev/null | tail -n 5 | tr '\n' ';')" ;;
  esac
fi

# 5. Image tags of the deployed env file exist in the registry (they are the rollback target).
envfile="$(git -C "$REPO" show "origin/$(env_branch "$ENV"):envs/$ENV/helmrelease.yaml" 2>/dev/null || true)"
if [[ "$IMAGE_CHECK" == 0 ]]; then
  skip "image tags (--skip-image-check)"
elif [[ -z "$envfile" ]]; then
  fail "envs/$ENV/helmrelease.yaml not found on origin/$(env_branch "$ENV")"
elif ! command -v gcloud >/dev/null 2>&1; then
  skip "image tags: gcloud is not installed"
else
  images="$(printf '%s\n' "$envfile" | "$PYTHON" "$RELEASE_PY" env-images)" || images=""
  [[ -n "$images" ]] || fail "could not read the image tags of envs/$ENV/helmrelease.yaml"
  while IFS="$TAB" read -r component repo tag; do
    [[ -n "$component" ]] || continue
    if [[ -z "$repo" || -z "$tag" ]]; then
      # authService ships with an empty tag until a release writes one; every other component must have both.
      if [[ "$component" == authService ]]; then skip "authService image: no tag in the env file yet"; else fail "$component image: repository '$repo', tag '$tag' in envs/$ENV/helmrelease.yaml"; fi
      continue
    fi
    if gcloud artifacts docker images describe "$repo:$tag" --format='value(image_summary.digest)' >/dev/null 2>&1; then
      pass "$component image $repo:$tag exists"
    else
      fail "$component image $repo:$tag not found in Artifact Registry"
    fi
  done <<<"$images"
fi

# 6. Rollouts healthy (the web Rollout must exist), HelmRelease ready.
if rollouts="$(kc -n "$NS" get rollouts.argoproj.io -o json | "$PYTHON" "$RELEASE_PY" rollout-images)"; then
  grep -q "^$(env_hr "$ENV")-web$TAB" <<<"$rollouts" || fail "Rollout $NS/$(env_hr "$ENV")-web not found"
  while IFS="$TAB" read -r name _ phase _; do
    [[ -n "$name" ]] || continue
    if [[ "$phase" == Healthy ]]; then pass "Rollout $NS/$name is Healthy"; else fail "Rollout $NS/$name is '${phase:-unknown}'"; fi
  done <<<"$rollouts"
else
  fail "could not list the Rollouts of namespace $NS"
fi
# Ready must be True AND describe the HelmRelease's current generation: right after a spec change the previous
# reconciliation's Ready=True is still there until Flux has caught up.
ready="$(kc -n "$NS" get helmreleases.helm.toolkit.fluxcd.io "$(env_hr "$ENV")" -o json 2>/dev/null | "$PYTHON" -c '
import json, sys
try:
    hr = json.load(sys.stdin)
except ValueError:
    print("missing"); sys.exit()
conds = {c.get("type"): c for c in hr.get("status", {}).get("conditions", [])}
ready = conds.get("Ready", {})
gen = hr.get("metadata", {}).get("generation")
seen = ready.get("observedGeneration")
if hr.get("spec", {}).get("suspend"):
    print("suspended")
elif ready.get("status", "unknown") != "True":
    print(ready.get("status", "unknown"))
elif gen is None or seen != gen:
    print("stale:observedGeneration=%s,generation=%s" % (seen, gen))
else:
    print("True")')"
case "$ready" in
  True) pass "HelmRelease $NS/$(env_hr "$ENV") is Ready for its current generation" ;;
  stale:*) fail "HelmRelease $NS/$(env_hr "$ENV") Ready=True is stale (${ready#stale:}); wait for Flux to reconcile the current generation" ;;
  *) fail "HelmRelease $NS/$(env_hr "$ENV") Ready=$ready" ;;
esac

# 7. Long transactions: a migration's ACCESS EXCLUSIVE lock queues behind them, and everything else queues behind it.
long="$(pg_ro "$DB" -At -F "$TAB" -c "SELECT pid, state, extract(epoch FROM now() - xact_start)::int FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start < now() - interval '60 seconds'")"
if [[ -z "$long" ]]; then pass "no transaction on $DB older than 60 s"; else warn "transactions older than 60 s (pid, state, seconds): $(echo "$long" | tr '\n' ';')"; fi

# 8. Developer settings stay off in preprod until prod runs the release (a preprod-created project breaks old prod admin).
if [[ "$ENV" == preprod ]]; then
  flag="$(git -C "$REPO" show "$CODE_REF:envs/preprod/helmrelease.yaml" 2>/dev/null | sed -n 's/.*DEVELOPER_SETTINGS_ENABLED:[[:space:]]*"\{0,1\}\([A-Za-z]*\).*/\1/p' | head -1)"
  case "${flag,,}" in
    false | "") pass "DEVELOPER_SETTINGS_ENABLED is '${flag:-unset}' in envs/preprod at $CODE_REF" ;;
    *) fail "DEVELOPER_SETTINGS_ENABLED is '$flag' in envs/preprod at $CODE_REF; keep it off until prod runs the release" ;;
  esac
fi

# 9. The Secret's namespace is declared for the prod cluster (a missing namespace stalls every Flux apply). The release
# plan names prod/cluster-1/spec/namespaces.yaml of the infrastructure repo; preprod's own namespace.yaml there counts too.
NSFILE="prod/cluster-1/spec/namespaces.yaml"
ns_declared_in() { # file: does it hold a kind: Namespace document named $NS?
  "$PYTHON" - "$1" "$NS" <<'PY'
import re, sys
text = open(sys.argv[1], errors="replace").read()
for doc in re.split(r"(?m)^---\s*$", text):
    if re.search(r"(?m)^kind:\s*Namespace\s*$", doc) and re.search(r"(?m)^metadata:\s*\n(?:[ \t]+.*\n)*?[ \t]+name:\s*['\"]?" + re.escape(sys.argv[2]) + r"['\"]?\s*$", doc):
        sys.exit(0)
sys.exit(1)
PY
}
if [[ "$NS" == default ]]; then
  pass "namespace default (Secret auth-service-registry) needs no declaration"
elif [[ -n "$INFRA" ]]; then
  declared=""
  if [[ -f "$INFRA/$NSFILE" ]] && ns_declared_in "$INFRA/$NSFILE"; then
    declared="$NSFILE"
  else
    while IFS= read -r f; do
      if ns_declared_in "$f"; then declared="${f#"$INFRA"/}"; break; fi
    done < <(grep -rlsE "^kind:[[:space:]]*Namespace[[:space:]]*$" "$INFRA/prod/cluster-1/spec" --include='*.yaml' --include='*.yml' | sort)
  fi
  if [[ "$declared" == "$NSFILE" ]]; then
    pass "namespace $NS (Secret auth-service-registry) is listed in $NSFILE"
  elif [[ -n "$declared" ]]; then
    pass "namespace $NS (Secret auth-service-registry) is declared in $declared (not in $NSFILE; Flux applies both)"
  else
    fail "namespace $NS (Secret auth-service-registry) is not declared in $INFRA/$NSFILE or any Namespace manifest under prod/cluster-1/spec"
  fi
else
  manual "namespace $NS (Secret auth-service-registry): the Namespace manifests live in the infrastructure repo, not here. In Sefaria/infrastructure, check that $NSFILE (or another kind: Namespace manifest under prod/cluster-1/spec, such as prod/cluster-1/spec/$NS/namespace.yaml) declares 'kind: Namespace' with 'metadata.name: $NS', or re-run with --infra-repo DIR"
fi
if [[ -n "$INFRA" ]]; then
  if grep -rlsq "auth-service-registry" "$INFRA/prod/cluster-1/spec"; then
    pass "the infrastructure repo has an auth-service-registry manifest for the prod cluster"
  else
    warn "no auth-service-registry manifest under $INFRA/prod/cluster-1/spec (needed before authService.enabled: true)"
  fi
fi

# 10. Prod-only paths: the CronJobs and the Datadog labels and annotations the chart renders for prod, compared with the
# cluster. The chart and env file come from --chart-ref (default origin/prod: what is deployed).
if [[ "$ENV" == prod ]]; then
  CHART_REF="${CHART_REF:-origin/$(env_branch prod)}"
  if ! command -v helm >/dev/null 2>&1; then
    skip "CronJobs and Datadog annotations: helm is not installed"
  elif ! git -C "$REPO" cat-file -e "$CHART_REF:helm-chart/sefaria/Chart.yaml" 2>/dev/null \
    || ! git -C "$REPO" cat-file -e "$CHART_REF:envs/prod/helmrelease.yaml" 2>/dev/null; then
    fail "helm-chart/sefaria or envs/prod/helmrelease.yaml not found at $CHART_REF"
  else
    mkdir -p "$tmp/chart"
    git -C "$REPO" archive "$CHART_REF" helm-chart/sefaria | tar -x -C "$tmp/chart"
    rc=0
    git -C "$REPO" show "$CHART_REF:envs/prod/helmrelease.yaml" | "$PYTHON" "$RELEASE_PY" hr-values >"$tmp/prod-values.yaml" 2>"$tmp/hr-values.err" || rc=$?
    if [[ "$rc" == 3 ]]; then
      skip "CronJobs and Datadog annotations: $(cat "$tmp/hr-values.err")"
    elif [[ "$rc" != 0 ]]; then
      fail "could not read the values of envs/prod/helmrelease.yaml at $CHART_REF: $(tail -n 1 "$tmp/hr-values.err")"
    elif ! helm template "$(env_hr prod)" "$tmp/chart/helm-chart/sefaria" --namespace "$NS" -f "$tmp/prod-values.yaml" >"$tmp/render.yaml" 2>"$tmp/render.err"; then
      fail "helm template of the chart at $CHART_REF with envs/prod values failed: $(tail -n 3 "$tmp/render.err" | tr '\n' ' ')"
    elif ! "$PYTHON" "$RELEASE_PY" chart-prod-paths --web-rollout "$(env_hr prod)-web" <"$tmp/render.yaml" >"$tmp/paths.json"; then
      fail "could not read the rendered chart"
    else
      if ! kc -n "$NS" get cronjobs.batch -o json >"$tmp/cronjobs.json"; then
        fail "could not list the CronJobs of namespace $NS"
      elif out="$("$PYTHON" "$RELEASE_PY" check-cronjobs --rendered "$tmp/paths.json" --instance "$(env_hr prod)" <"$tmp/cronjobs.json")"; then
        report <<<"$out"
      else
        fail "the CronJob comparison failed"
      fi
      if ! kc -n "$NS" get pods -l "app=web-$(env_hr prod)" -o json >"$tmp/webpods.json"; then
        fail "could not list the web pods of namespace $NS"
      elif out="$("$PYTHON" "$RELEASE_PY" check-datadog --rendered "$tmp/paths.json" <"$tmp/webpods.json")"; then
        report <<<"$out"
      else
        fail "the Datadog label and annotation comparison failed"
      fi
    fi
  fi
fi

echo
if [[ "$FAILS" -gt 0 ]]; then
  echo "preflight: $FAILS check(s) FAILED"
  exit 1
fi
echo "preflight: all checks passed"
