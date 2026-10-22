#!/usr/bin/env bash
# scripts/crd-gate.sh <context> — does the installed Envoy Gateway expose the fields the chart templates use?
# Source of the field list: templates/gateway/securitypolicy.yaml. [EG >= x.y] annotations are the minimum versions.
set -uo pipefail
CTX=${1:?context}
K="kubectl --context $CTX"
echo "envoy-gateway image: $($K -n envoy-gateway-system get deploy envoy-gateway -o jsonpath='{.spec.template.spec.containers[0].image}')"
echo "gateway-api crds:    $($K get crd httproutes.gateway.networking.k8s.io -o jsonpath='{.metadata.annotations.gateway\.networking\.k8s\.io/bundle-version}')"
rc=0
check() { # <resource.field.path> <required:yes|no> <note>
  if $K explain "$1" >/dev/null 2>&1; then printf 'PRESENT  %-72s %s\n' "$1" "$3"; else printf 'MISSING  %-72s %s\n' "$1" "$3"; [ "$2" = yes ] && rc=1; fi
}
check securitypolicy.spec.targetRefs                                     yes "[EG >=1.1] targetRef is deprecated"
check securitypolicy.spec.extAuth.grpc.backendRefs                       yes "[EG >=1.1] backendRef is deprecated"
check securitypolicy.spec.extAuth.headersToExtAuth                       yes ""
check securitypolicy.spec.extAuth.failOpen                               yes "auth service down -> anonymous tier"
check securitypolicy.spec.extAuth.timeout                                yes "default 10s -- must be set"
check clienttrafficpolicy.spec.headers.earlyRequestHeaders.remove        yes "strips client-sent x-sefaria-* before ext_authz"
check clienttrafficpolicy.spec.targetRefs.sectionName                    yes "per-listener policy: a Gateway-wide target is rejected on the shared port-80 listeners"
check backendtrafficpolicy.spec.rateLimit.global.rules.limit.fromMetadata   no  "[EG >=1.9] per-project limits from ext_authz metadata (authService.rateLimit)"
check backendtrafficpolicy.spec.rateLimit.global.rules.shared            no  "[EG >=1.3] one counter across hosts and route matches"
check backendtrafficpolicy.spec.rateLimit.global.rules.clientSelectors.headers.invert no "[EG >=1.8] the missing-or-malformed tier catch-all"
check backendtrafficpolicy.spec.rateLimit.global.rules.clientSelectors.path no "[seen on EG 1.9.1] rules 3-4 count API paths only (authService.rateLimit.apiPathPrefix)"
exit $rc
