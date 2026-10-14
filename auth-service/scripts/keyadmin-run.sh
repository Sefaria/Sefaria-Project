#!/usr/bin/env bash
# scripts/keyadmin-run.sh — source this; `keyadmin_run <keyadmin args…>` runs the keyadmin binary from the cauldron's
# own auth-service image as a one-off pod. The auth service's DSN is a read-only role, so KEYADMIN_DSN_SECRET must
# name a Secret (key AUTH_PG_DSN) whose role can write powered_by_project and powered_by_apikey.
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
ENV=${ENV:-authpoc}
_kk() { kubectl --context "$CTX" -n default "$@"; }
keyadmin_run() {
  local img dsn
  : "${KEYADMIN_DSN_SECRET:?set KEYADMIN_DSN_SECRET to a Secret holding a registry-writer DSN (AUTH_PG_DSN)}"
  img=$(_kk get deploy "$ENV-auth-service" -o jsonpath='{.spec.template.spec.containers[0].image}')
  dsn=$(_kk get secret "$KEYADMIN_DSN_SECRET" -o jsonpath='{.data.AUTH_PG_DSN}' | base64 -d)
  _kk run "keyadmin-$RANDOM" --rm -i --restart=Never --image="$img" --command \
    --env="PG_DSN=$dsn" -- /keyadmin "$@"
}
