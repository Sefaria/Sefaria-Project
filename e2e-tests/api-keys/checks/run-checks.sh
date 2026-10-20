#!/usr/bin/env bash
# API-key checks: throwaway Postgres and Mongo containers, the powered_by pytest suite, the migration round trip,
# the auth-service Go tests, shellcheck and the feature-matrix validator. Contract and failure reading: README.md.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)" || exit 2
cd "$ROOT" || exit 2
SCRATCH="$ROOT/.claude/scratch/apikeys-checks"
LOGS="$SCRATCH/logs"
PG_NAME=apikeys-checks-pg
MONGO_NAME=apikeys-checks-mongo
PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:7}"
GO_IMAGE="${GO_IMAGE:-golang:1.27}"
SHELLCHECK_IMAGE=koalaman/shellcheck:stable
PG_PORT=55442
MONGO_PORT=27017
DJANGO_DB=sefaria_auth
GO_DB=authsvc_go
PG_DSN_GO="postgres://postgres:pg@127.0.0.1:$PG_PORT/$GO_DB?sslmode=disable"
SCHEMA_SQL="select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='powered_by_apikey'::regclass and contype='c' order by 1;
select tgname, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in ('powered_by_apikey'::regclass,'powered_by_project'::regclass) order by 1;"
FAILS=0
SUBCOMMAND_ARGS=()  # set by main: the arguments after the subcommand name

if [ -z "${PY:-}" ]; then
  if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python"; else PY=python3; fi
fi
export APIKEYS_CHECKS_PG_PORT="$PG_PORT"

