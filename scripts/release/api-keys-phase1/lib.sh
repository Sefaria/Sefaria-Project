# shellcheck shell=bash
# Shared helpers for the API keys phase 1 release scripts. Sourced, never run.
#
# Every kubectl and helm call names its context explicitly (never the current context), and the
# context must match the environment-to-cluster table below. Nothing here prints a Secret value or a
# full API key.

set -euo pipefail

if ((BASH_VERSINFO[0] < 4)); then
  echo "ERROR: bash 4 or newer is required (macOS: brew install bash)" >&2
  exit 1
fi

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_PY="${RELEASE_DIR}/release_lib.py"
PYTHON="${APIKEYS_RELEASE_PYTHON3:-python3}"

# Environment table. Sources: envs/<env>/helmrelease.yaml (names, namespaces, postgres.host/db),
# the infrastructure repo (prod/cluster-1/spec/{preprod,prod}/*-repo.yaml, dev/cluster-1/spec/staging/staging-repo.yaml,
# prod/cluster-1/spec/postgres-18/statefulset.yaml) and the wiki runbooks (cluster context names).
PROD_CONTEXT="gke_production-deployment_us-east1-b_cluster-1"
DEV_CONTEXT="gke_development-205018_us-east1-b_cluster-1"

env_known() { [[ "$1" == staging || "$1" == preprod || "$1" == prod ]]; }

env_context() {
  case "$1" in
    staging) echo "$DEV_CONTEXT" ;;
    preprod | prod) echo "$PROD_CONTEXT" ;;
  esac
}
env_namespace() {
  case "$1" in
    staging | prod) echo default ;;
    preprod) echo preprod ;;
  esac
}
# HelmRelease name, which is also the chart's deployEnv (pod label app=web-<deployEnv>, Rollout <deployEnv>-web).
env_hr() {
  case "$1" in
    staging) echo sefariastaging ;;
    preprod) echo preprod ;;
    prod) echo production ;;
  esac
}
env_db() {
  case "$1" in
    staging) echo sefariastaging ;;
    preprod | prod) echo sefaria_auth ;;
  esac
}
# The branch whose push deploys the env (deploy-static.yaml).
env_branch() {
  case "$1" in
    staging) echo master ;;
    preprod) echo preprod ;;
    prod) echo prod ;;
  esac
}
# Flux GitRepository (namespace/name) that pins the env to a release tag of this repo.
env_gitrepo() {
  case "$1" in
    staging) echo default/sefaria-project-staging ;;
    preprod) echo preprod/sefaria-project-preprod ;;
    prod) echo default/sefaria-project-prod ;;
  esac
}
# Envs whose web pods use the same database: preprod and prod both use sefaria_auth on postgres-18.default.
env_sharing() {
  case "$1" in
    staging) echo staging ;;
    preprod | prod) echo "preprod prod" ;;
  esac
}

# The Postgres StatefulSet pod. Prod: prod/cluster-1/spec/postgres-18/statefulset.yaml. Staging (dev cluster) is
# assumed to follow the same layout; override with --pg-pod / --pg-namespace / --pg-container if it does not.
PG_POD="${PG_POD:-postgres-18-0}"
PG_NS="${PG_NS:-default}"
PG_CONTAINER="${PG_CONTAINER:-postgres-18}"

# Phase 1 objects in sefaria_auth, and the scope of a scoped restore: every powered_by_* table plus these.
PHASE1_EXTRA_TABLES="api_project api_tier api_tier_meter_limit api_key_project_remap"
PHASE1_MIGRATIONS="0003_developer_settings 0004_api_key_notify_triggers 0005_api_key_origins_strings 0006_api_project_schema 0007_api_project_backfill 0008_api_key_project_triggers_grants 0009_cleanup_abandoned_project_limits 0010_seed_mcp_tier 0011_api_key_allowed_domains"
READER_ROLE="auth_service_reader"

log() { printf '%s\n' "$*" >&2; }
die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}
step() { printf '\n== %s\n' "$*" >&2; }

# Prints a command; runs it only when EXECUTE=1.
run() {
  printf '+ %s\n' "$(printf '%q ' "$@")" >&2
  if [[ "${EXECUTE:-0}" == 1 ]]; then
    "$@"
  fi
}

need() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is required and was not found on PATH"
  done
}

