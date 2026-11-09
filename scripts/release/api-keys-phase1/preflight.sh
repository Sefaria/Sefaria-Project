#!/usr/bin/env bash
# preflight.sh: read-only checks before the preprod promotion (which migrates prod's database) and before the prod one.
#
#   preflight.sh --env preprod|prod --context C [--code-ref REF] [--repo DIR] [--infra-repo DIR] [--no-fetch]
#                [--skip-image-check]
#
# Checks (from the release plan's Preprod and Prod lists), each printed as PASS, FAIL, WARN or SKIP:
#   - current_database() on a preprod web pod and on a prod web pod is sefaria_auth (they share it)
#   - role auth_service_reader exists, may CONNECT, and has SELECT on every column the auth service loader reads
#     (powered_by_apikey included); tables not created yet are WARN, a missing grant on an existing table is FAIL
#   - Secret auth-service-registry exists in the env's namespace (name only)
#   - pending migrations: the code at --code-ref against django_migrations. preprod: only phase 1 migrations may be
#     pending; prod: nothing may be pending (the preprod promotion migrated the shared database)
#   - the image tags of the env file on origin/<env branch> exist in Artifact Registry (gcloud; SKIP without it)
#   - every Rollout in the namespace is Healthy and the HelmRelease is Ready
#   - long transactions on the database (a migration would queue behind them)
#   - DEVELOPER_SETTINGS_ENABLED is off in preprod's env file at --code-ref
#   - with --infra-repo: the Secret's namespace is declared in the prod cluster's Namespace manifests
# Exits 1 when any check FAILs.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" CODE_REF="" REPO="" INFRA="" FETCH=1 IMAGE_CHECK=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --code-ref) CODE_REF="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --infra-repo) INFRA="$2"; shift 2 ;;
    --no-fetch) FETCH=0; shift ;;
    --skip-image-check) IMAGE_CHECK=0; shift ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ "$ENV" == preprod || "$ENV" == prod ]] || die "--env must be preprod or prod"
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
trap 'rm -rf "$tmp"' EXIT
if git -C "$REPO" rev-parse -q --verify "$CODE_REF^{commit}" >/dev/null; then
  git -C "$REPO" ls-tree -r --name-only "$CODE_REF" | grep '/migrations/' | "$PYTHON" "$RELEASE_PY" migrations-from-paths >"$tmp/code.tsv"
  pg_ro "$DB" -At -F "$TAB" -c 'SELECT app, name FROM public.django_migrations' >"$tmp/applied.tsv"
  result="$("$PYTHON" "$RELEASE_PY" compare-migrations --code "$tmp/code.tsv" --applied "$tmp/applied.tsv")"
  pending="$("$PYTHON" -c 'import json,sys; print(" ".join(json.loads(sys.argv[1])["pending"]))' "$result")"
  unknown="$("$PYTHON" -c 'import json,sys; print(" ".join(json.loads(sys.argv[1])["unknown"]))' "$result")"
  if [[ -n "$unknown" ]]; then
    fail "applied migrations that $CODE_REF does not have (the database is ahead of the code): $unknown"
  fi
  if [[ "$ENV" == prod ]]; then
    if [[ -z "$pending" ]]; then pass "no migration of $CODE_REF is pending"; else fail "pending at $CODE_REF: $pending (the preprod promotion should have applied them)"; fi
  else
    allowed=" powered_by/0003_request_not_to_publish "
    for m in $PHASE1_MIGRATIONS; do allowed+="powered_by/$m "; done
    other=""
    for m in $pending; do [[ "$allowed" == *" $m "* ]] || other+="$m "; done
    if [[ -n "$other" ]]; then
      warn "pending migrations outside phase 1 (they also run at the promotion): $other"
    fi
    pass "pending at $CODE_REF: ${pending:-none} (the first preprod pod applies them to the shared database)"
  fi
else
  fail "code ref $CODE_REF not found in $REPO"
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
  while read -r image; do
    if gcloud artifacts docker images describe "$image" --format='value(image_summary.digest)' >/dev/null 2>&1; then
      pass "image $image exists"
    else
      fail "image $image not found in Artifact Registry"
    fi
  done < <(printf '%s\n' "$envfile" | "$PYTHON" -c '
import re, sys
text = sys.stdin.read()
for m in re.finditer(r"(?:imageRegistry|repository):\s*(\S+)\s*\n\s*tag:\s*\"?([^\"\s]+)\"?", text):
    print(f"{m.group(1)}:{m.group(2)}")')
fi

# 6. Rollouts healthy, HelmRelease ready.
while IFS="$TAB" read -r name _ phase _; do
  [[ -n "$name" ]] || continue
  if [[ "$phase" == Healthy ]]; then pass "Rollout $NS/$name is Healthy"; else fail "Rollout $NS/$name is '${phase:-unknown}'"; fi
done < <(kc -n "$NS" get rollouts.argoproj.io -o json | "$PYTHON" "$RELEASE_PY" rollout-images)
ready="$(kc -n "$NS" get helmreleases.helm.toolkit.fluxcd.io "$(env_hr "$ENV")" -o json 2>/dev/null | "$PYTHON" -c '
import json, sys
try:
    hr = json.load(sys.stdin)
except ValueError:
    print("missing"); sys.exit()
conds = {c.get("type"): c for c in hr.get("status", {}).get("conditions", [])}
print("suspended" if hr.get("spec", {}).get("suspend") else conds.get("Ready", {}).get("status", "unknown"))')"
case "$ready" in
  True) pass "HelmRelease $NS/$(env_hr "$ENV") is Ready" ;;
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

# 9. The Secret's namespace is declared in the infrastructure repo (a missing namespace stalls every Flux apply).
if [[ -n "$INFRA" ]]; then
  if grep -rlsE "^[[:space:]]*kind:[[:space:]]*Namespace" "$INFRA/prod/cluster-1/spec" | xargs -r grep -lE "^[[:space:]]+name:[[:space:]]*$NS[[:space:]]*$" | grep -q .; then
    pass "namespace $NS is declared under $INFRA/prod/cluster-1/spec"
  elif [[ "$NS" == default ]]; then
    pass "namespace default needs no declaration"
  else
    fail "namespace $NS is not declared under $INFRA/prod/cluster-1/spec"
  fi
  if grep -rlsq "auth-service-registry" "$INFRA/prod/cluster-1/spec"; then
    pass "the infrastructure repo has an auth-service-registry manifest for the prod cluster"
  else
    warn "no auth-service-registry manifest under $INFRA/prod/cluster-1/spec (needed before authService.enabled: true)"
  fi
else
  skip "infrastructure checks (pass --infra-repo DIR)"
fi

echo
if [[ "$FAILS" -gt 0 ]]; then
  echo "preflight: $FAILS check(s) FAILED"
  exit 1
fi
echo "preflight: all checks passed"