step() { printf '\n==== %s ====\n' "$*"; }
fail() { echo "FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
django_env() { export PYTHONPATH="$HERE/testenv" DJANGO_SETTINGS_MODULE=test_settings; }

usage() {
  cat <<EOF
usage: bash e2e-tests/api-keys/checks/run-checks.sh <command> [args]
  selftest              tools only (docker daemon, PY can import django); no containers
  up | down             start or remove the $PG_NAME and $MONGO_NAME containers
  pytest [args]         powered_by suite; default -m "not deep and not failing" and target powered_by/tests
  migrations [--seed]   migration round trip on $DJANGO_DB; --seed also runs the dev-shape round trip
  go                    auth-service go vet + go test -race with PG_TEST_DSN on $GO_DB
  shell [files]         shellcheck -S warning (default: auth-service/scripts/*.sh and this script)
  unit                  python3 -m unittest discover over e2e-tests/api-keys/tests, when present
  features              check_features.py --strict, then unit
  all                   selftest pytest migrations go shell features
PY=${PY} (override with PY=/path/to/python)
EOF
}

# ---------------------------------------------------------------- containers
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
STARTED_HERE=0 # set to 1 when this invocation created a container; the EXIT trap removes only then
container_running() { [ -n "$(docker ps -q --filter "name=^$1\$" 2>/dev/null)" ]; }

start_pg() {
  container_running "$PG_NAME" && return 0
  if port_open "$PG_PORT"; then fail "127.0.0.1:$PG_PORT is taken by something other than $PG_NAME; stop it first"; return 1; fi
  docker rm -f "$PG_NAME" >/dev/null 2>&1
  docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD=pg -p "127.0.0.1:$PG_PORT:5432" "$PG_IMAGE" >/dev/null \
    || { fail "could not start $PG_IMAGE as $PG_NAME (is the image pulled?)"; return 1; }
  STARTED_HERE=1
}

start_mongo() {
  container_running "$MONGO_NAME" && return 0
  if port_open "$MONGO_PORT"; then fail "127.0.0.1:$MONGO_PORT is taken by something other than $MONGO_NAME; stop it first (Mongo is required)"; return 1; fi
  docker rm -f "$MONGO_NAME" >/dev/null 2>&1
  docker run -d --name "$MONGO_NAME" -p "127.0.0.1:$MONGO_PORT:27017" "$MONGO_IMAGE" >/dev/null \
    || { fail "could not start $MONGO_IMAGE as $MONGO_NAME (is the image pulled?)"; return 1; }
  STARTED_HERE=1
}

pg_ready() { docker exec "$PG_NAME" psql -h 127.0.0.1 -U postgres -Atc 'select 1' >/dev/null 2>&1; }
mongo_ready() { docker exec "$MONGO_NAME" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1; }

wait_for() { # label, readiness command...
  local label="$1"; shift
  for _ in $(seq 60); do "$@" && return 0; sleep 1; done
  fail "$label not ready after 60 s; read the container log: docker logs $PG_NAME / $MONGO_NAME"
  return 1
}

psql_() { docker exec -i "$PG_NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

ensure_db() {
  docker exec "$PG_NAME" psql -U postgres -Atc "select 1 from pg_database where datname='$1'" | grep -q 1 \
    || psql_ -c "CREATE DATABASE $1"
}

ensure_up() {
  start_pg && start_mongo || return 1
  wait_for "Postgres" pg_ready || return 1
  wait_for "Mongo" mongo_ready || return 1
  ensure_db "$DJANGO_DB" && ensure_db "$GO_DB" || { fail "creating $DJANGO_DB / $GO_DB"; return 1; }
  # sefaria.system.database connects to Mongo at import time and needs the 'sefaria' database to exist.
  docker exec "$MONGO_NAME" mongosh --quiet --eval \
    'db.getSiblingDB("sefaria").bootstrap.updateOne({x:1},{$set:{x:1}},{upsert:true})' >/dev/null \
    || { fail "seeding the Mongo 'sefaria' database"; return 1; }
}

cmd_up() { ensure_up && echo "up: $PG_NAME on 127.0.0.1:$PG_PORT, $MONGO_NAME on 127.0.0.1:$MONGO_PORT"; }

cmd_down() {
  local names
  names="$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '^apikeys-checks-' || true)"
  if [ -z "$names" ]; then echo "down: no apikeys-checks-* containers"; return 0; fi
  while read -r name; do docker rm -f "$name" >/dev/null && echo "removed $name"; done <<<"$names"
}

teardown_unless_kept() {
  if [ "$STARTED_HERE" != 1 ]; then echo "leaving $PG_NAME and $MONGO_NAME running: this run did not start them"; return; fi
  if [ "${KEEP:-0}" = 1 ]; then echo "KEEP=1: leaving $PG_NAME and $MONGO_NAME running"; return; fi
  cmd_down
}

# ---------------------------------------------------------------- selftest and unit
cmd_selftest() {
  step "selftest (no containers)"
  if ! command -v docker >/dev/null 2>&1; then
    fail "docker is not installed or not on PATH"
  elif ! docker version --format 'docker server {{.Server.Version}}' 2>/dev/null; then
    fail "docker daemon is not reachable; start Docker, or add $(id -un) to the docker group"
  fi
  if ! command -v "$PY" >/dev/null 2>&1; then
    fail "no Python at PY=$PY; set PY to a python 3.12 with requirements.txt installed"
  elif ! django_version="$("$PY" -c 'import django; print(django.__version__)' 2>/dev/null)"; then
    fail "$PY cannot import django; install requirements.txt into it or set PY"
  else
    echo "django $django_version via $PY"
  fi
  bash -n "$HERE/run-checks.sh" && echo "bash -n run-checks.sh: ok" || fail "bash -n run-checks.sh"
}

cmd_unit() {
  if [ ! -d "$ROOT/e2e-tests/api-keys/tests" ]; then echo "unit: e2e-tests/api-keys/tests not present yet; skipped"; return 0; fi
  step "unit tests of the checks tooling"
  python3 -m unittest discover -s e2e-tests/api-keys/tests -t . || fail "python3 -m unittest discover -s e2e-tests/api-keys/tests"
}

# ---------------------------------------------------------------- pytest
cmd_pytest() {
  ensure_up || return 1
  django_env
  local has_marker=0 has_target=0 value_next=0 arg
  for arg in "${SUBCOMMAND_ARGS[@]}"; do
    if [ "$value_next" = 1 ]; then value_next=0; continue; fi
    case "$arg" in
      -m) has_marker=1; value_next=1 ;;
      -m*) has_marker=1 ;;
      -k|-p|-c|--rootdir) value_next=1 ;;
      -*) ;;
      *) has_target=1 ;;
    esac
  done
  local -a pytest_cmd=("$PY" -m pytest -p no:cacheprovider)
  [ "$has_marker" = 1 ] || pytest_cmd+=(-m "not deep and not failing")
  [ "$has_target" = 1 ] || pytest_cmd+=(powered_by/tests)
  pytest_cmd+=(-q --tb=line "${SUBCOMMAND_ARGS[@]}")
  step "pytest: ${pytest_cmd[*]:3}"
  mkdir -p "$LOGS"
  "${pytest_cmd[@]}" 2>&1 | tee "$LOGS/pytest.log"
  local rc=${PIPESTATUS[0]}
  [ "$rc" -eq 0 ] || fail "pytest exited $rc (log: $LOGS/pytest.log)"
  return "$rc"
}

# ---------------------------------------------------------------- migrations
dm() { # manage.py with startup noise filtered out; returns manage.py's own status
  "$PY" manage.py "$@" 2>&1 | grep -v -e '^{"event"' -e ACCOUNT_ -e 'System check' -e WARNINGS -e 'RuntimeWarning' -e '^$'
  return "${PIPESTATUS[0]}"
}

manage() { # run manage.py, print the command and its status, count a failure
  echo "\$ python manage.py $*"
  dm "$@"
  local rc=$?
  echo "exit=$rc"
  [ "$rc" -eq 0 ] || fail "python manage.py $*"
  return "$rc"
}

schema_dump() { # apikey CHECK constraints and the non-internal triggers of both tables
  echo "-- schema $1"
  docker exec "$PG_NAME" psql -U postgres -d "$DJANGO_DB" -Atc "$SCHEMA_SQL" || fail "schema dump $1"
}

row_counts() {
  docker exec "$PG_NAME" psql -U postgres -d "$DJANGO_DB" -Atc \
    "select (select count(*) from powered_by_project), (select count(*) from powered_by_apikey)" \
    || fail "row counts"
}

scalar() { # one query on $DJANGO_DB, rows printed bare; the caller checks the status
  docker exec "$PG_NAME" psql -U postgres -d "$DJANGO_DB" -Atc "$1"
}

SEEDED_API_PROJECTS=8 # seed rows 9104-9111 have a key or an owner or a developer-settings submission

limits_snapshot() { # every limits row, in id order, so a re-run can be compared with the first one
  scalar "select project_id, tier from powered_by_projectlimits order by project_id"
}

check_seeded_limits() { # at latest: one row per seeded API project, the partner one, the gold one normalised
  local rows partner_rows gold_tier
  rows="$(scalar "select count(*) from powered_by_projectlimits")" || { fail "counting limits rows"; return 1; }
  [ "$rows" = "$SEEDED_API_PROJECTS" ] || fail "limits rows at latest: $rows, expected $SEEDED_API_PROJECTS"
  partner_rows="$(scalar "select count(*) from powered_by_projectlimits where tier = 'partner'")" \
    || { fail "counting partner limits rows"; return 1; }
  [ "$partner_rows" = "$1" ] || fail "partner limits rows: $partner_rows, seeded partner projects: $1"
  gold_tier="$(scalar "select tier from powered_by_projectlimits where project_id = 9111")" \
    || { fail "reading the gold project's limits row"; return 1; }
  [ "$gold_tier" = developer ] || fail "gold project's limits tier: '$gold_tier', expected developer"
  [ "$(scalar "select count(*) from powered_by_projectlimits where project_id in (9101, 9102, 9103)")" = 0 ] \
    || fail "ownerless keyless listings 9101-9103 got a limits row"
}

seeded_round_trip() { # load the dev-shape seed at 0005, migrate forward and back, compare counts and limits rows
  local seed="$HERE/testenv/seed_dev_shape.sql" before latest back partner_projects limits_first partner_frozen
  step "2b. seeded round trip ($seed)"
  psql_ -c "DROP DATABASE IF EXISTS $DJANGO_DB" -c "CREATE DATABASE $DJANGO_DB" || { fail "resetting $DJANGO_DB"; return 1; }
  manage migrate powered_by 0005 || return 1
  docker exec -i "$PG_NAME" psql -U postgres -d "$DJANGO_DB" -v ON_ERROR_STOP=1 -q <"$seed" \
    || { fail "loading $seed"; return 1; }
  before="$(row_counts)"
  partner_projects="$(scalar "select count(*) from powered_by_project where tier = 'partner'")" \
    || { fail "counting the seeded partner projects"; return 1; }
  manage migrate || return 1
  latest="$(row_counts)"
  check_seeded_limits "$partner_projects" || return 1
  limits_first="$(limits_snapshot)"
  manage migrate powered_by 0005 || return 1
  back="$(row_counts)"
  [ "$before" = "$back" ] || fail "row counts changed across forward and back: at 0005 [$before], after reverse [$back]"
  partner_frozen="$(scalar "select tier from powered_by_project where id = 9106")" \
    || { fail "reading the seeded partner project's frozen tier"; return 1; }
  [ "$partner_frozen" = partner ] || fail "seeded partner project's frozen tier after reverse: '$partner_frozen', expected partner"
  manage migrate powered_by || return 1
  [ "$(limits_snapshot)" = "$limits_first" ] || fail "limits rows changed across forward, reverse and forward"
  echo "(projects, keys): at 0005 [$before], at latest [$latest], back at 0005 [$back]; limits rows: $SEEDED_API_PROJECTS"
}

cmd_migrations() {
  ensure_up || return 1
  django_env
  step "2. migrations on $DJANGO_DB"
  if [ "${SUBCOMMAND_ARGS[0]:-}" = --seed ]; then
    if [ -f "$HERE/testenv/seed_dev_shape.sql" ]; then
      seeded_round_trip
    else
      echo "--seed: no testenv/seed_dev_shape.sql; running the plain round trip only"
    fi
  fi
  manage makemigrations --check --dry-run powered_by
  manage migrate
  manage showmigrations powered_by
  schema_dump "at latest"
  manage migrate powered_by 0005
  schema_dump "after reverse to 0005"
  manage migrate powered_by
  schema_dump "after forward again"
  manage showmigrations powered_by
  manage makemigrations --check --dry-run powered_by
  echo "(whole-project drift, informational: guides is expected to report pending changes on this Django version)"
  dm makemigrations --check --dry-run | tail -n 6
}

# ---------------------------------------------------------------- Go
gotest() { # PG_TEST_DSN, then the command run inside the Go container with the worktree read-only
  local dsn="$1"; shift
  docker run --rm --network host --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e GOMODCACHE=/go-mod -e GOCACHE=/go-cache -e GOFLAGS=-buildvcs=false \
    -e PG_TEST_DSN="$dsn" \
    -v "$ROOT":/src:ro -v "$SCRATCH/go/mod":/go-mod -v "$SCRATCH/go/cache":/go-cache \
    -w /src/auth-service "$GO_IMAGE" "$@"
}

cmd_go() {
  ensure_up || return 1
  mkdir -p "$SCRATCH/go/mod" "$SCRATCH/go/cache" "$LOGS"
  step "3. go vet + go test -race with PG_TEST_DSN ($GO_DB)"
  local rc=0
  gotest "$PG_DSN_GO" sh -c 'go vet ./... && go test -race -count=1 -v ./...' >"$LOGS/go.log" 2>&1 || rc=$?
  grep -E '^(ok|FAIL|\?)' "$LOGS/go.log"
  echo "exit=$rc  PASS=$(grep -c -- '--- PASS' "$LOGS/go.log")  SKIP=$(grep -c -- '--- SKIP' "$LOGS/go.log")  FAIL=$(grep -c -- '--- FAIL' "$LOGS/go.log")"
  [ "$rc" -eq 0 ] || fail "go vet / go test -race (log: $LOGS/go.log)"
  step "3b. informational: go test -tags knowngaps -run KnownGap (not counted)"
  gotest "$PG_DSN_GO" go test -tags knowngaps -run KnownGap -count=1 ./... 2>&1 | tail -n 15
  return 0
}

# ---------------------------------------------------------------- shell and features
cmd_shell() {
  local -a files=()
  if [ "${#SUBCOMMAND_ARGS[@]}" -gt 0 ]; then
    files=("${SUBCOMMAND_ARGS[@]}")
  else
    shopt -s nullglob
    files=(auth-service/scripts/*.sh e2e-tests/api-keys/checks/run-checks.sh)
    shopt -u nullglob
  fi
  if [ "${#files[@]}" -eq 0 ]; then echo "shell: no shell files to check"; return 0; fi
  step "shellcheck -S warning: ${files[*]}"
  local -a tool
  local tools_dir="$SCRATCH/tools"
  if command -v shellcheck >/dev/null 2>&1; then
    tool=(shellcheck)
  elif command -v docker >/dev/null 2>&1 && { docker image inspect "$SHELLCHECK_IMAGE" >/dev/null 2>&1 || docker pull -q "$SHELLCHECK_IMAGE" >/dev/null 2>&1; }; then
    tool=(docker run --rm -v "$ROOT":/mnt -w /mnt "$SHELLCHECK_IMAGE")
  else
    "$PY" -m pip install --quiet --target "$tools_dir" shellcheck-py || { fail "no shellcheck: install one or allow docker"; return 1; }
    tool=("$tools_dir/bin/shellcheck")
  fi
  "${tool[@]}" -S warning "${files[@]}" || fail "shellcheck -S warning ${files[*]}"
  step "demo.sh write gate"
  demo_write_gate ${DEMO_GATE_FILE:+"$DEMO_GATE_FILE"}
}

# demo_write_gate [file]: every write command in demo.sh (SQL write, terminated backend, compose stop/start, kubectl
# scale) sits inside a mutating_* function or the t_authsvc_down/t_authsvc_up adapters (F-DEMO-01.e4).
demo_write_gate() {
  local file="${1:-auth-service/scripts/demo.sh}" hits
  [ -f "$file" ] || return 0
  hits=$(awk '
    /^[a-z_]+\(\) *\{/ { fn = $1; sub(/\(.*/, "", fn) }
    /^\}/ { fn = "" }
    /^[[:space:]]*#/ { next }
    tolower($0) ~ /(insert into|update powered_by|delete from|pg_terminate_backend|compose .*(stop|start) |kubectl .* scale )/ \
      && fn !~ /^(mutating_|t_authsvc_(down|up)$)/ { printf "%s:%d: write outside mutating_*: %s\n", FILENAME, NR, $0 }
  ' "$file")
  if [ -n "$hits" ]; then fail "demo write gate"$'\n'"$hits"; fi
}

cmd_features() {
  step "feature matrix validator (--strict)"
  if [ ! -f "$ROOT/e2e-tests/api-keys/check_features.py" ]; then
    fail "e2e-tests/api-keys/check_features.py is missing"
  else
    python3 "$ROOT/e2e-tests/api-keys/check_features.py" --strict || fail "check_features.py --strict"
  fi
  cmd_unit
}

cmd_all() {
  cmd_selftest
  cmd_pytest
  cmd_migrations
  cmd_go
  cmd_shell
  cmd_features
}

# ---------------------------------------------------------------- main
main() {
  local cmd="${1:-}"
  [ "$#" -gt 0 ] && shift
  SUBCOMMAND_ARGS=("$@")
  case "$cmd" in
    selftest|up|down|pytest|migrations|go|shell|unit|features|all) ;;
    *) usage; exit 2 ;;
  esac
  case "$cmd" in
    pytest|migrations|go|all) trap teardown_unless_kept EXIT ;;
  esac
  "cmd_$cmd"
  if [ "$FAILS" -eq 0 ]; then
    echo "run-checks $cmd: all steps green"
    exit 0
  fi
  echo "run-checks $cmd: $FAILS failing step(s)" >&2
  exit 1
}

main "$@"
