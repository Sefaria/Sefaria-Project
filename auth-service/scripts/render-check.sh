#!/usr/bin/env bash
# scripts/render-check.sh <rendered.yaml> — assertions on a `helm template` output with authService enabled.
# Pair with a second render with authService.enabled=false (see Makefile helm-render / Task 13).
set -euo pipefail
R=${1:?rendered yaml}
count() { yq -N "select(.kind == \"$1\" and (.metadata.name | test(\"$2\"))) | .metadata.name" "$R" | grep -c . || true; }
assert() { [ "$1" = "$2" ] || { echo "FAIL: $3 (got $1, want $2)"; exit 1; }; echo "ok: $3"; }
assert "$(count Deployment '^auth-service-')" 2 "auth-service + builtin postgres deployments"
assert "$(count Deployment '^mint-')" 1 "mint stub deployment"
assert "$(count Service '^auth-service-')" 3 "auth-service, headless, postgres services"
assert "$(count SecurityPolicy '-auth$')" 1 "one route-wide SecurityPolicy"
assert "$(count BackendTrafficPolicy '-auth-ratelimit$')" 1 "one rate-limit BackendTrafficPolicy"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.targetRefs[0].kind' "$R" | sort -u)" HTTPRoute "SecurityPolicy targets the HTTPRoute"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.extAuth.timeout' "$R" | sort -u)" 200ms "ext_authz timeout is explicit"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.extAuth.bodyToExtAuth' "$R" | sort -u)" null "no route-wide bodyToExtAuth (D15)"
assert "$(yq 'select(.kind == "Service" and .metadata.name == "auth-service-'"${ENV:-authpoc}"'") | .spec.ports[].name' "$R" | paste -sd, -)" "http,grpc" "named service ports"
assert "$(yq -N 'select(.kind == "ConfigMap" and (.metadata.name | test("^nginx-conf-"))) | .data["nginx.template.conf"]' "$R" | grep -c 'sefariaAuthResult')" 1 "nginx log fields rendered"
assert "$(yq -N 'select(.kind == "ConfigMap" and .metadata.name == "auth-service-pg-init-'"${ENV:-authpoc}"'") | .data["01-schema.sql"]' "$R" | grep -c 'CREATE TABLE IF NOT EXISTS api_keys')" 1 "POC Postgres schema initdb ConfigMap"
assert "$(yq 'select(.kind == "Deployment" and .metadata.name == "auth-service-postgres-'"${ENV:-authpoc}"'") | .spec.template.spec.containers[0].volumeMounts[] | select(.mountPath == "/docker-entrypoint-initdb.d") | .name' "$R")" initdb "schema mounted into docker-entrypoint-initdb.d"
grep -q 'cert-manager.io/cluster-issuer' <(yq 'select(.kind == "SecurityPolicy" or .kind == "BackendTrafficPolicy" or (.kind == "Deployment" and (.metadata.name | test("auth-service|mint"))))' "$R") && { echo "FAIL: cluster-issuer annotation on a new object"; exit 1; } || echo "ok: no new cert-manager annotations"
