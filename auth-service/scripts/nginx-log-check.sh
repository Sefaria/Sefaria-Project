#!/usr/bin/env bash
# scripts/nginx-log-check.sh <env> <since-seconds> — what the backend (nginx, first hop after Envoy) saw.
set -uo pipefail
ENV=${1:-authpoc}; SINCE=${2:-120}
kubectl --context gke_development-205018_us-east1-b_cluster-1 -n default logs -l app=nginx-"$ENV" --since="${SINCE}"s --all-containers --prefix=false 2>/dev/null \
 | grep -a '"probe"' | jq -r 'select(.probe != "" and .probe != "-") | "probe=\(.probe) status=\(.httpRequest.status) tier=\(.sefariaTier // "-") project=\(.sefariaProject // "-") result=\(.sefariaAuthResult // "-") origin=\(.origin // "-") url=\(.httpRequest.requestUrl)"' \
 | sort -u
