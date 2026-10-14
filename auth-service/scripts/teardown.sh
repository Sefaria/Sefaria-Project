#!/usr/bin/env bash
# scripts/teardown.sh — remove the POC cauldron. What STAYS: the infrastructure rate-limit backend PR (production shape),
# the auth-service-poc branch and its chart prerelease (Phase 1 starts from them), the wiki pages.
set -euo pipefail
CTX=gke_development-205018_us-east1-b_cluster-1
echo "1) If Task 26 step 3 ran: cauldrons/authpoc.yaml gateway.className must be back on 'envoy' and Brendan removes the authpoc GatewayClass/EnvoyProxy."
kubectl --context "$CTX" -n default get gateway authpoc -o jsonpath='{.spec.gatewayClassName}{"\n"}'
echo "2) Delete the cauldron the way every cauldron is deleted (removes the HelmRelease; Helm deletes every chart object including the policies):"
echo "   cd /Users/yotamfromm/dev/sefaria/cauldrons && ./delete-cauldron.sh --name authpoc   (human gate: commits to cauldrons/main)"
read -r -p "   Deleted and Flux reconciled? [y/N] " a; [ "$a" = y ] || exit 1
kubectl --context "$CTX" -n default get helmrelease authpoc 2>&1 | head -1
kubectl --context "$CTX" -n default get securitypolicy,backendtrafficpolicy,httproute 2>/dev/null | grep -c authpoc || true
echo "3) DNS records under *.cauldron.sefaria.org are removed by external-dns (policy: sync) within its interval."
kubectl --context "$CTX" get gateway -A | grep -v authpoc | grep -c True