# Refuses a context that does not belong to the environment. APIKEYS_RELEASE_TEST_CONTEXT lets the kind test suite
# stand in for every cluster, and only a kind- context is accepted there, so the override cannot redirect a real env
# at the wrong real cluster.
check_context() {
  local env="$1" ctx="$2" expected
  env_known "$env" || die "unknown env '$env' (staging, preprod or prod)"
  [[ -n "$ctx" ]] || die "--context is required (expected $(env_context "$env") for $env)"
  expected="$(env_context "$env")"
  if [[ -n "${APIKEYS_RELEASE_TEST_CONTEXT:-}" ]]; then
    [[ "$APIKEYS_RELEASE_TEST_CONTEXT" == kind-* ]] || die "APIKEYS_RELEASE_TEST_CONTEXT must name a kind- context"
    expected="$APIKEYS_RELEASE_TEST_CONTEXT"
  fi
  [[ "$ctx" == "$expected" ]] || die "context '$ctx' is not the cluster of $env (expected '$expected'); refusing"
  kubectl config get-contexts -o name 2>/dev/null | grep -qxF "$ctx" || die "context '$ctx' is not in your kubeconfig"
}

kc() { kubectl --context "$CTX" "$@"; }

# psql inside the Postgres pod as the container's superuser (POSTGRES_USER), over the local socket.
# pg_ro forces a read-only session; pg_rw is only used by restore.sh db --scoped --execute. Stdin is forwarded only
# when no -c is given (SQL on stdin), so a -c query never swallows the script's own stdin (the typed confirmation).
_pg_exec() {
  local mode="$1" db="$2" stdin_flag=-i a
  shift 2
  for a in "$@"; do [[ "$a" == -c ]] && stdin_flag=""; done
  # shellcheck disable=SC2016
  kc -n "$PG_NS" exec $stdin_flag "$PG_POD" -c "$PG_CONTAINER" -- sh -c \
    'mode="$1"; db="$2"; u="${3:-${POSTGRES_USER:-postgres}}"; shift 3
     if [ "$mode" = ro ]; then export PGOPTIONS="-c default_transaction_read_only=on"; fi
     exec psql -X -q -v ON_ERROR_STOP=1 -U "$u" -d "$db" "$@"' \
    sh "$mode" "$db" "${PG_USER:-}" "$@"
}
pg_ro() { _pg_exec ro "$@"; }
pg_rw() { _pg_exec rw "$@"; }
pg_dump_pod() {
  local db="$1"
  shift
  kc -n "$PG_NS" exec "$PG_POD" -c "$PG_CONTAINER" -- sh -c \
    'db="$1"; u="${2:-${POSTGRES_USER:-postgres}}"; shift 2; exec pg_dump -U "$u" "$@" "$db"' \
    sh "$db" "${PG_USER:-}" "$@"
}

