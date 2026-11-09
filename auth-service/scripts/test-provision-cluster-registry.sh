#!/usr/bin/env bash
# auth-service/scripts/test-provision-cluster-registry.sh — runs provision-cluster-registry.sh (create and --verify)
# against a throwaway postgres:18 container with a stand-in registry schema and a fake sops. No cluster is touched.
#   auth-service/scripts/test-provision-cluster-registry.sh      needs docker; removes its container on exit
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
name="apikeys-provision-test-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1; rm -rf "$tmp"' EXIT
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

docker run -d --name "$name" -e POSTGRES_PASSWORD=pg postgres:18 >/dev/null || { echo "FAIL: cannot start postgres:18"; exit 1; }
for _ in $(seq 60); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done
sleep 1
psql_() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
psql_ -c "CREATE DATABASE sefaria_auth" >/dev/null
# The registry columns the loader reads, plus columns it must not get, and four NOTIFY trigger names.
psql_ -d sefaria_auth >/dev/null <<'SQL'
CREATE TABLE api_tier (id text PRIMARY KEY, per_minute_per_project int, internal_note text);
CREATE TABLE api_tier_meter_limit (tier_id text, meter text, monthly_per_project bigint);
CREATE TABLE api_project (id serial PRIMARY KEY, tier_id text, deleted_at timestamptz, contact_email text);
CREATE TABLE powered_by_apikey (id uuid PRIMARY KEY, key text, project_id int, label text, allowed_origins jsonb,
  revoked_at timestamptz, last_used_at timestamptz);
CREATE TABLE powered_by_project (id serial PRIMARY KEY, creator_email text);
CREATE FUNCTION apikeys_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE TRIGGER apikeys_notify_a AFTER INSERT ON powered_by_apikey FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_b AFTER UPDATE ON powered_by_apikey FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_c AFTER UPDATE ON api_project FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_d AFTER UPDATE ON api_tier FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
SQL

# fake sops: the probe passes; --in-place replaces stringData values and appends a sops: block, like the real one.
mkdir -p "$tmp/bin" "$tmp/out"
cat >"$tmp/bin/sops" <<'FAKE'
#!/usr/bin/env bash
[ "${FAKE_SOPS_FAIL:-}" = 1 ] && exit 1
for a in "$@"; do f=$a; done
case " $* " in
  *" --in-place "*) sed -i -E 's/^(  AUTH_PG_DSN: ).*/\1ENC[AES256_GCM,data:fake,type:str]/' "$f"; printf 'sops:\n  version: fake\n' >>"$f" ;;
  *) cat >/dev/null ;;
esac
FAKE
chmod +x "$tmp/bin/sops"
run() { PATH="$tmp/bin:$PATH" PG_EXEC="docker exec -i $name" OUT_DIR="$tmp/out" KMS=projects/x/locations/global/keyRings/k/cryptoKeys/k \
  SECRET_NS="${SECRET_NS:-default}" bash "$here/provision-cluster-registry.sh" "$@" >"$tmp/log" 2>&1; }

run --verify && bad "--verify passes before the role exists" || ok "--verify fails before the role exists"
run --verfy; [ $? = 2 ] && [ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 0 ] \
  && ok "a mistyped flag is refused (exit 2) and creates nothing" || bad "a mistyped flag was not refused"
