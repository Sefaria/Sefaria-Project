#!/usr/bin/env bash
# scripts/drill-jwks-down.sh — cacheDuration is 300s; watch for 6 minutes.
set -uo pipefail; source scripts/lib-drill.sh
$K port-forward svc/mint-authpoc 18081:8081 & PF=$!; sleep 2
T=$(curl -s 'localhost:18081/token?sub=web&tier=firstparty&ttl=7200' | jq -r .token); kill $PF
H=www.authpoc.cauldron.sefaria.org; A=(-H "Authorization: Bearer $T")
echo BEFORE; sample $H "${A[@]}"; echo "tier=$(tier_seen)"
$K scale deploy/mint-authpoc --replicas=0; $K wait --for=delete pod -l app=mint-authpoc --timeout=60s
echo DURING; watch_for 360 $H "${A[@]}"
$K scale deploy/mint-authpoc --replicas=1; $K rollout status deploy/mint-authpoc; sleep 20
echo "AFTER (old token is signed by a key the restarted stub no longer has — expect failure for that reason):"; sample $H "${A[@]}"
$K port-forward svc/mint-authpoc 18081:8081 & PF=$!; sleep 2; T2=$(curl -s 'localhost:18081/token?sub=web&tier=firstparty' | jq -r .token); kill $PF
echo "AFTER-new-token:"; sample $H -H "Authorization: Bearer $T2"; echo "tier=$(tier_seen)"
