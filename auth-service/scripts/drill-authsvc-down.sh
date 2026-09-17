#!/usr/bin/env bash
# scripts/drill-authsvc-down.sh
set -uo pipefail; source scripts/lib-drill.sh
H=www.authpoc.cauldron.sefaria.org; A=(-H 'x-api-key: sfr_alpha000000000000000000000000001')
echo BEFORE; sample $H "${A[@]}"; echo "tier=$(tier_seen)"
$K scale deploy/auth-service-authpoc --replicas=0; $K wait --for=delete pod -l app=auth-service-authpoc --timeout=60s
echo DURING; watch_for 20 $H "${A[@]}"; echo "tier=$(tier_seen)"
echo DURING-unknown-key; sample $H -H 'x-api-key: sfr_unknown00000000000000000000001'
$K scale deploy/auth-service-authpoc --replicas=2; $K rollout status deploy/auth-service-authpoc
echo AFTER; sample $H "${A[@]}"; echo "tier=$(tier_seen)"
