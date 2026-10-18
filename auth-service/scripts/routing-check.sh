#!/usr/bin/env bash
# scripts/routing-check.sh <rendered.yaml> <enabled|disabled> — gateway routing assertions on a `helm template` output.
# enabled: authService on, so the app is HTTPS-only (redirect route, https-* parentRefs, per-listener policy targets).
# disabled: authService off and gateway.redirectHttpToHttps off, so the default single Gateway-wide parentRef remains.
# ENV is the deployEnv of the render (default authpoc).
set -euo pipefail
R=${1:?rendered yaml}; MODE=${2:?enabled|disabled}
E=${ENV:-authpoc}
assert() { [ "$1" = "$2" ] || { echo "FAIL: $3 (got $1, want $2)"; exit 1; }; echo "ok: $3"; }
route() { yq -N "select(.kind == \"HTTPRoute\" and .metadata.name == \"$1\")" "$R"; }
refs() { route "$1" | yq '.spec.parentRefs[].sectionName' | sort -u | paste -sd, -; }
case "$MODE" in
enabled)
  names=$(refs "$E")
  assert "$(echo "$names" | tr ',' '\n' | grep -vc '^https-' || true)" 0 "app HTTPRoute parentRefs are https-* only"
  [ -n "$names" ] && [ "$names" != null ] || { echo "FAIL: app HTTPRoute has no sectionName parentRefs"; exit 1; }
  assert "$(route "$E-http-redirect" | yq '.metadata.name')" "$E-http-redirect" "redirect HTTPRoute exists"
  rnames=$(refs "$E-http-redirect")
  assert "$(echo "$rnames" | tr ',' '\n' | grep -vc '^http-' || true)" 0 "redirect route parentRefs are http-* only"
  assert "$(route "$E-http-redirect" | yq '.spec.rules[0].filters[0].type + "/" + .spec.rules[0].filters[0].requestRedirect.scheme')" RequestRedirect/https "redirect route does RequestRedirect to https"
  ctp=$(yq -N 'select(.kind == "ClientTrafficPolicy") | .spec.targetRefs[].sectionName' "$R" | sort -u | paste -sd, -)
  assert "$(echo "$ctp" | tr ',' '\n' | grep -vc '^https-' || true)" 0 "ClientTrafficPolicy targets no http-* listener"
  assert "$ctp" "$names" "ClientTrafficPolicy targets every https-* listener the app route attaches to"
  assert "$(yq -N 'select(.kind == "ClientTrafficPolicy") | .spec.targetRefs[] | select(.sectionName == null) | .name' "$R" | grep -c . || true)" 0 "every policy targetRef has a sectionName"
  ;;
disabled)
  assert "$(route "$E" | yq '.spec.parentRefs | length')" 1 "app HTTPRoute has a single parentRef"
  assert "$(route "$E" | yq '.spec.parentRefs[0].sectionName')" null "app HTTPRoute parentRef has no sectionName"
  assert "$(yq -N 'select(.kind == "HTTPRoute" and (.metadata.name | test("http-redirect")))' "$R" | grep -c . || true)" 0 "no redirect route renders"
  ;;
*) echo "mode must be enabled or disabled"; exit 2 ;;
esac
