#!/usr/bin/env bash
# One-screen health of the local API-keys stack. Exits non-zero when a required part is down.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

bad=0
row() { printf '  %-34s %s\n' "$1" "$2"; }
check() { # name, expected code, actual code
  if [ "$3" = "$2" ]; then row "$1" "$3"; else row "$1" "$3 (want $2)"; bad=1; fi
}

echo "containers ($PROJECT):"
compose ps --format '  {{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null || { echo "  (none)"; bad=1; }

echo "auth service:"
check "/readyz" 200 "$(http_code http://127.0.0.1:18080/readyz)"
row "/internal/registry" "$(curl -s -m 3 http://127.0.0.1:18080/internal/registry || echo unreachable)"

echo "envoy (variant $(cat "$STACK_RUN_DIR/envoy.variant" 2>/dev/null || echo unknown)):"
row "authsvc endpoint" "$(curl -s -m 3 http://127.0.0.1:19000/clusters | grep '^authsvc::.*::health_flags::' | sed 's/.*::health_flags:://' || echo unreachable)"
curl -s -m 3 'http://127.0.0.1:19000/stats?filter=ext_authz\.(ok|denied|error|failure_mode_allowed)$' \
  | sed 's/^/  /' || { row stats unreachable; bad=1; }

echo "django:"
for port in "${DJANGO_PORTS[@]}"; do
  pid="$(django_pid "$port")"
  check ":$port${pid:+ (pid $pid)}" 200 "$(http_code "http://127.0.0.1:$port/api/texts/Genesis.1.1" 30)"
done

echo "routes:"
via() { curl -s -o /dev/null -m 30 -w '%{http_code}' -H "Host: $1" "http://127.0.0.1:${3:-10080}$2" || true; }
check "www.gateway.test (envoy→nginx→django)" 200 "$(via www.gateway.test:10080 /api/texts/Genesis.1.1)"
check "echo.gateway.test" 200 "$(via echo.gateway.test:10080 /)"
check "nginx direct :18088" 200 "$(via www.gateway.test:18088 /api/texts/Genesis.1.1 18088)"
check "mailpit API" 200 "$(http_code http://127.0.0.1:18025/api/v1/messages)"

exit $bad
