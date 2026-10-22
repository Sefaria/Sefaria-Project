#!/usr/bin/env bash
# scripts/ratelimit-check.sh — renders the chart with rate limiting on and off and asserts the BackendTrafficPolicy
# rules, the fail-open static limits and the nginx log fields. No cluster needed (helm and yq only).
set -euo pipefail
C=${CHART:-$(cd "$(dirname "$0")/../.." && pwd)/helm-chart/sefaria}
BASE=(--set deployEnv=x --set gateway.enabled=true --set authService.enabled=true --set authService.image.tag=test)
assert() { [ "$1" = "$2" ] || { echo "FAIL: $3 (got $1, want $2)"; exit 1; }; echo "ok: $3"; }
ON=$(mktemp) OFF=$(mktemp)
trap 'rm -f "$ON" "$OFF"' EXIT
helm template x "$C" "${BASE[@]}" --set authService.rateLimit.enabled=true > "$ON"
helm template x "$C" "${BASE[@]}" > "$OFF"
RULES='select(.kind == "BackendTrafficPolicy") | .spec.rateLimit.global.rules'
assert "$(yq "$RULES | length" "$ON")" 4 "four rate-limit rules"
assert "$(yq "$RULES | map(.limit.fromMetadata.key) | join(\",\")" "$ON")" "limit_minute,limit_month_semantic,," "fromMetadata keys on rules 1-2 only"
assert "$(yq "$RULES | .[] | .limit.fromMetadata.namespace" "$ON" | grep -c '^envoy.filters.http.ext_authz$' || true)" 2 "fromMetadata namespace is ext_authz on rules 1-2"
assert "$(yq "$RULES | map(.limit.requests | tag) | unique | join(\",\")" "$ON")" '!!int' "every rule has a static numeric limit (fail-open)"
assert "$(yq "$RULES | .[1].limit.unit" "$ON")" Month "rule 2 is monthly"
assert "$(yq "$RULES | .[0].clientSelectors[0].headers[1] | .name + \":\" + .type" "$ON")" "x-sefaria-project:Distinct" "rule 1 counts per project"
assert "$(yq "$RULES | .[0].clientSelectors[0].headers[0].invert" "$ON")" true "rule 1 skips unkeyed tiers (no shared empty-project bucket)"
assert "$(yq "$RULES | map(.shared | tostring) | join(\",\")" "$ON")" "true,true,null,null" "rules 1-2 are shared across hosts and route matches"
assert "$(yq "$RULES | .[1].clientSelectors[0].headers[1] | .name + \":\" + .value" "$ON")" "x-sefaria-meter:semantic" "rule 2 selects the meter"
assert "$(yq "$RULES | .[3].clientSelectors[0].headers[0] | .name + \":\" + .type + \":\" + (.invert | tostring)" "$ON")" "x-sefaria-tier:RegularExpression:true" "rule 4 is the inverted-tier catch-all"
KEDA=(--set keda.enabled=true --set keda.splash.enabled=true)
helm template x "$C" "${BASE[@]}" "${KEDA[@]}" --set authService.rateLimit.enabled=true > "$ON"
assert "$(grep -c 'kind: BackendTrafficPolicy' "$ON" || true)" 1 "one BackendTrafficPolicy per HTTPRoute with KEDA splash and rate limiting on"
assert "$(yq 'select(.kind == "BackendTrafficPolicy") | .spec.responseOverride | length' "$ON")" 2 "splash and 429 overrides share the policy"
helm template x "$C" "${BASE[@]}" "${KEDA[@]}" > "$ON"
assert "$(grep -c 'kind: BackendTrafficPolicy' "$ON" || true)" 1 "KEDA splash policy still renders with rate limiting off"
helm template x "$C" "${BASE[@]}" --set authService.rateLimit.enabled=true > "$ON"
assert "$(grep -c 'kind: BackendTrafficPolicy' "$OFF" || true)" 0 "no BackendTrafficPolicy with rate limiting off"
assert "$(yq 'select(.kind == "ConfigMap" and .metadata.name == "nginx-conf-x") | .data["nginx.template.conf"]' "$ON" | grep -c -E 'sefariaProject|sefariaTier|sefariaAuthResult' || true)" 1 "nginx log_format has the three new fields"
assert "$(yq 'select(.kind == "Deployment" and .metadata.name == "x-auth-service") | .spec.template.spec.containers[0].env[] | select(.name == "METERED_PATHS") | .value' "$ON")" semantic=/api/knn-search "METERED_PATHS wired from authService.meters"
