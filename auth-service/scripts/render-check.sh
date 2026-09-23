#!/usr/bin/env bash
# scripts/render-check.sh <rendered.yaml> — assertions on a `helm template` output with authService enabled.
# Pair with a second render with authService.enabled=false (see Makefile helm-render / Task 13).
set -euo pipefail
R=${1:?rendered yaml}
count() { yq -N "select(.kind == \"$1\" and (.metadata.name | test(\"$2\"))) | .metadata.name" "$R" | grep -c . || true; }
assert() { [ "$1" = "$2" ] || { echo "FAIL: $3 (got $1, want $2)"; exit 1; }; echo "ok: $3"; }
E=${ENV:-authpoc}
assert "$(count Deployment "^$E-auth-service")" 1 "<env>-auth-service deployment"
assert "$(count Deployment 'postgres')" 0 "no chart-managed Postgres (the registry is the cluster's shared database)"
assert "$(yq 'select(.kind == "Deployment" and .metadata.name == "'"$E"'-auth-service") | .spec.template.spec.containers[0].env[] | select(.name == "PG_DSN") | .valueFrom.secretKeyRef.name' "$R")" auth-service-registry "PG_DSN from the cluster registry Secret"
assert "$(count Deployment "^$E-mint\$")" 1 "<env>-mint stub deployment"
assert "$(count Deployment '^(auth-service|mint)-')" 0 "no workload named <svc>-<env> (workloads are <env>-<svc>)"
assert "$(count Service '^auth-service-')" 2 "auth-service and headless services"
assert "$(count SecurityPolicy '-auth$')" 1 "one route-wide SecurityPolicy"
assert "$(count BackendTrafficPolicy '-auth-ratelimit$')" 1 "one rate-limit BackendTrafficPolicy"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.targetRefs[0].kind' "$R" | sort -u)" HTTPRoute "SecurityPolicy targets the HTTPRoute"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.extAuth.timeout' "$R" | sort -u)" 200ms "ext_authz timeout is explicit"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.extAuth.bodyToExtAuth' "$R" | sort -u)" null "no route-wide bodyToExtAuth (D15)"
assert "$(yq 'select(.kind == "Service" and .metadata.name == "auth-service-'"${ENV:-authpoc}"'") | .spec.ports[].name' "$R" | paste -sd, -)" "http,grpc" "named service ports"
assert "$(yq -N 'select(.kind == "ConfigMap" and (.metadata.name | test("^nginx-conf-"))) | .data["nginx.template.conf"]' "$R" | grep -c 'sefariaAuthResult')" 1 "nginx log fields rendered"
grep -q 'cert-manager.io/cluster-issuer' <(yq 'select(.kind == "SecurityPolicy" or .kind == "BackendTrafficPolicy" or (.kind == "Deployment" and (.metadata.name | test("auth-service|mint"))))' "$R") && { echo "FAIL: cluster-issuer annotation on a new object"; exit 1; } || echo "ok: no new cert-manager annotations"
