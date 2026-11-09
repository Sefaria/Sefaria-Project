#!/usr/bin/env bash
# E1: /internal/registry and /metrics after a restart and after NOTIFY. len equals the rows of the load query
# (revoked included), version goes up by one per applied reload, loaded_at moves.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

drill_up RELOAD_INTERVAL=1h
new_key e1-revoked; revoke_key e1-revoked
wait_for 5 'test "$(registry_field len)" = "$(load_query_rows)"' >/dev/null
check E1 "len equals load-query rows, revoked included" "$(registry_field len)" "$(load_query_rows)"
check E1 "authsvc_registry_keys equals len" "$(metric authsvc_registry_keys)" "$(registry_field len)"
check E1 "authsvc_registry_version equals version" "$(metric authsvc_registry_version)" "$(registry_field version)"

v0="$(registry_field version)"; l0="$(registry_field loaded_at)"; n0="$(registry_field len)"
new_key e1-a
t="$(wait_for 3 'test "$(registry_field version)" -gt "$v0"')"
check E1 "one INSERT gives exactly one reload" "$(registry_field version)" "$((v0 + 1))"
info "E1 NOTIFY reload visible after ${t}s"
check E1 "len grows by one" "$(registry_field len)" "$((n0 + 1))"
[ "$(registry_field loaded_at)" != "$l0" ] && pass "E1 loaded_at moves on reload" || fail "E1 loaded_at did not move"
check E1 "new key accepted on the gated path" "$(gw $GW_HC $GATED e1-a)" 200

v1="$(registry_field version)"
psql_su -c "BEGIN; UPDATE powered_by_apikey SET label = label || '-x' WHERE label IN ('e1-a','e1-revoked');
            UPDATE powered_by_apikey SET label = regexp_replace(label, '-x$', '') WHERE label LIKE 'e1-%-x'; COMMIT" >/dev/null
sleep 1.5
v2="$(registry_field version)"
[ "$v2" -ge $((v1 + 1)) ] && [ "$v2" -le $((v1 + 2)) ] && pass "E1 one transaction with four row NOTIFYs coalesces to one or two reloads (+$((v2 - v1)))" \
  || fail "E1 transaction reloads: version went $v1 -> $v2"

v3="$(registry_field version)"
psql_su -c "UPDATE powered_by_apikey SET last_used_at = now() WHERE label = 'e1-a'" >/dev/null
sleep 1.5
check E1 "a last_used_at write does not reload" "$(registry_field version)" "$v3"

n_before="$(registry_field len)"; l_before="$(registry_field loaded_at)"
dcompose restart authsvc >/dev/null 2>&1
wait_for 20 'test "$(readyz)" = 200' >/dev/null
check E1 "after restart len is unchanged" "$(registry_field len)" "$n_before"
[ "$(registry_field loaded_at)" != "$l_before" ] && pass "E1 loaded_at moves after restart" || fail "E1 loaded_at did not move after restart"
notify_ok() { metric 'authsvc_notify_reload_total{result="ok"}'; }
wait_for 5 'test "$(notify_ok)" -ge 1' >/dev/null
check E1 "after restart version = 1 (initial load) + on-connect NOTIFY reloads" "$(registry_field version)" "$((1 + $(notify_ok)))"
check E1 "after restart reload_total{ok} equals version" "$(metric 'authsvc_reload_total{result="ok"}')" "$(registry_field version)"

# The shared stack, read-only: its auth service agrees with its database. Other suites write there, so retry.
ok=0
for _ in 1 2 3 4 5; do
  a="$(curl -s -m 3 http://127.0.0.1:18080/internal/registry | python3 -c 'import json,sys; print(json.load(sys.stdin)["len"])')"
  b="$(psql_stack_ro -c "SELECT count(*) FROM powered_by_apikey k JOIN powered_by_project p ON p.id = k.project_id")"
  [ "$a" = "$b" ] && { ok=1; break; }
  sleep 1
done
[ "$ok" = 1 ] && pass "E1 shared stack: len equals load-query rows ($a)" || fail "E1 shared stack: len $a vs rows $b"

drill_reset
finish