# pg_restore on a local file: a local pg_restore 18+, else the postgres:18 image through docker. The dump is fed on
# stdin, so no mount is needed.
pg_restore_local() {
  local file="$1"
  shift
  local v
  if command -v pg_restore >/dev/null 2>&1; then
    v="$(pg_restore --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
    if [[ "$v" -ge 18 ]]; then
      pg_restore "$@" <"$file"
      return
    fi
  fi
  command -v docker >/dev/null 2>&1 || die "pg_restore 18+ or docker is required to read dumps"
  docker run --rm -i "${APIKEYS_RELEASE_PG_IMAGE:-postgres:18}" pg_restore "$@" <"$file"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# SQL: the tables a scoped restore owns, one per line.
scoped_tables_sql() {
  local extra="" t
  for t in $PHASE1_EXTRA_TABLES; do extra+="'$t',"; done
  extra="${extra%,}"
  cat <<SQL
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND (c.relname LIKE 'powered\_by\_%' OR c.relname IN ($extra))
ORDER BY 1;
SQL
}

# SQL: count and an order-independent checksum of each named table's rows (table<TAB>count<TAB>md5).
checksums_sql() {
  local t sql=""
  for t in "$@"; do
    sql+="SELECT '$t', count(*), coalesce(md5(string_agg(h, '' ORDER BY h)), '') FROM (SELECT md5(x::text) AS h FROM public.\"$t\" x) s UNION ALL "
  done
  sql+="SELECT '__powered_by_migrations__', count(*), coalesce(md5(string_agg(app || '/' || name || '/' || applied::text, ',' ORDER BY name)), '') FROM public.django_migrations WHERE app = 'powered_by';"
  printf '%s\n' "$sql"
}

# SQL: md5 of apikeys_notify()'s definition, or "absent". The function is not part of any table, so the table schema
# comparison does not see it.
notify_fn_sql() {
  echo "SELECT coalesce((SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apikeys_notify'), 'absent');"
}

# Normalised schema of the named tables (pg_dump --schema-only), comparable across dump and restore.
scoped_schema() {
  local db="$1"
  shift
  local args=() t
  for t in "$@"; do args+=(-t "public.\"$t\""); done
  [[ ${#args[@]} -gt 0 ]] || return 0
  pg_dump_pod "$db" --schema-only "${args[@]}" | "$PYTHON" "$RELEASE_PY" normalise-schema
}

# The scoped tables' normalised schema as a restore from the snapshot recreates it. Postgres re-deparses some
# expressions (a CHECK ... IN list, for one) on every dump and restore, so a restored table never prints exactly like the
# original. The reference is therefore the snapshot's full dump restored (schema only) into a scratch postgres:18 container
# and dumped again; cached as db/scoped-schema.roundtrip.sql. Without docker it returns nonzero.
expected_scoped_schema() {
  local snap="$1" out="$1/db/scoped-schema.roundtrip.sql" name t args=() r full
  if [[ -s "$out" ]]; then cat "$out"; return 0; fi
  command -v docker >/dev/null 2>&1 || return 1
  name="apikeys-schema-check-$$"
  docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=check "${APIKEYS_RELEASE_PG_IMAGE:-postgres:18}" >/dev/null || return 1
  for _ in $(seq 1 60); do docker exec "$name" psql -U postgres -Atc 'SELECT 1' >/dev/null 2>&1 && break; sleep 1; done
  full="$(ls "$snap"/db/*.dump | grep -v '/scoped\.dump$' | head -1)"
  for r in $(pg_restore_local "$full" --schema-only --file=- | "$PYTHON" "$RELEASE_PY" roles-from-sql); do
    docker exec "$name" psql -q -U postgres -c "CREATE ROLE \"$r\" NOLOGIN" >/dev/null 2>&1 || true
  done
  docker exec "$name" createdb -U postgres check
  docker exec -i "$name" pg_restore -U postgres -d check --schema-only <"$full" >/dev/null 2>&1 || true
  while read -r t; do [[ -n "$t" ]] && args+=(-t "public.\"$t\""); done <"$snap/db/scoped-tables.txt"
  if [[ ${#args[@]} -gt 0 ]]; then
    docker exec "$name" pg_dump -U postgres --schema-only "${args[@]}" check | "$PYTHON" "$RELEASE_PY" normalise-schema >"$out.tmp"
  else
    : >"$out.tmp"
  fi
  docker rm -f "$name" >/dev/null 2>&1
  mv "$out.tmp" "$out"
  cat "$out"
}

# Compares the live scoped schema (file $2) with the snapshot ($1): exact against the round-tripped reference, or, without
# docker, the weaker canonical form against the snapshot's original. Prints a diff on mismatch.
schema_matches() {
  local snap="$1" live="$2" ref
  ref="$(mktemp)"
  if cmp -s "$live" "$snap/db/scoped-schema.sql"; then rm -f "$ref"; return 0; fi
  if expected_scoped_schema "$snap" >"$ref"; then
    diff -u "$ref" "$live" >&2 && { rm -f "$ref"; return 0; }
  else
    log "  (no docker: comparing CHECK expressions without casts or parentheses)"
    diff -u <("$PYTHON" "$RELEASE_PY" canonical-schema <"$snap/db/scoped-schema.sql") <("$PYTHON" "$RELEASE_PY" canonical-schema <"$live") >&2 \
      && { rm -f "$ref"; return 0; }
  fi
  rm -f "$ref"
  return 1
}

# Web pods of a deployEnv: name<TAB>phase<TAB>image of the web container.
web_pods() {
  local ns="$1" deploy="$2"
  kc -n "$ns" get pods -l "app=web-${deploy}" -o json | "$PYTHON" "$RELEASE_PY" pod-images
}

# current_database() as one web pod of the env sees it. A real web pod runs Django (the database name is in its
# local_settings); a test stand-in has no manage.py and answers through psql and its PG* environment.
web_current_database() {
  local ns="$1" pod="$2"
  kc -n "$ns" exec "$pod" -c web -- sh -c '
    if [ -f manage.py ]; then
      python manage.py shell -c "from django.db import connection
c = connection.cursor(); c.execute(\"SELECT current_database()\"); print(c.fetchone()[0])" 2>/dev/null | tail -n 1
    else
      psql -X -Atc "SELECT current_database()"
    fi'
}

confirm_env() {
  local env="$1" answer=""
  printf 'Type the environment name (%s) to continue: ' "$env" >&2
  if [[ -t 0 ]]; then
    read -r answer </dev/tty
  else
    read -r answer || true
  fi
  [[ "$answer" == "$env" ]] || die "confirmation did not match '$env'; nothing was changed"
}
