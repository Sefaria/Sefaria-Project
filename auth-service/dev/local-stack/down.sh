#!/usr/bin/env bash
# Stops the local API-keys stack: both Django servers this stack started, then only the sefaria-apikeys-stack
# compose project's containers, networks and (unless --keep-data) its Postgres volume.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

for port in "${DJANGO_PORTS[@]}"; do
  pid="$(django_pid "$port")"
  if [ -n "$pid" ]; then
    log "stop Django :$port (pid $pid)"
    kill "$pid"
    for _ in $(seq 1 50); do ps -p "$pid" >/dev/null 2>&1 || break; sleep 0.2; done
  fi
  rm -f "$(django_pidfile "$port")"
done

if [ "${1:-}" = "--keep-data" ]; then
  compose down --remove-orphans
else
  compose down --volumes --remove-orphans
fi

left="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" -q | wc -l | tr -d ' ')"
[ "$left" = 0 ] || die "$left container(s) of $PROJECT still exist"
log "down: no $PROJECT containers left"
