#!/usr/bin/env bash
# scripts/lib-drill.sh — sourced by every drill
K="kubectl --context gke_development-205018_us-east1-b_cluster-1 -n default"
sample() { # host [curl args...] -> "code"
  local h=$1; shift
  curl -s -m 5 -o /dev/null -w '%{http_code}' "https://$h/api/texts/Genesis.1" -H 'x-probe: drill' "$@"; echo
}
watch_for() { # seconds host [curl args...]
  local secs=$1; shift; local t=0
  while [ "$t" -le "$secs" ]; do printf 't=%-4s code=%s\n' "$t" "$(sample "$@")"; sleep 2; t=$((t+2)); done
}
tier_seen() { $K logs -l app=nginx-authpoc --since=10s 2>/dev/null | grep -a '"probe": "drill"' | tail -1 | jq -r '.sefariaTier // "-"'; }
