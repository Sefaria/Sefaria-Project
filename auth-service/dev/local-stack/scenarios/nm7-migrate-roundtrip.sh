#!/usr/bin/env bash
# N-M7: migrate powered_by back to 0002 and forward again, on the drill's own Postgres (never the shared stack's),
# and keep the sqlmigrate output for review. Desired: reversible and clean, the schema identical after the round
# trip. Two round trips: with no developer-settings projects, then with one (as any environment has once the
# feature is used). 0007's reverse refuses while an api_project row holds what its forward cannot rebuild (a contact
# email, an owner or tier set only there, a soft-delete): that refusal is checked first, then the round trips run on
# rows the backfill can rebuild.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

OUT="$D11_DIR/nm7"; rm -rf "$OUT"; mkdir -p "$OUT"
drill_up
# Grants (-x) are compared separately: they come from the registry provisioning script, not from migrations.
# pg_dump 18 writes a random \restrict token per dump.
schema() { dcompose exec -T pg pg_dump -U postgres -s -x --no-owner sefaria_auth | grep -vE '^\\(un)?restrict '; }
applied() { psql_su -c "SELECT name FROM django_migrations WHERE app = 'powered_by' ORDER BY id DESC LIMIT 1"; }
latest_file="$(basename "$(ls "$REPO"/powered_by/migrations/0[0-9][0-9][0-9]_*.py | sort | tail -1)" .py)"
check N-M7 "latest powered_by migration applied before ($latest_file, the newest file)" "$(applied)" "$latest_file"

for m in 0003_developer_settings 0004_api_key_notify_triggers 0005_api_key_origins_strings \
    0006_api_project_schema 0007_api_project_backfill 0008_api_key_project_triggers_grants; do
  for dir in forward backward; do
    flag=(); [ $dir = backward ] && flag=(--backwards)
    if d11_manage sqlmigrate ${flag[@]+"${flag[@]}"} powered_by "$m" >"$OUT/$m.$dir.sql" 2>"$OUT/$m.$dir.err"; then
      pass "N-M7 sqlmigrate $m $dir ($(grep -cE '^[A-Z]' "$OUT/$m.$dir.sql") statements, $OUT/$m.$dir.sql)"
    else
      fail "N-M7 sqlmigrate $m $dir: $(tail -1 "$OUT/$m.$dir.err")"
    fi
  done
done

roundtrip() {  # roundtrip LABEL
  local label="$1"
  schema >"$OUT/$label.schema.before.sql"
  dcompose stop authsvc >/dev/null 2>&1
  if d11_manage migrate powered_by 0002 --noinput >"$OUT/$label.back.log" 2>&1; then
    pass "N-M7 [$label] migrate powered_by 0002"
    check N-M7 "[$label] after rollback: powered_by_apikey is gone" "$(psql_su -c "SELECT count(*) FROM pg_tables WHERE tablename = 'powered_by_apikey'")" 0
    check N-M7 "[$label] after rollback: no apikeys triggers" "$(psql_su -c "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'apikeys_notify%'")" 0
    check N-M7 "[$label] after rollback: no apikeys_notify()" "$(psql_su -c "SELECT count(*) FROM pg_proc WHERE proname = 'apikeys_notify'")" 0
    check N-M7 "[$label] after rollback: project rows kept" "$(psql_su -c "SELECT count(*) FROM powered_by_project WHERE id = $PROJECT_ID")" 1
  else
    local err; err="$(grep -m1 -E 'Error:' "$OUT/$label.back.log")"
    fail "N-M7 [$label] migrate powered_by 0002 fails at $(grep -oE 'Unapplying powered_by\.[0-9a-z_]+\.\.\.Traceback' "$OUT/$label.back.log" | sed 's/\.\.\.Traceback//;s/Unapplying //'): ${err:0:200} (stuck at $(applied))"
  fi
  others="$(grep 'Unapplying' "$OUT/$label.back.log" | grep -vc 'powered_by\.' || true)"
  check N-M7 "[$label] rollback unapplies only powered_by migrations" "$others" 0
  d11_manage migrate powered_by --noinput >"$OUT/$label.fwd.log" 2>&1 && pass "N-M7 [$label] migrate powered_by forward again" \
    || fail "N-M7 [$label] migrate forward: $(tail -3 "$OUT/$label.fwd.log" | tr '\n' ' ')"
  schema >"$OUT/$label.schema.after.sql"
  if diff -q "$OUT/$label.schema.before.sql" "$OUT/$label.schema.after.sql" >/dev/null; then
    pass "N-M7 [$label] schema identical after the round trip"
  else
    diff "$OUT/$label.schema.before.sql" "$OUT/$label.schema.after.sql" >"$OUT/$label.schema.diff"
    fail "N-M7 [$label] schema differs after the round trip ($OUT/$label.schema.diff)"
  fi
  local grants
  grants="$(psql_su -c "SELECT has_column_privilege('auth_service_reader', 'api_project', 'tier_id', 'SELECT')
    AND has_column_privilege('auth_service_reader', 'api_project', 'deleted_at', 'SELECT')
    AND has_column_privilege('auth_service_reader', 'powered_by_apikey', 'key', 'SELECT')")"
  [ "$grants" = t ] && info "N-M7 [$label] the reader role still has its grants after the round trip" \
    || info "N-M7 [$label] the round trip drops the reader role's grants on the recreated api_project table: the auth service cannot reload until provision-cluster-registry.sh runs again (as N-E4)"
  dcompose exec -T pg psql -q -U postgres -d sefaria_auth -v ON_ERROR_STOP=1 <"$STACK_DIR/provision.sql" >/dev/null
  seed_project
  rebuildable
}

