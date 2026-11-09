#!/usr/bin/env bash
# auth-service/scripts/policy-gate.sh — exits 0 only when Envoy Gateway accepted every gateway object the auth service
# relies on, on every ancestor. Read-only: kubectl get, nothing else.
#
# Envoy Gateway does not fail open on a rejected policy: a rejected SecurityPolicy turns the whole route into a 500, and
# a rejected ClientTrafficPolicy silently drops the x-sefaria-* header strip (forged tiers reach nginx). Run it after
# every rollout or flag flip that touches the chart's gateway objects, in every environment.
#
#   CTX=<kube context> NS=<namespace> ENV=<deployEnv> auth-service/scripts/policy-gate.sh
#   e.g. preprod:  CTX=<prod cluster context> NS=preprod ENV=preprod
#        prod:     CTX=<prod cluster context> NS=default ENV=production
#        cauldron: CTX=gke_development-205018_us-east1-b_cluster-1 NS=default ENV=<cauldron>
#
# Checked: SecurityPolicy <env>-auth (required: the auth service is on), ClientTrafficPolicy <env> (required: the header
# strip), HTTPRoute <env> and <env>-http-redirect (Accepted and ResolvedRefs on every parent), EnvoyExtensionPolicy
# <env> and BackendTrafficPolicy <env>-auth-ratelimit (each when deployed).
set -uo pipefail
CTX=${CTX:?set CTX to the kube context (no default, so a gate never reads the wrong cluster)}
NS=${NS:?set NS to the namespace}
ENV=${ENV:?set ENV to the deployEnv (the Gateway and HTTPRoute name)}
rc=0
k() { kubectl --context "$CTX" -n "$NS" get "$@" 2>/dev/null; }

# verdict <label> <statuses> : statuses are the space-separated condition values over every ancestor or parent.
verdict() {
  if [[ -z $2 ]]; then echo "FAIL $1: no status yet"; rc=1; return; fi
  if [[ " $2 " == *" False "* || " $2 " == *" Unknown "* ]]; then echo "FAIL $1: [$2]"; rc=1; return; fi
  echo "ok   $1: [$2]"
}

# policy <kind> <name> <required|optional>: Accepted on every ancestor.
policy() {
  local statuses
  if ! statuses=$(k "$1" "$2" -o 'jsonpath={.status.ancestors[*].conditions[?(@.type=="Accepted")].status}'); then
    if [[ $3 == required ]]; then echo "FAIL $1/$2: not found"; rc=1; else echo "skip $1/$2: not deployed"; fi
    return
  fi
  verdict "$1/$2 Accepted" "$statuses"
}

# route <name>: Accepted and ResolvedRefs on every parent (a missing backend Service shows as ResolvedRefs=False).
route() {
  local accepted resolved
  if ! accepted=$(k httproute "$1" -o 'jsonpath={.status.parents[*].conditions[?(@.type=="Accepted")].status}'); then
    echo "FAIL httproute/$1: not found"; rc=1; return
  fi
  resolved=$(k httproute "$1" -o 'jsonpath={.status.parents[*].conditions[?(@.type=="ResolvedRefs")].status}')
  verdict "httproute/$1 Accepted" "$accepted"
  verdict "httproute/$1 ResolvedRefs" "$resolved"
}

echo "policy-gate: context $CTX, namespace $NS, environment $ENV"
policy securitypolicy "$ENV-auth" required
policy clienttrafficpolicy "$ENV" required
policy envoyextensionpolicy "$ENV" optional
policy backendtrafficpolicy "$ENV-auth-ratelimit" optional
route "$ENV"
route "$ENV-http-redirect"
[ $rc = 0 ] && echo "policy-gate: PASS" || echo "policy-gate: FAIL (a rejected policy makes the route return 500; roll back with authService.enabled=false)"
exit $rc
