# Shared by up.sh, down.sh, status.sh and envoy-variant.sh. Sourced, not run.
STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$STACK_DIR/../../.." && pwd)"
PROJECT=sefaria-apikeys-stack
STATE_DIR="${APIKEYS_STACK_STATE_DIR:-$REPO/.claude/scratch/apikeys-stack}"
export STACK_RUN_DIR="$STATE_DIR/run"
if [ -z "${APIKEYS_STACK_PYTHON:-}" ] && [ -x "$REPO/.venv/bin/python" ]; then APIKEYS_STACK_PYTHON="$REPO/.venv/bin/python"; fi
PYTHON="${APIKEYS_STACK_PYTHON:-$HOME/.pyenv/versions/senv/bin/python}"
export APIKEYS_STACK_PYTHON="$PYTHON"
DJANGO_PORTS=(8100 8101)

# Where host Django listens, and what containers resolve host.docker.internal to. Docker Desktop forwards
# host.docker.internal to the host's 127.0.0.1. Plain Docker on Linux routes it to the docker0 bridge address, where a
# server bound to 127.0.0.1 is unreachable, so there Django binds to the bridge gateway address instead (reachable from
# this host and its containers, not from the network) and the containers map host.docker.internal to it explicitly.
# Override with APIKEYS_STACK_DJANGO_BIND.
if [ -z "${APIKEYS_STACK_DJANGO_BIND:-}" ] && [ "$(uname -s)" = Linux ] \
    && ! docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -q 'Docker Desktop'; then
  APIKEYS_STACK_DJANGO_BIND="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
fi
DJANGO_BIND="${APIKEYS_STACK_DJANGO_BIND:-127.0.0.1}"
if [ "$DJANGO_BIND" = 127.0.0.1 ]; then STACK_HOST_GATEWAY=host-gateway; else STACK_HOST_GATEWAY="$DJANGO_BIND"; fi
export STACK_HOST_GATEWAY

compose() { docker compose -p "$PROJECT" -f "$STACK_DIR/docker-compose.yml" "$@"; }

# Django with the stack's settings wrapper. FRONT_END_URL would point STATIC_URL at another host; CI_RUN swaps the
# settings module underneath the wrapper.
django_env() {
  env -u FRONT_END_URL -u CI_RUN PYTHONPATH="$STACK_DIR" DJANGO_SETTINGS_MODULE=django_settings "$@"
}
manage() { (cd "$REPO" && django_env "$PYTHON" manage.py "$@"); }

django_pidfile() { echo "$STATE_DIR/django-$1.pid"; }
django_logfile() { echo "$STATE_DIR/django-$1.log"; }

# Prints the pid of our runserver on $1, or nothing. Trusts the pid file only when that process is our runserver.
django_pid() {
  local f; f="$(django_pidfile "$1")"
  [ -f "$f" ] || return 0
  local pid; pid="$(cat "$f")"
  if ps -p "$pid" -o command= 2>/dev/null | grep -q "manage.py runserver $DJANGO_BIND:$1"; then
    echo "$pid"
  fi
}

http_code() { curl -s -o /dev/null -m "${2:-5}" -w '%{http_code}' "$1" || true; }

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