# The guard: the drill's api_project row carries a contact email (seed_project), which only api_project holds.
psql_su -c "UPDATE api_project SET contact_email = 'apikeys-e2e-d11-drill@example.com' WHERE profile_id = $PROJECT_ID" >/dev/null
dcompose stop authsvc >/dev/null 2>&1
if d11_manage migrate powered_by 0002 --noinput >"$OUT/guard.back.log" 2>&1; then
  fail "N-M7 [guard] a rollback past 0007 ran although an api_project row holds a contact email it cannot rebuild"
else
  grep -q 'IrreversibleError: .*api_project row(s)' "$OUT/guard.back.log" \
    && pass "N-M7 [guard] 0007's reverse refuses while an api_project row holds a contact email (IrreversibleError, nothing lost)" \
    || fail "N-M7 [guard] the rollback failed for another reason: $(grep -m1 -E 'Error' "$OUT/guard.back.log" | cut -c1-200)"
  check N-M7 "[guard] the refused rollback left the drill project's api_project row" \
    "$(psql_su -c "SELECT count(*) FROM api_project WHERE profile_id = $PROJECT_ID")" 1
fi
d11_manage migrate powered_by --noinput >"$OUT/guard.fwd.log" 2>&1 || fail "N-M7 [guard] migrate forward after the refusal: $(tail -2 "$OUT/guard.fwd.log" | tr '\n' ' ')"
# What the backfill rebuilds: no contact email (seed_project would add one back; the round trips clear it again).
rebuildable() { psql_su -c "UPDATE api_project SET contact_email = '' WHERE profile_id = $PROJECT_ID" >/dev/null; }
rebuildable

psql_su -c "UPDATE powered_by_project SET submission_source = 'manual' WHERE id = $PROJECT_ID" >/dev/null
check N-M7 "[no-dev-rows] no developer_settings projects" "$(psql_su -c "SELECT count(*) FROM powered_by_project WHERE submission_source = 'developer_settings'")" 0
roundtrip no-dev-rows
psql_su -c "UPDATE powered_by_project SET submission_source = 'developer_settings' WHERE id = $PROJECT_ID" >/dev/null
roundtrip with-dev-row
check N-M7 "[with-dev-row] the rollback past 0003 made the developer_settings row a manual one (0003's reverse)" \
  "$(psql_su -c "SELECT submission_source FROM powered_by_project WHERE id = $PROJECT_ID")" manual

