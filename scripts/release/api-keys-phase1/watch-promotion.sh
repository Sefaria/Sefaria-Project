#!/usr/bin/env bash
# watch-promotion.sh: a read-only monitor to run while preprod is promoted (its first web pod migrates sefaria_auth,
# prod's live database on postgres-18-0 in namespace default) or while prod is promoted.
#
#   watch-promotion.sh --env preprod|prod --context C [--interval 10] [--duration 1800] [--out DIR]
#                      [--max-lock-wait 5] [--max-5xx-pct 2] [--min-requests 50] [--long-query 30]
#                      [--stop-on-alarm] [--pg-user U]
#
# Every --interval seconds, for --duration seconds (or until Ctrl-C), it records:
#   - sessions on sefaria_auth waiting on a lock (pid, what they wait for, for how long, the pids blocking them) and
#     queries running or transactions idle longer than --long-query seconds, from pg_stat_activity and pg_locks, in a
#     default_transaction_read_only session (SELECT only). Query text is shown with every string literal replaced by '?'
#     and cut at 120 characters, so no value a query carries (a key, a hash, a session) is printed;
#   - the newest powered_by row of django_migrations (so the migration's progress shows as it happens);
#   - prod web pods (namespace default, app=web-production): ready count and restarts since the watch started;
#   - prod nginx (app=nginx-production, container nginx): requests, 5xx and latency in the access log lines written
#     since the previous tick (kubectl logs --since-time; httpRequest.status of the structured JSON log). Counts only:
#     no log line is printed or saved.
# It prints one line per tick and appends one JSON object per tick to DIR/watch.jsonl
# (default DIR: ./watch-promotion-<env>-<UTC time>). An ALARM is printed when a session has waited on a lock longer
# than --max-lock-wait seconds, or when prod's 5xx rate in a tick is above --max-5xx-pct percent over at least
# --min-requests requests. It keeps watching after an alarm unless --stop-on-alarm.
# Exit status: 2 after any alarm, 1 when a tick could not read something (the watch is incomplete), else 0.
# It never changes anything: kubectl get and logs, and SELECTs in a read-only session.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" INTERVAL=10 DURATION=1800 OUT="" MAX_LOCK_WAIT=5 MAX_5XX_PCT=2 MIN_REQUESTS=50 LONG_QUERY=30 STOP_ON_ALARM=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --max-lock-wait) MAX_LOCK_WAIT="$2"; shift 2 ;;
    --max-5xx-pct) MAX_5XX_PCT="$2"; shift 2 ;;
    --min-requests) MIN_REQUESTS="$2"; shift 2 ;;
    --long-query) LONG_QUERY="$2"; shift 2 ;;
    --stop-on-alarm) STOP_ON_ALARM=1; shift ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ "$ENV" == preprod || "$ENV" == prod ]] || die "--env must be preprod or prod"
for v in INTERVAL DURATION MIN_REQUESTS LONG_QUERY; do
  [[ "${!v}" =~ ^[0-9]+$ && "${!v}" -gt 0 ]] || die "--$(tr 'A-Z_' 'a-z-' <<<"$v") takes a positive whole number of seconds or requests"
done
for v in MAX_LOCK_WAIT MAX_5XX_PCT; do
  [[ "${!v}" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "--$(tr 'A-Z_' 'a-z-' <<<"${v/5XX/5xx}") takes a number"
done
need kubectl "$PYTHON"
check_context "$ENV" "$CTX"

# What is watched is prod's side either way: the shared database, prod's web pods and prod's nginx.
DB="$(env_db prod)"
NS="$(env_namespace prod)"
WEB_LABEL="app=web-$(env_hr prod)"
NGINX_LABEL="app=nginx-$(env_hr prod)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT:-${PWD}/watch-promotion-${ENV}-${STAMP}}"
umask 077
mkdir -p "$OUT"
JSONL="$OUT/watch.jsonl"
STATE="$OUT/state.json"
ERRLOG="$OUT/errors.log"
TICKDIR="$(mktemp -d)"
trap 'rm -rf "$TICKDIR"' EXIT
STOP=0
trap 'STOP=1' INT TERM

# One read-only query per tick. String literals are replaced by '?' before the text leaves the database, and an
# unterminated one (a query cut at track_activity_query_size) to the end. A query whose quoting the pattern cannot follow
# (a backslash, which may escape a quote, or a single quote inside a double-quoted name) is cut at its first quote, and a
# dollar-quoted body is cut too.
REDACT="left(regexp_replace(regexp_replace(
    CASE WHEN a.query ~ '[\\\\]|\"[^\"]*''[^\"]*\"' THEN regexp_replace(a.query, '''.*\$', '''?')
         ELSE regexp_replace(a.query, '''([^'']|'''')*(''|\$)', '''?''', 'g') END,
    '\\\$[A-Za-z0-9_]*\\\$.*\$', '\$?\$'), '\\s+', ' ', 'g'), 120)"
