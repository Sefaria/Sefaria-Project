#!/usr/bin/env bash
# [KG] N-E5: a bad AUTH_MODE or RELOAD_INTERVAL. Desired: the process refuses to start, and the chart or CI rejects the
# value before deploy. Today the chart renders anything, so the pod crash-loops and the host fails open.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

IMAGE=sefaria-apikeys-stack-authsvc:local
drill_up
starts() {  # starts VAR=value -> "running exitcode|panic line" of a throwaway auth service after 3 s
  local name="apikeys-d11-ne5-$RANDOM"
  docker run -d --name "$name" --network "${D11_PROJECT}_default" --read-only -e "$1" \
    -e "PG_DSN=postgres://auth_service_reader:reader@pg:5432/sefaria_auth?sslmode=disable" -e GRPC_ADDR=:19091 -e HTTP_ADDR=:18089 \
    "$IMAGE" >/dev/null
  sleep 3
  local state; state="$(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$name")"
  local last; last="$(docker logs "$name" 2>&1 | grep -m1 -E 'panic|must be' || true)"
  docker rm -f "$name" >/dev/null
  echo "$state|$last"
}
for bad in AUTH_MODE=bogus AUTH_MODE=Enforce RELOAD_INTERVAL=abc RELOAD_INTERVAL=0 RELOAD_INTERVAL=-5s RELOAD_INTERVAL=60; do
  out="$(starts "$bad")"; st="${out%%|*}"; why="${out#*|}"
  case "$st" in
    "false 0"|true*) fail "N-E5 $bad: the process keeps running ($st)" ;;
    *) pass "N-E5 $bad: the process refuses to start (exit ${st#false }: ${why:0:100})" ;;
  esac
done

# While it crash-loops, the gated path is open.
WAIT_READY=0 authsvc_recreate AUTH_MODE=bogus
wait_for 15 '! authsvc_endpoint_healthy' >/dev/null
check N-E5 "a crash-looping auth service fails the host open" "$(gw $GW_HC $GATED)" 200

# The chart should reject the value at render time.
helm_template() {
  docker run --rm -v "$REPO/helm-chart/sefaria:/chart:ro" alpine/helm:3.16.4 template x /chart --set deployEnv=x \
    --set authService.enabled=true --set authService.image.tag=test "$@" >/dev/null 2>&1
}
for setting in authService.mode=bogus authService.reloadInterval=abc authService.reloadInterval=0; do
  if helm_template --set "$setting"; then
    gap N-E5 "the chart renders $setting without complaint (no values.schema.json or fail guard)"
  else
    pass "N-E5 the chart rejects $setting"
  fi
done
helm_template --set authService.mode=enforce && pass "N-E5 the chart renders a good mode" || fail "N-E5 the chart fails on a good mode"

# Not trimmed: a space after a comma in GATED_PATHS ungates that path.
authsvc_recreate "GATED_PATHS=/api/other, /api/knn-search"
s="$(gw $GW_HC $GATED)"
[ "$s" = 401 ] && pass "N-E5 GATED_PATHS entries are trimmed" \
  || gap N-E5 "GATED_PATHS='/api/other, /api/knn-search' leaves /api/knn-search ungated ($s): entries are not trimmed"

drill_reset
finish
