#!/usr/bin/env bash
# scripts/crd-gate.sh <context> — does the installed Envoy Gateway expose the fields the chart templates use?
# Source of the field list: this plan's Task 11 templates. [EG >= x.y] annotations are the minimum versions.
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
check securitypolicy.spec.extAuth.http.backendRefs                       yes ""
check securitypolicy.spec.extAuth.http.headersToBackend                  yes "HTTP transport only"
check securitypolicy.spec.extAuth.headersToExtAuth                       yes ""
check securitypolicy.spec.extAuth.failOpen                               yes "v2 4"
check securitypolicy.spec.extAuth.timeout                                yes "default 10s -- must be set"
check securitypolicy.spec.extAuth.bodyToExtAuth.maxRequestBytes          no  "[EG >=1.3] never route-wide (D15)"
check securitypolicy.spec.jwt.optional                                   yes "allow_missing"
check securitypolicy.spec.jwt.failOpen                                   no  "[EG >=1.9] allow_missing_or_failed -- Task 20 branches on this"
check securitypolicy.spec.jwt.providers.remoteJWKS.cacheDuration         yes "[EG >=1.6]"
check securitypolicy.spec.jwt.providers.remoteJWKS.backendRefs           yes ""
check securitypolicy.spec.jwt.providers.claimToHeaders                   yes ""
check securitypolicy.spec.jwt.providers.extractFrom.cookies              no  "first-party cookie transport -- Task 20"
check backendtrafficpolicy.spec.rateLimit.global.rules.clientSelectors.headers.type yes "Exact|Distinct|RegularExpression"
check backendtrafficpolicy.spec.rateLimit.global.rules.clientSelectors.sourceCIDR.type yes "Distinct"
check backendtrafficpolicy.spec.rateLimit.global.rules.shared            no  ""
check backendtrafficpolicy.spec.responseOverride.match.statusCodes       yes "[EG >=1.2]"
check backendtrafficpolicy.spec.responseOverride.response.header         yes "Retry-After"
check backendtrafficpolicy.spec.responseOverride.source                  no  "[EG >=1.8] Local -- without it upstream 429s are rewritten too"
check backendtrafficpolicy.spec.rateLimit.global.rules.xRateLimitHeaders no  "[EG >=1.9] per-rule"
check clienttrafficpolicy.spec.headers.disableRateLimitHeaders           no  "listener-level off switch"
exit $rc
