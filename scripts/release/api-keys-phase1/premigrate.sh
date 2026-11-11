#!/usr/bin/env bash
# premigrate.sh: apply the release's Django migrations to the shared database once, alone and with a lock timeout,
# BEFORE the preprod promotion (preprod and prod share sefaria_auth, so that promotion is prod's schema migration).
#
#   premigrate.sh --env preprod|prod|staging --context <kube context> --snapshot <snapshot dir> --image-tag <web image tag>
#                 [--allow-old-snapshot] [--attempts 5] [--backoff 5] [--pod-timeout 900]
#                 [--pg-pod P --pg-namespace N --pg-container C --pg-user U] [--execute]
#
# Without --execute it checks what it can read (snapshot, database sessions, the live web Rollout) and prints the plan;
# it creates nothing. With --execute (and the env name typed back) it creates one-off pods, each copied from the live
# web Rollout's pod template (the same volumes, env, envFrom, Secrets, serviceAccount and imagePullSecrets; the web
# container only) with the image tag replaced by --image-tag, running
#   PGOPTIONS='-c lock_timeout=5s' python manage.py migrate --noinput
# (first it checks, in the pod, that the Django connection really reports lock_timeout = 5s). A failed attempt (a lock
# not obtained in 5 s, for one) is retried after a short backoff, up to --attempts times; every pod has a unique name and
# is deleted afterwards, and each pod's log is kept in <snapshot>/premigrate-<time>/. The last step is
# `python manage.py migrate --check` exiting 0 in a pod with the same spec; only then it prints `premigrate: ok`.
#
# Refuses when: the snapshot has no manifest.json, or it is older than 2 hours (--allow-old-snapshot overrides the age
# only), or is of another database; pg_stat_activity shows a transaction that has been idle in transaction for more than
# 60 s (it is printed); the live web Rollout cannot be read. When --image-tag is the tag the Rollout runs now and
# `migrate --check` reports nothing pending, it is a no-op (it says so, exits 0 and prints `premigrate: ok`).
# On any failure it prints `premigrate: FAILED`, what state the database is in, and exits 1. If it fails after its
# retries, stop: do not promote.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" SNAP="" IMAGE_TAG="" ALLOW_OLD=0 ATTEMPTS=5 BACKOFF=5 POD_TIMEOUT=900 EXECUTE=0
MAX_SNAPSHOT_AGE=7200 MAX_IDLE_XACT=60
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --snapshot) SNAP="$2"; shift 2 ;;
    --image-tag) IMAGE_TAG="$2"; shift 2 ;;
    --allow-old-snapshot) ALLOW_OLD=1; shift ;;
    --attempts) ATTEMPTS="$2"; shift 2 ;;
    --backoff) BACKOFF="$2"; shift 2 ;;
    --pod-timeout) POD_TIMEOUT="$2"; shift 2 ;;
    --pg-pod) PG_POD="$2"; shift 2 ;;
    --pg-namespace) PG_NS="$2"; shift 2 ;;
    --pg-container) PG_CONTAINER="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ && "$BACKOFF" =~ ^[0-9]+$ && "$POD_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || die "--attempts, --backoff and --pod-timeout take whole numbers"
