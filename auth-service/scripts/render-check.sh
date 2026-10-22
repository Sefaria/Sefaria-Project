#!/usr/bin/env bash
# scripts/render-check.sh <rendered.yaml> — assertions on a `helm template` output with authService enabled.
# Pair with a second render with authService.enabled=false (see Makefile helm-render).
set -euo pipefail
R=${1:?rendered yaml}
count() { yq -N "select(.kind == \"$1\" and (.metadata.name | test(\"$2\"))) | .metadata.name" "$R" | grep -c . || true; }
assert() { [ "$1" = "$2" ] || { echo "FAIL: $3 (got $1, want $2)"; exit 1; }; echo "ok: $3"; }
E=${ENV:-authpoc}
assert "$(count Deployment "^$E-auth-service")" 1 "<env>-auth-service deployment"
assert "$(count Deployment 'postgres')" 0 "no chart-managed Postgres (the registry is the cluster's shared database)"
assert "$(yq 'select(.kind == "Deployment" and .metadata.name == "'"$E"'-auth-service") | .spec.template.spec.containers[0].env[] | select(.name == "PG_DSN") | .valueFrom.secretKeyRef.name' "$R")" auth-service-registry "PG_DSN from the cluster registry Secret"
assert "$(count Deployment '^auth-service-')" 0 "no workload named <svc>-<env> (workloads are <env>-<svc>)"
assert "$(count Service '^auth-service-')" 1 "auth-service service"
assert "$(count SecurityPolicy '-auth$')" 1 "one route-wide SecurityPolicy"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.targetRefs[0].kind' "$R" | sort -u)" HTTPRoute "SecurityPolicy targets the HTTPRoute"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.extAuth.timeout' "$R" | sort -u)" 200ms "ext_authz timeout is explicit"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.extAuth.bodyToExtAuth' "$R" | sort -u)" null "no route-wide bodyToExtAuth"
assert "$(yq 'select(.kind == "SecurityPolicy") | .spec.jwt' "$R" | sort -u)" null "no jwt block (Phase 1 is ext_authz only)"
assert "$(yq 'select(.kind == "ClientTrafficPolicy") | .spec.headers.earlyRequestHeaders.remove | join(",")' "$R")" "x-sefaria-tier,x-sefaria-project,x-sefaria-auth-result,x-sefaria-meter" "client-sent x-sefaria-* stripped at the listener"
# The ClientTrafficPolicy must attach to HTTPS listeners one by one: Envoy Gateway rejects a policy that targets port-80
# listeners (they are shared by every environment's Gateway) or the whole Gateway, and then the header strip and the
# client IP detection are not applied at all.
LISTENERS='select(.kind == "Gateway") | .spec.listeners[]'
CTP='select(.kind == "ClientTrafficPolicy")'
assert "$(yq "$CTP | .spec.targetRef" "$R")" null "ClientTrafficPolicy uses targetRefs, not the deprecated targetRef"
assert "$(yq "$CTP | .spec.targetRefs[] | select(.sectionName == null) | .name" "$R" | grep -c . || true)" 0 "every ClientTrafficPolicy targetRef names a listener (sectionName)"
HTTPS_LISTENERS=$(yq "$LISTENERS | select(.protocol == \"HTTPS\" and .port == 443) | .name" "$R" | sort | paste -sd, -)
assert "$(yq "$CTP | .spec.targetRefs[].sectionName" "$R" | sort | paste -sd, -)" "$HTTPS_LISTENERS" "the ClientTrafficPolicy targets exactly the HTTPS (443) listeners, none on port 80"
assert "$(yq "$CTP | .spec.targetRefs[].sectionName" "$R" | grep -c '^http-' || true)" 0 "no ClientTrafficPolicy targetRef is a port-80 listener"
assert "$(yq 'select(.kind == "HTTPRoute" and .metadata.name == "'"$E"'") | .spec.parentRefs[].sectionName' "$R" | sort | paste -sd, -)" "$HTTPS_LISTENERS" "the app HTTPRoute is served on the HTTPS listeners only"
HTTP_LISTENERS=$(yq "$LISTENERS | select(.port == 80) | .name" "$R" | sort | paste -sd, -)
assert "$(yq 'select(.kind == "HTTPRoute" and .metadata.name == "'"$E"'-http-redirect") | .spec.parentRefs[].sectionName' "$R" | sort | paste -sd, -)" "$HTTP_LISTENERS" "port 80 serves only the redirect route"
assert "$(yq 'select(.kind == "HTTPRoute" and .metadata.name == "'"$E"'-http-redirect") | .spec.rules[0].filters[0].requestRedirect.scheme' "$R")" https "the port-80 route redirects to https"
assert "$(yq 'select(.kind == "Deployment" and .metadata.name == "'"$E"'-auth-service") | .spec.template.spec.containers[0].image' "$R" | grep -c ':latest$' || true)" 0 "auth-service image is not :latest"
assert "$(yq 'select(.kind == "Service" and .metadata.name == "auth-service-'"${ENV:-authpoc}"'") | .spec.ports[].name' "$R" | paste -sd, -)" "http,grpc" "named service ports"
grep -q 'cert-manager.io/cluster-issuer' <(yq 'select(.kind == "SecurityPolicy" or (.kind == "Deployment" and (.metadata.name | test("auth-service"))))' "$R") && { echo "FAIL: cluster-issuer annotation on a new object"; exit 1; } || echo "ok: no new cert-manager annotations"