# A tier changed on api_project lives only there (the frozen powered_by_project.tier column is never written by the
# new model), so 0007's reverse refuses to drop it. Once the tier matches the frozen column again, a rollback past 0006
# drops the api_project rows and the forward backfill rebuilds them; the keys and project rows stay.
tier_rollback() {
  set_project_tier partner
  dcompose stop authsvc >/dev/null 2>&1
  if d11_manage migrate powered_by 0005 --noinput >"$OUT/tier.refused.log" 2>&1; then
    fail "N-M7 [tier] a rollback to 0005 dropped a tier set only on api_project"
  else
    grep -q 'IrreversibleError' "$OUT/tier.refused.log" \
      && pass "N-M7 [tier] 0007's reverse refuses to drop a tier set only on api_project" \
      || fail "N-M7 [tier] the refused rollback failed for another reason: $(grep -m1 Error "$OUT/tier.refused.log" | cut -c1-200)"
    check N-M7 "[tier] the refused rollback kept the partner tier" "$(psql_su -c "SELECT tier_id FROM $DRILL_API_PROJECT_ROW")" partner
  fi
  d11_manage migrate powered_by --noinput >/dev/null 2>&1
  set_project_tier "$(psql_su -c "SELECT tier FROM powered_by_project WHERE id = $PROJECT_ID")"
  # A rollback past 0003 turned the developer_settings row into a manual one (0003's reverse) and dropped the keys, so
  # the profile is no longer an API project by 0007's definition; make it one again so its row is rebuildable.
  psql_su -c "UPDATE powered_by_project SET submission_source = 'developer_settings' WHERE id = $PROJECT_ID" >/dev/null
  local keys_before; keys_before="$(psql_su -c "SELECT count(*) FROM powered_by_apikey")"
  local frozen_before; frozen_before="$(psql_su -c "SELECT tier FROM powered_by_project WHERE id = $PROJECT_ID")"
  schema >"$OUT/tier.schema.before.sql"
  dcompose stop authsvc >/dev/null 2>&1
  if d11_manage migrate powered_by 0005 --noinput >"$OUT/tier.back.log" 2>&1; then
    pass "N-M7 [tier] migrate powered_by 0005"
    check N-M7 "[tier] after rollback to 0005: api_project is gone" "$(psql_su -c "SELECT count(*) FROM pg_tables WHERE tablename = 'api_project'")" 0
    check N-M7 "[tier] after rollback to 0005: keys kept" "$(psql_su -c "SELECT count(*) FROM powered_by_apikey")" "$keys_before"
    check N-M7 "[tier] after rollback to 0005: project row kept" "$(psql_su -c "SELECT count(*) FROM powered_by_project WHERE id = $PROJECT_ID")" 1
    check N-M7 "[tier] after rollback to 0005: frozen tier untouched by the api_project tier change" "$(psql_su -c "SELECT tier FROM powered_by_project WHERE id = $PROJECT_ID")" "$frozen_before"
  else
    fail "N-M7 [tier] migrate powered_by 0005: $(tail -3 "$OUT/tier.back.log" | tr '\n' ' ')"
  fi
  d11_manage migrate powered_by --noinput >"$OUT/tier.fwd.log" 2>&1 && pass "N-M7 [tier] migrate powered_by forward again" \
    || fail "N-M7 [tier] migrate forward: $(tail -3 "$OUT/tier.fwd.log" | tr '\n' ' ')"
  schema >"$OUT/tier.schema.after.sql"
  if diff -q "$OUT/tier.schema.before.sql" "$OUT/tier.schema.after.sql" >/dev/null; then
    pass "N-M7 [tier] schema identical after the round trip"
  else
    diff "$OUT/tier.schema.before.sql" "$OUT/tier.schema.after.sql" >"$OUT/tier.schema.diff"
    fail "N-M7 [tier] schema differs after the round trip ($OUT/tier.schema.diff)"
  fi
  dcompose exec -T pg psql -q -U postgres -d sefaria_auth -v ON_ERROR_STOP=1 <"$STACK_DIR/provision.sql" >/dev/null
  seed_project
  set_project_tier developer
}
DRILL_API_PROJECT_ROW="api_project WHERE profile_id = $PROJECT_ID AND deleted_at IS NULL"
tier_rollback
info "N-M7 a rollback past 0003 drops every key and the projects' owner/deleted_at columns and the api_project tables; that data does not come back"

new_key baseline
dcompose start authsvc >/dev/null 2>&1
drill_reset
finish
