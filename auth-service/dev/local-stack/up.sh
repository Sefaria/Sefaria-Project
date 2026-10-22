#!/usr/bin/env bash
# Brings the local API-keys stack up, or repairs whatever part of it is down. Idempotent.
#   auth-service/dev/local-stack/up.sh
# Env: ENVOY_VARIANT=default|keepunchanged (default: the last one used), DJANGO_RESTART=1 (restart both Django
# servers, e.g. after changing DEVELOPER_SETTINGS_MOCKS), DEVELOPER_SETTINGS_MOCKS (Django :8100, default false),
# SKIP_WEBPACK=1, AUTHSVC_REBUILD=1 (rebuild the auth service image from auth-service/; otherwise it is built
# only when missing, so work in progress there never breaks a running stack), and the authsvc overrides
# AUTH_MODE, GATED_PATHS, RELOAD_INTERVAL, PG_NOTIFY_CHANNEL, PG_DSN.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

mkdir -p "$STATE_DIR" "$STACK_RUN_DIR"
[ -x "$PYTHON" ] || die "no Python at $PYTHON (set APIKEYS_STACK_PYTHON)"

variant="${ENVOY_VARIANT:-$(cat "$STACK_RUN_DIR/envoy.variant" 2>/dev/null || echo default)}"
log "render envoy ($variant) and nginx configs"
"$PYTHON" "$STACK_DIR/render_configs.py" "$STACK_RUN_DIR" --envoy-variant "$variant"

log "postgres"
compose up -d --wait pg

log "migrate (settings wrapper, Postgres :55432)"
manage migrate --noinput >"$STATE_DIR/migrate.log" 2>&1 || { tail -30 "$STATE_DIR/migrate.log"; die "migrate failed"; }
triggers="$(compose exec -T pg psql -U postgres -d sefaria_auth -At -c \
  "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'apikeys\_notify\_%'")"
[ "$triggers" -ge 4 ] || die "NOTIFY triggers missing after migrate (found $triggers)"

log "provision reader role"
compose exec -T pg psql -q -U postgres -d sefaria_auth -v ON_ERROR_STOP=1 <"$STACK_DIR/provision.sql"

log "sentinel key"
(cd "$REPO" && django_env "$PYTHON" manage.py shell <"$STACK_DIR/seed_sentinel.py") 2>&1 | grep '^sentinel ok' \
  || die "sentinel seeding failed"

log "authsvc, echo, nginx, envoy, mailpit"
compose up -d ${AUTHSVC_REBUILD:+--build} authsvc echo nginx envoy mailpit >"$STATE_DIR/compose-up.log" 2>&1 \
  || { tail -30 "$STATE_DIR/compose-up.log"; die "compose up failed"; }

if [ -z "${SKIP_WEBPACK:-}" ]; then
  bundle="$(ls -t "$REPO"/static/bundles/client/client-*.js 2>/dev/null | head -1 || true)"
  if [ -z "$bundle" ] || [ -n "$(find "$REPO/static/js" -newer "$bundle" -type f \( -name '*.js' -o -name '*.jsx' \) \
      -not -path '*/tests/*' -not -name '*.test.js' -print -quit)" ]; then
    log "webpack client bundle is stale; building"
    (cd "$REPO" && npm run build-client) >"$STATE_DIR/webpack.log" 2>&1 \
      || { tail -30 "$STATE_DIR/webpack.log"; die "webpack build failed"; }
  fi
fi

start_django() {
  local port="$1" flag="$2" mocks="$3" pid
  pid="$(django_pid "$port")"
  if [ -n "$pid" ] && [ -n "${DJANGO_RESTART:-}" ]; then
    log "stop Django :$port (pid $pid)"
    kill "$pid"
    for _ in $(seq 1 50); do ps -p "$pid" >/dev/null 2>&1 || break; sleep 0.2; done
    pid=""
  fi
  if [ -n "$pid" ]; then
    log "Django :$port already running (pid $pid)"
    return
  fi
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "port $port is taken by a process this stack did not start"
  fi
  log "start Django :$port (DEVELOPER_SETTINGS_ENABLED=$flag, MOCKS=$mocks)"
  # exec all the way down, so $! is the runserver pid and nothing holds this script's stdout open.
  (cd "$REPO" && DEVELOPER_SETTINGS_ENABLED="$flag" DEVELOPER_SETTINGS_MOCKS="$mocks" \
    exec nohup env -u FRONT_END_URL -u CI_RUN PYTHONPATH="$STACK_DIR" DJANGO_SETTINGS_MODULE=django_settings \
    "$PYTHON" manage.py runserver "127.0.0.1:$port" --noreload) </dev/null >>"$(django_logfile "$port")" 2>&1 &
  echo $! >"$(django_pidfile "$port")"
}
start_django 8100 true "${DEVELOPER_SETTINGS_MOCKS:-false}"
start_django 8101 false false

wait_for() {
  local what="$1" tries="$2"; shift 2
  for _ in $(seq 1 "$tries"); do
    if "$@"; then log "ready: $what"; return 0; fi
    sleep 1
  done
  die "$what not ready after ${tries}s"
}
authsvc_ready() { [ "$(http_code http://127.0.0.1:18080/readyz)" = 200 ]; }
envoy_sees_authsvc() { curl -s -m 2 http://127.0.0.1:19000/clusters | grep -q '^authsvc::.*::health_flags::healthy$'; }
django_up() { [ "$(http_code "http://127.0.0.1:$1/api/texts/Genesis.1.1" 60)" = 200 ]; }
site_up() { [ "$(curl -s -o /dev/null -m 60 -w '%{http_code}' -H 'Host: www.gateway.test:10080' \
  http://127.0.0.1:10080/api/texts/Genesis.1.1)" = 200 ]; }

wait_for "authsvc /readyz" 60 authsvc_ready
wait_for "Envoy health check on authsvc" 30 envoy_sees_authsvc
wait_for "Django :8100" 120 django_up 8100
wait_for "Django :8101" 120 django_up 8101
wait_for "www.gateway.test through Envoy and nginx" 60 site_up

"$STACK_DIR/status.sh"
