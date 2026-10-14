#!/usr/bin/env bash
# scripts/policy-gate.sh — exits 0 only when the environment's auth SecurityPolicy is Accepted on every ancestor.
# Envoy Gateway does not fail open on a rejected policy: a rejected policy turns the whole route into a 500.
# Run it after every rollout that touches the auth policy.
#   CTX=… NS=… ENV=authpoc scripts/policy-gate.sh
set -uo pipefail
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
NS=${NS:-default}
ENV=${ENV:-authpoc}
rc=0
# check <kind> <name> <required>: prints the verdict; a missing optional policy is fine, a missing required one is not.
check() {
  local statuses
  if ! statuses=$(kubectl --context "$CTX" -n "$NS" get "$1" "$2" -o 'jsonpath={.status.ancestors[*].conditions[?(@.type=="Accepted")].status}' 2>/dev/null); then
    if [[ $3 == required ]]; then echo "FAIL $1/$2: not found"; rc=1; else echo "skip $1/$2: not deployed"; fi
    return
  fi
  if [[ -z $statuses ]]; then echo "FAIL $1/$2: no Accepted condition yet"; rc=1; return; fi
  if [[ " $statuses " == *" False "* || " $statuses " == *" Unknown "* ]]; then echo "FAIL $1/$2: Accepted=[$statuses]"; rc=1; return; fi
  echo "ok   $1/$2: Accepted=[$statuses]"
}
check securitypolicy "$ENV-auth" required
exit $rc
