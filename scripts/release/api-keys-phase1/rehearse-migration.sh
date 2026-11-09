#!/usr/bin/env bash
# rehearse-migration.sh: time the phase 1 migrations and watch their locks on a copy of a database (N-M8).
#
#   rehearse-migration.sh --dump FILE [--code DIR] [--python PY] [--port 56445] [--db sefaria_auth] [--out DIR]
#                         [--concurrent-reads] [--no-reader-role] [--image postgres:18] [--keep]
#
# Restores FILE (pg_dump --format=c, e.g. <snapshot>/db/sefaria_auth.dump) into a scratch Postgres container on
# 127.0.0.1:PORT, started with prod's settings (max_connections=300, shared_buffers=300MB). Creates the dump's owner
# roles and auth_service_reader (so migration 0008 takes its grant path, as on prod; --no-reader-role skips it), then
# runs every pending migration of the checkout DIR (default: this repo) one at a time with its duration, while a
# sampler records lock waits and ACCESS EXCLUSIVE locks every 0.2 s. --concurrent-reads adds a reader that queries
# powered_by_project every 0.1 s, the way old pods do during the promotion, so its lock waits show up.
# Writes timings.jsonl, samples.tsv and report.json to --out and prints the summary. Local docker only; this script
# never talks to a cluster. The container is removed at the end unless --keep.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

DUMP="" CODE="" PY="${APIKEYS_RELEASE_PYTHON:-python3}" PORT=56445 DBN=sefaria_auth OUT="" READS=0 READER=1 KEEP=0
IMAGE="${APIKEYS_RELEASE_PG_IMAGE:-postgres:18}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump) DUMP="$2"; shift 2 ;;
    --code) CODE="$2"; shift 2 ;;
    --python) PY="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --db) DBN="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --concurrent-reads) READS=1; shift ;;
    --no-reader-role) READER=0; shift ;;
    --image) IMAGE="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ -f "$DUMP" ]] || die "--dump FILE is required"
need docker "$PYTHON"
CODE="${CODE:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
[[ -f "$CODE/manage.py" ]] || die "$CODE has no manage.py"
OUT="${OUT:-$PWD/api-keys-phase1-rehearsal-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
NAME="apikeys-rehearsal-$PORT"
docker ps -a --format '{{.Names}}' | grep -qx "$NAME" && die "container $NAME exists already (another rehearsal on port $PORT?)"

PIDS=()
cleanup() {
  local p
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  if [[ "$KEEP" == 1 ]]; then
    log "kept container $NAME on 127.0.0.1:$PORT (docker rm -f $NAME when done)"
  else
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

psql_c() { docker exec -i "$NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }

step "scratch Postgres $NAME ($IMAGE) on 127.0.0.1:$PORT"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:$PORT:5432" "$IMAGE" \
  -c max_connections=300 -c shared_buffers=300MB -c timezone=UTC >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && psql_c -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_c -d postgres -c 'SELECT 1' >/dev/null || die "the scratch Postgres did not start"

step "restore $(basename "$DUMP") ($(wc -c <"$DUMP" | tr -d ' ') bytes)"
roles="$(docker exec -i "$NAME" pg_restore --list <"$DUMP" | awk '/^[0-9]+;/ {print $NF}' | sort -u | grep -vx postgres || true)"
[[ "$READER" == 1 ]] && roles="$(printf '%s\n%s\n' "$roles" "$READER_ROLE" | sort -u)"
for r in $roles; do
  psql_c -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$r') THEN CREATE ROLE \"$r\" NOLOGIN; END IF; END \$\$" >/dev/null
done
psql_c -d postgres -c "CREATE DATABASE \"$DBN\"" >/dev/null
start=$(date +%s)
docker exec -i "$NAME" pg_restore -U postgres -d "$DBN" --no-privileges --exit-on-error <"$DUMP"
log "  restored in $(($(date +%s) - start)) s; roles created: ${roles//$'\n'/ }"
psql_c -d "$DBN" -At -c "SELECT name FROM django_migrations WHERE app = 'powered_by' ORDER BY id" >"$OUT/powered_by-before.txt"
log "  powered_by migrations before: $(tr '\n' ' ' <"$OUT/powered_by-before.txt")"
psql_c -d "$DBN" -c 'ANALYZE' >/dev/null

SAMPLE_SQL="SELECT 'wait', now()::text, a.pid, coalesce(c.relname, l.locktype), l.mode,
       round(extract(epoch FROM now() - a.query_start)::numeric, 3)
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid LEFT JOIN pg_class c ON c.oid = l.relation
WHERE NOT l.granted AND a.datname = current_database()
UNION ALL
SELECT 'hold', now()::text, a.pid, coalesce(c.relname, l.relation::text), l.mode,
       round(extract(epoch FROM now() - a.xact_start)::numeric, 3)
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid LEFT JOIN pg_class c ON c.oid = l.relation
WHERE l.granted AND l.locktype = 'relation' AND l.mode = 'AccessExclusiveLock'
  AND a.datname = current_database() AND a.pid <> pg_backend_pid()"
step "lock sampler (every 0.2 s)$([[ "$READS" == 1 ]] && echo ' and a concurrent powered_by_project reader')"
printf '%s \\watch 0.2\n' "$SAMPLE_SQL" | docker exec -i "$NAME" psql -X -q -At -F "$(printf '\t')" -U postgres -d "$DBN" >"$OUT/samples.tsv" 2>/dev/null &
PIDS+=($!)
if [[ "$READS" == 1 ]]; then
  printf '%s \\watch 0.1\n' "SELECT count(*) FROM powered_by_project WHERE is_published" \
    | docker exec -i "$NAME" psql -X -q -At -U postgres -d "$DBN" >/dev/null 2>&1 &
  PIDS+=($!)
fi
sleep 1

step "migrations of $CODE, one at a time"
(
  cd "$CODE"
  RELEASE_PG_HOST=127.0.0.1 RELEASE_PG_PORT="$PORT" RELEASE_PG_DB="$DBN" RELEASE_PG_USER=postgres RELEASE_PG_PASSWORD=postgres PYTHONPATH="$CODE:$RELEASE_DIR/django" DJANGO_SETTINGS_MODULE=release_settings \
    "$PY" "$RELEASE_DIR/django/rehearse_migrate.py"
) >"$OUT/timings.jsonl" 2>"$OUT/migrate.log" || { cat "$OUT/migrate.log" >&2; die "a migration failed (log: $OUT/migrate.log)"; }
sleep 1
for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done

psql_c -d "$DBN" -At -c "SELECT name FROM django_migrations WHERE app = 'powered_by' ORDER BY id" >"$OUT/powered_by-after.txt"
psql_c -d "$DBN" -At -F "$(printf '\t')" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname LIKE 'powered\_by\_%' OR relname LIKE 'api\_%' ORDER BY 1" >"$OUT/tables-after.tsv"
step "report ($OUT)"
"$PYTHON" "$RELEASE_PY" rehearse-summary --timings "$OUT/timings.jsonl" --samples "$OUT/samples.tsv" --out "$OUT/report.json" | tee "$OUT/report.txt"
echo "powered_by migrations after: $(tr '\n' ' ' <"$OUT/powered_by-after.txt")" | tee -a "$OUT/report.txt"
