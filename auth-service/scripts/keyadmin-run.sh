#!/usr/bin/env bash
# scripts/keyadmin-run.sh — source this; `keyadmin_run <keyadmin args…>` runs the keyadmin binary from the cauldron's
# own auth-service image as a one-off pod (plan Task 17 step 4; sourced by Tasks 23–25).
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
ENV=${ENV:-authpoc}
_kk() { kubectl --context "$CTX" -n default "$@"; }
keyadmin_run() {
  local img dsn push
  img=$(_kk get deploy "$ENV-auth-service" -o jsonpath='{.spec.template.spec.containers[0].image}')
  dsn=$(_kk get secret "auth-service-pg-$ENV" -o jsonpath='{.data.AUTH_PG_DSN}' | base64 -d)
  push=$(_kk get endpoints "auth-service-$ENV-headless" -o jsonpath='{range .subsets[0].addresses[*]}http://{.ip}:8080/internal/keys/apply,{end}' | sed 's/,$//')
  _kk run "keyadmin-$RANDOM" --rm -i --restart=Never --image="$img" --command \
    --env="PG_DSN=$dsn" --env="REDIS_ADDR=redis-$ENV:6379" --env="HTTP_PUSH_URLS=$push" \
    -- /keyadmin "$@"
}