[[ -n "$IMAGE_TAG" && "$IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "--image-tag must be a plain image tag (the web image tag to migrate with)"
need kubectl "$PYTHON"
check_context "$ENV" "$CTX"
[[ -n "$SNAP" ]] || die "--snapshot is required: take one with snapshot.sh --execute first"

NS="$(env_namespace "$ENV")"
DB="$(env_db "$ENV")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TAB="$(printf '\t')"
WORK=""

trap 'web_pod_cleanup' EXIT
trap 'web_pod_cleanup; exit 130' INT TERM

# What state the database is in, for a failure message. Each Django migration runs in its own transaction on Postgres
# (none of this repository's migrations sets atomic = False), so a migration that failed left no partial change, and the
# ones before it stay applied.
db_state_report() {
  local latest
  log "  database state: each Django migration is atomic (one transaction), so the migration that failed changed nothing;"
  log "  migrations applied before it stay applied (they only add things, and the running pods work with them)."
  if latest="$(pg_ro "$DB" -At -F ' ' -c "SELECT app || '/' || name FROM public.django_migrations ORDER BY id DESC LIMIT 5" 2>/dev/null)"; then
    log "  latest applied migrations (newest first): $(tr '\n' ' ' <<<"$latest")"
  else
    log "  (could not read django_migrations; check the database before doing anything else)"
  fi
}

failed() { # reason, then optional "db" to report the database state
  printf 'premigrate: FAILED: %s\n' "$1"
  [[ "${2:-}" == db ]] && db_state_report 2>&1 | sed 's/^/premigrate: /'
  [[ "${2:-}" == db ]] || echo "premigrate: the database was not touched by this run"
  echo "premigrate: do not promote; fix the cause and run it again"
  exit 1
}

refuse() { # a precondition: nothing was run
  printf 'premigrate: refusing: %s\n' "$1"
  printf 'premigrate: FAILED: precondition not met; nothing was changed\n'
  exit 1
}

# 1. The snapshot: it exists, is of this database, and is fresh.
[[ -f "$SNAP/manifest.json" ]] || refuse "$SNAP has no manifest.json; take a snapshot with snapshot.sh --execute first"
MANIFEST="$SNAP/manifest.json"
[[ "$("$PYTHON" "$RELEASE_PY" manifest-get "$MANIFEST" database.name 2>/dev/null)" == "$DB" ]] || refuse "the snapshot is not of database $DB"
echo " $("$PYTHON" "$RELEASE_PY" manifest-get "$MANIFEST" sharing_envs 2>/dev/null | tr -d '[]",') " | grep -q " $ENV " || refuse "the snapshot does not cover $ENV"
created="$("$PYTHON" "$RELEASE_PY" manifest-get "$MANIFEST" created_at 2>/dev/null || true)"
age="$("$PYTHON" -c '
import datetime as d, sys
try:
    t = d.datetime.strptime(sys.argv[1], "%Y%m%dT%H%M%SZ").replace(tzinfo=d.timezone.utc)
except ValueError:
    print("bad"); sys.exit()
print(int((d.datetime.now(d.timezone.utc) - t).total_seconds()))' "$created")"
[[ "$age" != bad ]] || refuse "the snapshot's manifest has no readable created_at ('$created')"
if ((age < -300)); then
  refuse "the snapshot claims to be from the future ($created); check the clocks"
elif ((age > MAX_SNAPSHOT_AGE)); then
  if [[ "$ALLOW_OLD" == 1 ]]; then
    log "WARNING: the snapshot is $((age / 60)) minutes old (over 2 hours); continuing because of --allow-old-snapshot"
  else
    refuse "the snapshot $SNAP is $((age / 60)) minutes old (older than 2 hours); take a new one, or pass --allow-old-snapshot"
  fi
else
  log "snapshot $(basename "$SNAP"), $((age / 60)) minutes old"
fi

# 2. No session idle in a transaction for more than 60 s: the migration's lock would queue behind it.
idle="$(pg_ro "$DB" -At -F "$TAB" -c "SELECT pid, coalesce(usename, '-'), coalesce(nullif(application_name, ''), '-'), coalesce(client_addr::text, 'local'),
    state, extract(epoch FROM now() - xact_start)::int, extract(epoch FROM now() - state_change)::int
  FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'
    AND xact_start < now() - interval '${MAX_IDLE_XACT} seconds' ORDER BY xact_start")" \
  || refuse "could not read pg_stat_activity on $DB; cannot show that no old transaction is open"
if [[ -n "$idle" ]]; then
  while IFS="$TAB" read -r pid usr app addr state xact since; do
    log "  pid $pid user $usr app $app from $addr: $state, transaction open ${xact}s, idle ${since}s"
  done <<<"$idle"
  refuse "$(wc -l <<<"$idle" | tr -d ' ') session(s) on $DB idle in transaction for over ${MAX_IDLE_XACT}s (listed above); wait for them to end or ask their owner"
fi
log "no session on $DB idle in a transaction for over ${MAX_IDLE_XACT}s"

# 3. The live web Rollout: the pod spec to copy, and the tag it runs now.
ROLLOUT="$(web_rollout_json "$ENV")" || refuse "cannot read Rollout $NS/$(env_hr "$ENV")-web on $CTX"
CUR_IMAGE="$("$PYTHON" "$RELEASE_PY" rollout-web-image <<<"$ROLLOUT")" || refuse "the web Rollout has no web container"
CUR_TAG="${CUR_IMAGE##*:}"
[[ "$CUR_IMAGE" == *:* && "$CUR_TAG" != *"/"* ]] || CUR_TAG=""
log "web Rollout $NS/$(env_hr "$ENV")-web runs $CUR_IMAGE; migrating with tag $IMAGE_TAG"

# The pod's scripts. PGOPTIONS is read by libpq, which Django's PostgreSQL backend (psycopg) uses; the first command
# proves that in the pod itself instead of assuming it.
LOCK_TIMEOUT_PROBE='python manage.py shell -c '"'"'from django.db import connection as c; cur = c.cursor(); cur.execute("SHOW lock_timeout"); print("lock_timeout=" + cur.fetchone()[0])'"'"''
MIGRATE_SCRIPT="export PGOPTIONS='-c lock_timeout=5s'
out=\$($LOCK_TIMEOUT_PROBE 2>&1)
prc=\$?
echo \"\$out\" | tail -n 5
[ \$prc -eq 0 ] || { echo 'premigrate: could not open the Django database connection'; exit 1; }
got=\$(printf '%s\\n' \"\$out\" | tail -n 1)
[ \"\$got\" = 'lock_timeout=5s' ] || { echo \"premigrate: PGOPTIONS did not reach Django's connection (got '\$got')\"; exit 70; }
start=\$(date +%s)
python manage.py migrate --noinput
rc=\$?
echo \"migrate: exit \$rc after \$((\$(date +%s) - start))s\"
exit \$rc"
CHECK_SCRIPT="export PGOPTIONS='-c lock_timeout=5s'
python manage.py migrate --check
rc=\$?
echo \"migrate --check: exit \$rc\"
if [ \$rc -ne 0 ]; then echo '--- pending (migrate --plan):'; python manage.py migrate --plan 2>&1 | head -n 40; fi
exit \$rc"

if [[ "$EXECUTE" != 1 ]]; then
  cat >&2 <<PLAN
DRY RUN (nothing created). The checks above passed. With --execute, on context ${CTX}, namespace ${NS}:
  1. $( [[ "$IMAGE_TAG" == "$CUR_TAG" ]] && echo "the image tag is the one running now: a pod runs 'migrate --check'; nothing pending means a no-op" || echo "(the tag differs from the running one, so the migration runs)" )
  2. up to ${ATTEMPTS} times (backoff ${BACKOFF}s x attempt): a pod copied from Rollout $(env_hr "$ENV")-web (volumes, env, envFrom, Secrets,
     serviceAccount, imagePullSecrets; web container only; no probes, ports or fleet labels) with the image tag ${IMAGE_TAG}, running
     PGOPTIONS='-c lock_timeout=5s' python manage.py migrate --noinput   (after proving lock_timeout is 5s in its Django connection)
  3. a pod with the same spec runs 'python manage.py migrate --check'; only an exit 0 prints 'premigrate: ok'
  Logs go to ${SNAP%/}/premigrate-<time>/; every pod is deleted afterwards. The env name must be typed back.
PLAN
  exit 0
fi

confirm_env "$ENV"
umask 077
WORK="${SNAP%/}/premigrate-$STAMP"
mkdir -p "$WORK"
chmod 700 "$WORK"
step "premigrate of $ENV ($DB) with image tag $IMAGE_TAG; logs in $WORK"

# One pod's result: prints its log's tail on failure.
show_tail() { tail -n 25 "$1" | sed 's/^/    /' >&2; }

if [[ "$IMAGE_TAG" == "$CUR_TAG" ]]; then
  step "the image tag is the running one: is anything pending?"
  rc=0
  run_web_pod "$ENV" "$IMAGE_TAG" premigrate-check "$WORK/check-0.log" "$CHECK_SCRIPT" "$POD_TIMEOUT" || rc=$?
  if [[ "$rc" == 0 ]]; then
    echo "premigrate: no-op: image tag $IMAGE_TAG is the running one and migrate --check reports nothing pending"
    echo "premigrate: ok"
    exit 0
  elif [[ "$rc" == 1 ]]; then
    log "  migrations are pending although the tag is the running one; migrating"
  else
    show_tail "$WORK/check-0.log"
    failed "could not run migrate --check (pod exit $rc, log $WORK/check-0.log)"
  fi
fi

ok_migrate=0
attempt=1
while ((attempt <= ATTEMPTS)); do
  step "attempt $attempt of $ATTEMPTS"
  rc=0
  t0="$(date +%s)"
  run_web_pod "$ENV" "$IMAGE_TAG" premigrate "$WORK/attempt-$attempt.log" "$MIGRATE_SCRIPT" "$POD_TIMEOUT" || rc=$?
  log "  attempt $attempt: pod exit $rc after $(($(date +%s) - t0))s (pod $LAST_POD_NAME, log $WORK/attempt-$attempt.log)"
  if [[ "$rc" == 0 ]]; then
    ok_migrate=1
    break
  fi
  show_tail "$WORK/attempt-$attempt.log"
  if [[ "$rc" == 125 ]]; then
    failed "the migration pod could not start (nothing ran): see above"
  elif [[ "$rc" == 70 ]]; then
    failed "PGOPTIONS did not reach Django's database connection, so the lock timeout would not hold; no migration was run"
  fi
  ((attempt < ATTEMPTS)) && { log "  retrying in $((BACKOFF * attempt))s"; sleep "$((BACKOFF * attempt))"; }
  attempt=$((attempt + 1))
done
[[ "$ok_migrate" == 1 ]] || failed "migrate did not succeed in $ATTEMPTS attempts (logs $WORK/attempt-*.log)" db

step "migrate --check"
rc=0
run_web_pod "$ENV" "$IMAGE_TAG" premigrate-check "$WORK/check.log" "$CHECK_SCRIPT" "$POD_TIMEOUT" || rc=$?
if [[ "$rc" != 0 ]]; then
  show_tail "$WORK/check.log"
  failed "migrate --check exited $rc after a successful migrate: migrations are still pending (log $WORK/check.log)" db
fi
log "  migrate --check: exit 0"
echo "premigrate: ok"
