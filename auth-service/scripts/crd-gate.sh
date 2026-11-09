#!/usr/bin/env bash
# auth-service/scripts/crd-gate.sh <context> — does the installed Envoy Gateway expose every field the chart's gateway
# templates use? Read-only (kubectl get/explain). Run it once per cluster before the first `authService.enabled: true`
# there: a field the CRD does not know is dropped or rejected, and a rejected policy turns the route into a 500.
# Field list: templates/gateway/{securitypolicy,clienttrafficpolicy,httproute-http-redirect,extensionpolicy}.yaml;
# the rate-limit fields (backendtrafficpolicy-auth.yaml) are optional, since phase 1 ships with rate limits off.
set -uo pipefail
CTX=${1:?usage: crd-gate.sh <kube context>}
K="kubectl --context $CTX"
echo "envoy-gateway image: $($K -n envoy-gateway-system get deploy envoy-gateway -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo unknown)"
echo "gateway-api crds:    $($K get crd httproutes.gateway.networking.k8s.io -o jsonpath='{.metadata.annotations.gateway\.networking\.k8s\.io/bundle-version}' 2>/dev/null || echo unknown)"
rc=0
check() { # <resource.field.path> <required:yes|no> <note>
  if $K explain "$1" >/dev/null 2>&1; then printf 'PRESENT  %-72s %s\n' "$1" "$3"; else printf 'MISSING  %-72s %s\n' "$1" "$3"; [ "$2" = yes ] && rc=1; fi
}
check securitypolicy.spec.targetRefs                                     yes "[EG >=1.1] targetRef is deprecated"
check securitypolicy.spec.extAuth.grpc.backendRefs                       yes "[EG >=1.1] backendRef is deprecated"
check securitypolicy.spec.extAuth.headersToExtAuth                       yes "only x-api-key, authorization, origin"
check securitypolicy.spec.extAuth.failOpen                               yes "auth service down -> anonymous tier"
check securitypolicy.spec.extAuth.timeout                                yes "default 10s -- must be set"
check clienttrafficpolicy.spec.targetRefs.sectionName                    yes "per-listener policy: a Gateway-wide target is rejected on the shared port-80 listeners"
check clienttrafficpolicy.spec.headers.earlyRequestHeaders.remove        yes "strips client-sent x-sefaria-* before ext_authz"
check clienttrafficpolicy.spec.clientIPDetection.xForwardedFor.numTrustedHops yes "client IP behind the load balancer"
check clienttrafficpolicy.spec.path.escapedSlashesAction                 yes "escaped-slash handling of gated paths"
check envoyextensionpolicy.spec.lua                                      yes "the chart's Lua filter"
check httproute.spec.rules.filters.requestRedirect.scheme                yes "port 80 -> https redirect route"
check backendtrafficpolicy.spec.rateLimit.global.rules.limit             no  "rate limits (authService.rateLimit, off in phase 1)"
check backendtrafficpolicy.spec.rateLimit.global.rules.shared            no  "[EG >=1.3] one counter across hosts and route matches"
check backendtrafficpolicy.spec.rateLimit.global.rules.clientSelectors.headers.invert no "[EG >=1.8] the missing-or-malformed tier catch-all"
[ $rc = 0 ] && echo "crd-gate: PASS" || echo "crd-gate: FAIL (a required field is missing from the installed CRDs)"
exit $rc