# The session never waits long on a lock itself: a watcher queued behind the migration would stop reporting.
TIMEOUTS="SET lock_timeout = '2s'; SET statement_timeout = '15s';"
SQL_ACTIVITY="$TIMEOUTS SELECT json_build_object(
  'now', now(),
  'lock_waits', coalesce((SELECT json_agg(w ORDER BY w.seconds DESC) FROM (
      SELECT a.pid, a.usename, a.application_name, a.state, a.wait_event,
             (SELECT string_agg(DISTINCT coalesce(c.relname, l.locktype) || ':' || l.mode, ',')
                FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation WHERE l.pid = a.pid AND NOT l.granted) AS waiting_for,
             round(extract(epoch FROM now() - coalesce((SELECT min(l.waitstart) FROM pg_locks l WHERE l.pid = a.pid AND NOT l.granted),
                                                      a.state_change))::numeric, 1) AS seconds,
             pg_blocking_pids(a.pid) AS blocked_by,
             $REDACT AS query
        FROM pg_stat_activity a
       WHERE a.datname = current_database() AND a.wait_event_type = 'Lock' AND a.pid <> pg_backend_pid()) w), '[]'::json),
  'long_running', coalesce((SELECT json_agg(r ORDER BY r.seconds DESC) FROM (
      SELECT a.pid, a.usename, a.application_name, a.state, a.wait_event_type,
             round(extract(epoch FROM now() - CASE WHEN a.state = 'active' THEN a.query_start ELSE a.xact_start END)::numeric, 1) AS seconds,
             $REDACT AS query
        FROM pg_stat_activity a
       WHERE a.datname = current_database() AND a.pid <> pg_backend_pid() AND a.backend_type = 'client backend'
         AND a.wait_event_type IS DISTINCT FROM 'Lock'
         AND ((a.state = 'active' AND a.query_start < now() - interval '$LONG_QUERY seconds')
           OR (a.state LIKE 'idle in transaction%' AND a.xact_start < now() - interval '$LONG_QUERY seconds'))) r), '[]'::json))"
# A separate read, so a lock on django_migrations costs only this field and not the lock report.
SQL_MIGRATIONS="$TIMEOUTS SELECT json_build_object(
  'newest_powered_by', (SELECT json_build_object('id', id, 'name', name, 'applied', applied)
                          FROM public.django_migrations WHERE app = 'powered_by' ORDER BY id DESC LIMIT 1),
  'powered_by_migrations', (SELECT count(*) FROM public.django_migrations WHERE app = 'powered_by'))"

echo "watch-promotion for the $ENV promotion on $CTX: database $DB on $PG_NS/$PG_POD, prod web ($WEB_LABEL) and nginx ($NGINX_LABEL) in $NS"
echo "every ${INTERVAL}s for ${DURATION}s; alarms: lock wait > ${MAX_LOCK_WAIT}s, 5xx > ${MAX_5XX_PCT}% (>= $MIN_REQUESTS requests); writing $JSONL"

START="$(date +%s)"
TICK=0
SINCE=""
while [[ "$STOP" == 0 ]]; do
  TICK=$((TICK + 1))
  t0="$(date +%s)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  errors=""
  if ! pg_ro "$DB" -At -c "$SQL_ACTIVITY" >"$TICKDIR/db.json" 2>"$TICKDIR/db.err"; then
    errors+="db,"
    { echo "$now tick $TICK db:"; cat "$TICKDIR/db.err"; } >>"$ERRLOG"
  fi
  if ! pg_ro "$DB" -At -c "$SQL_MIGRATIONS" >"$TICKDIR/migrations.json" 2>"$TICKDIR/migrations.err"; then
    errors+="migrations,"
    { echo "$now tick $TICK migrations:"; cat "$TICKDIR/migrations.err"; } >>"$ERRLOG"
  fi
  if ! kc -n "$NS" get pods -l "$WEB_LABEL" -o json >"$TICKDIR/pods.json" 2>"$TICKDIR/pods.err"; then
    errors+="pods,"
    { echo "$now tick $TICK pods:"; cat "$TICKDIR/pods.err"; } >>"$ERRLOG"
  fi
  # The window: since the previous tick's fetch (second resolution, so windows may overlap by under a second).
  if [[ -n "$SINCE" ]]; then
    since_args=(--since-time="$SINCE")
    window=$((t0 - SINCE_EPOCH))
  else
    since_args=(--since="${INTERVAL}s")
    window="$INTERVAL"
  fi
  SINCE="$now"
  SINCE_EPOCH="$t0"
  if ! kc -n "$NS" logs -l "$NGINX_LABEL" -c nginx "${since_args[@]}" --tail=-1 --prefix=false --max-log-requests=50 \
    >"$TICKDIR/nginx.log" 2>"$TICKDIR/nginx.err"; then
    errors+="nginx,"
    { echo "$now tick $TICK nginx:"; cat "$TICKDIR/nginx.err"; } >>"$ERRLOG"
  fi
  rc=0
  "$PYTHON" "$RELEASE_PY" watch-tick --state "$STATE" --jsonl "$JSONL" --tick "$TICK" --time "$now" --window "$window" \
    --db "$TICKDIR/db.json" --migrations "$TICKDIR/migrations.json" --pods "$TICKDIR/pods.json" --nginx "$TICKDIR/nginx.log" --errors "${errors%,}" \
    --max-lock-wait "$MAX_LOCK_WAIT" --max-5xx-pct "$MAX_5XX_PCT" --min-requests "$MIN_REQUESTS" || rc=$?
  [[ "$rc" == 0 || "$rc" == 2 ]] || die "watch-tick failed (exit $rc)"
  if [[ "$rc" == 2 && "$STOP_ON_ALARM" == 1 ]]; then
    echo "stopping on the alarm (--stop-on-alarm)"
    break
  fi
  elapsed=$(($(date +%s) - START))
  [[ "$elapsed" -lt "$DURATION" ]] || break
  # Sleep out the rest of the interval in 1 s steps, so Ctrl-C stops promptly.
  while [[ "$STOP" == 0 && $(($(date +%s) - t0)) -lt "$INTERVAL" && $(($(date +%s) - START)) -lt "$DURATION" ]]; do
    sleep 1
  done
  [[ $(($(date +%s) - START)) -lt "$DURATION" ]] || break
done

rc=0
"$PYTHON" "$RELEASE_PY" watch-summary --state "$STATE" --jsonl "$JSONL" --max-lock-wait "$MAX_LOCK_WAIT" --max-5xx-pct "$MAX_5XX_PCT" || rc=$?
exit "$rc"
