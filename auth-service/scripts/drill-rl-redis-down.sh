#!/usr/bin/env bash
# scripts/drill-rl-redis-down.sh
set -uo pipefail; source scripts/lib-drill.sh
H=www.authpoc.cauldron.sefaria.org; A=(-H 'x-api-key: sfr_alpha000000000000000000000000001'); EG="kubectl --context gke_development-205018_us-east1-b_cluster-1 -n envoy-gateway-system"
echo BEFORE-burst; for _ in $(seq 1 15); do sample $H "${A[@]}"; done | sort | uniq -c
$EG scale deploy/envoy-ratelimit-redis --replicas=0; $EG wait --for=delete pod -l app=envoy-ratelimit-redis --timeout=60s; sleep 5
echo DURING-burst; for _ in $(seq 1 15); do sample $H "${A[@]}"; done | sort | uniq -c
$EG logs deploy/envoy-ratelimit --since=1m | grep -ci 'redis'
$EG scale deploy/envoy-ratelimit-redis --replicas=1; $EG rollout status deploy/envoy-ratelimit-redis; sleep 65
echo AFTER-burst; for _ in $(seq 1 15); do sample $H "${A[@]}"; done | sort | uniq -c