# A grant that fails (a loader column renamed away) rolls the whole creation back: no role, no file, no temp file.
psql_ -d sefaria_auth -c "ALTER TABLE powered_by_apikey RENAME COLUMN label TO label_gone"
run && bad "create succeeded with a missing column" || ok "create fails when a grant fails"
[ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 0 ] && ok "the failed create left no role (one transaction)" || bad "a role was left behind"
[ -z "$(ls -A "$tmp/out")" ] && ok "the failed create left no Secret file and no temporary file" || bad "files left in OUT_DIR: $(ls -A "$tmp/out")"
psql_ -d sefaria_auth -c "ALTER TABLE powered_by_apikey RENAME COLUMN label_gone TO label"
FAKE_SOPS_FAIL=1 run && bad "create ran with a broken sops" || ok "create refuses when sops cannot encrypt"
[ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 0 ] && ok "no role is left behind after a sops failure" || bad "a role was created despite the sops failure"
SECRET_NS=preprod run && ok "create succeeds" || { bad "create failed"; sed 's/^/    /' "$tmp/log"; }
grep -q 'verify: PASS' "$tmp/log" && ok "create ends with a passing verify" || bad "create did not verify"
grep -q '^sops:' "$tmp/out/auth-service-registry.yaml" && ok "the Secret file is encrypted" || bad "Secret file not encrypted"
grep -q 'namespace: preprod' "$tmp/out/auth-service-registry.yaml" && ok "the Secret is for namespace preprod" || bad "Secret namespace"
grep -qE 'postgres://|[0-9a-f]{48}' "$tmp/out/auth-service-registry.yaml" "$tmp/log" && bad "the password or DSN appears in clear" || ok "no password or DSN in clear in the file or the output"
run && bad "a second create ran" || ok "a second create refuses (the file exists)"
rm -f "$tmp/out/auth-service-registry.yaml"
run && bad "a create ran with an existing role" || ok "a create refuses when the role exists"
run --verify && ok "--verify passes on the provisioned role" || { bad "--verify fails on the provisioned role"; sed 's/^/    /' "$tmp/log"; }
grep -q "powered_by_project" "$tmp/log" && bad "verify mentions powered_by_project" || true
[ "$(psql_ -d sefaria_auth -c "SELECT has_table_privilege('auth_service_reader', 'powered_by_project', 'SELECT')")" = f ] \
  && ok "no access to powered_by_project (the loader does not read it)" || bad "the role can read powered_by_project"
[ "$(psql_ -d sefaria_auth -c "SELECT has_column_privilege('auth_service_reader', 'powered_by_apikey', 'last_used_at', 'SELECT')")" = f ] \
  && ok "no access to columns the loader does not read" || bad "the role reads extra columns"

psql_ -d sefaria_auth -c "REVOKE SELECT (allowed_origins) ON powered_by_apikey FROM auth_service_reader"
run --verify && bad "--verify passes without SELECT (allowed_origins)" || ok "--verify fails when a loader column grant is missing"
grep -q 'lacks SELECT (allowed_origins) ON powered_by_apikey' "$tmp/log" && ok "it names the missing grant" || bad "missing grant not named"
grep -q "the loader's queries fail" "$tmp/log" && ok "the loader's queries fail as the role" || bad "loader query not detected"
psql_ -d sefaria_auth -c "GRANT SELECT (allowed_origins) ON powered_by_apikey TO auth_service_reader"
psql_ -d sefaria_auth -c "GRANT UPDATE ON api_project TO auth_service_reader"
run --verify && bad "--verify passes with a write grant" || ok "--verify fails when the role can write"
psql_ -d sefaria_auth -c "REVOKE UPDATE ON api_project FROM auth_service_reader"
psql_ -d sefaria_auth -c "GRANT UPDATE (contact_email) ON api_project TO auth_service_reader"
run --verify && bad "--verify passes with a column-level write grant" || ok "--verify fails on a column-level write grant"
psql_ -d sefaria_auth -c "REVOKE UPDATE (contact_email) ON api_project FROM auth_service_reader"
psql_ -d sefaria_auth -c "GRANT SELECT (last_used_at) ON powered_by_apikey TO auth_service_reader"
run --verify && bad "--verify passes with an extra readable column" || ok "--verify fails on a column the loader does not read"
grep -q 'powered_by_apikey.last_used_at' "$tmp/log" && ok "it names the extra column" || bad "extra column not named"
psql_ -d sefaria_auth -c "REVOKE SELECT (last_used_at) ON powered_by_apikey FROM auth_service_reader"
psql_ -c "CREATE ROLE apikeys_test_writer NOLOGIN" >/dev/null
psql_ -d sefaria_auth -c "GRANT INSERT ON powered_by_project TO apikeys_test_writer"
psql_ -c "GRANT apikeys_test_writer TO auth_service_reader"
run --verify && bad "--verify passes with an inherited write grant" || ok "--verify fails on a write privilege inherited from another role"
psql_ -c "REVOKE apikeys_test_writer FROM auth_service_reader"
run --verify && ok "--verify passes again once the extra privileges are gone" || { bad "--verify still fails"; sed 's/^/    /' "$tmp/log"; }
psql_ -c "ALTER ROLE auth_service_reader RESET default_transaction_read_only"
run --verify && bad "--verify passes with read-write sessions" || ok "--verify fails when sessions are not read-only"
exit $fail
