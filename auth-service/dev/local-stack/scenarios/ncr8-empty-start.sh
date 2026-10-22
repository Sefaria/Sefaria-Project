#!/usr/bin/env bash
# N-CR8: the auth service starts against a reachable database whose key table is empty (wrong DSN or database, a
# fresh restore), and, separately, its first load fails. Desired: no valid key is ever denied because of it; either
# the pod stays not ready, or Check answers UNAVAILABLE so Envoy fails open.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up
new_key ncr8
wait_for 5 'test "$(gw $GW_HC $GATED ncr8)" = 200' >/dev/null
check N-CR8 "key valid against the real registry" "$(gw $GW_HC $GATED ncr8)" 200

if [ "$(psql_su -c "SELECT count(*) FROM pg_database WHERE datname = 'sefaria_auth_empty'")" = 0 ]; then
  psql_su -c "CREATE DATABASE sefaria_auth_empty" >/dev/null
  dcompose exec -T pg sh -c 'pg_dump -U postgres -s sefaria_auth | psql -q -U postgres -d sefaria_auth_empty' >/dev/null
  sed 's/DATABASE sefaria_auth /DATABASE sefaria_auth_empty /' "$STACK_DIR/provision.sql" \
    | dcompose exec -T pg psql -q -U postgres -d sefaria_auth_empty -v ON_ERROR_STOP=1 >/dev/null
fi
check N-CR8 "the empty database has no keys" "$(PGDB=sefaria_auth_empty psql_su -c 'SELECT count(*) FROM powered_by_apikey')" 0

# 1. Reachable but empty: the first load succeeds with 0 keys and the pod reports ready.
authsvc_recreate "PG_DSN=postgres://auth_service_reader:reader@pg:5432/sefaria_auth_empty?sslmode=disable"
check N-CR8 "empty start: registry len" "$(registry_field len)" 0
s="$(gw $GW_HC $GATED ncr8)"; c="$(gw_code $GW_HC $GATED ncr8)"
if [ "$s" = 200 ]; then
  pass "N-CR8 empty start: a valid key fails open"
else
  gap N-CR8 "empty start: the pod is ready (/readyz $(readyz)) with 0 keys and a valid key gets $s $c through Envoy"
fi

# 2. The first load fails: the pod stays not ready. Through the health-checked listener Envoy fails open; through
# the listener without a health check (Envoy still sending to a not-ready endpoint) Check decides on an empty set.
WAIT_READY=0 authsvc_recreate "PG_DSN=postgres://auth_service_reader:reader@pg:5432/no_such_db?sslmode=disable"
sleep 2
wait_for 15 '! authsvc_endpoint_healthy' >/dev/null
check N-CR8 "failed first load: /readyz" "$(readyz)" 503
check N-CR8 "failed first load: a valid key fails open through the health-checked route" "$(gw $GW_HC $GATED ncr8)" 200
s="$(gw $GW_NOHC $GATED ncr8)"; c="$(gw_code $GW_NOHC $GATED ncr8)"
if [ "$s" = 200 ]; then
  pass "N-CR8 failed first load: Check fails open even when Envoy sends to the not-ready pod"
else
  gap N-CR8 "failed first load: Check ignores readiness; a valid key sent to the not-ready pod gets $s $c (want UNAVAILABLE, so Envoy fails open)"
fi

drill_reset
finish
