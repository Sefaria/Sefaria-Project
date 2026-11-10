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

# fake sops: the probe passes. The real encryption must read the Secret YAML on stdin (never a file: --in-place is
# refused), and writes the ciphertext to stdout, replacing the DSN value and appending a sops: block, like the real one.
# While it runs it records what a plaintext leak would look like: the password it was handed (to SOPS_SEEN, outside
# OUT_DIR), whether any file under OUT_DIR already contains it, and whether the output file is not mode 0600.
mkdir -p "$tmp/bin" "$tmp/out"
cat >"$tmp/bin/sops" <<'FAKE'
#!/usr/bin/env bash
case " $* " in *" --encrypted-regex "*) ;; *) cat >/dev/null; [ "${FAKE_SOPS_FAIL:-}" = 1 ] && exit 1; exit 0 ;; esac
case " $* " in *" --in-place "*) echo "fake sops: --in-place would need the plaintext on disk" >&2; exit 3 ;; esac
[ "${!#}" = /dev/stdin ] || { echo "fake sops: the input must be /dev/stdin" >&2; exit 3; }
in=$(cat)
if [ "${FAKE_SOPS_FAIL_ENCRYPT:-}" = 1 ]; then printf 'sops error, input was:\n%s\n' "$in" >&2; exit 1; fi
pw=$(printf '%s\n' "$in" | sed -n 's|.*postgres://[^:]*:\([^@]*\)@.*|\1|p')
printf '%s\n' "$pw" >"$SOPS_SEEN"
[ -n "$pw" ] && grep -rlF -- "$pw" "$OUT_DIR" >>"$SOPS_SEEN.leak" 2>/dev/null
find "$OUT_DIR" -maxdepth 1 -name '.auth-service-registry.tmp.*' ! -perm 600 >>"$SOPS_SEEN.mode" 2>/dev/null
[ -n "${FAKE_SOPS_SLEEP:-}" ] && sleep "$FAKE_SOPS_SLEEP"
printf '%s\n' "$in" | sed -E 's/^(  AUTH_PG_DSN: ).*/\1ENC[AES256_GCM,data:fake,type:str]/'
printf 'sops:\n  version: fake\n'
FAKE
chmod +x "$tmp/bin/sops"
export SOPS_SEEN="$tmp/seen-pw"
run() { PATH="$tmp/bin:$PATH" OUT_DIR="$tmp/out" SOPS_SEEN="$SOPS_SEEN" PG_EXEC="docker exec -i $name" OUT_DIR="$tmp/out" KMS=projects/x/locations/global/keyRings/k/cryptoKeys/k \
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
# A failure of the real encryption step (the probe passed): no file, no role, and the output never shows the password or the DSN even
# when sops echoes its input on stderr.
FAKE_SOPS_FAIL_ENCRYPT=1 run && bad "create ran with a failing encryption" || ok "create refuses when the encryption step fails"
[ -z "$(ls -A "$tmp/out")" ] && ok "a failed encryption leaves no file in OUT_DIR (no plaintext, no temporary file)" || bad "files left after a failed encryption: $(ls -A "$tmp/out")"
[ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 0 ] && ok "no role after a failed encryption" || bad "a role was created despite the failed encryption"
fpw="$(cat "$SOPS_SEEN" 2>/dev/null)"
[ -z "$fpw" ] || { grep -qF -- "$fpw" "$tmp/log" && bad "the sops error output shows the password" || ok "the sops error output is masked (no password)"; }
grep -q 'postgres://[^:]*:[^*]' "$tmp/log" && bad "the failure output shows the DSN with its password" || ok "no DSN with a password in the failure output"
# An interruption (INT/TERM, as Ctrl-C sends to the whole foreground group) in the two phases of create:
#  - before the role can exist (the encryption step): the temporary file is removed and no role exists;
#  - while the role is being created (the SQL has been sent and its answer is pending): the encrypted file is the only copy
#    of the password, so it is kept, and the output says so.
interrupt() { # PGID: signal the whole process group of a background job, as a terminal does
  kill -TERM -- "-$1" 2>/dev/null
}
set -m
PATH="$tmp/bin:$PATH" PG_EXEC="docker exec -i $name" OUT_DIR="$tmp/out" KMS=projects/x/locations/global/keyRings/k/cryptoKeys/k FAKE_SOPS_SLEEP=30 \
  bash "$here/provision-cluster-registry.sh" >"$tmp/log-int1" 2>&1 </dev/null &
pid=$!
sleep 3
interrupt "$pid"
wait "$pid" 2>/dev/null
[ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 0 ] && [ -z "$(ls -A "$tmp/out")" ] \
  && ok "an interruption before the role is created removes the temporary file and creates nothing" || { bad "interrupt before creation left state: $(ls -A "$tmp/out")"; }
# slowpg: forwards everything, but after the SQL that creates the role it has been committed, it never answers.
cat >"$tmp/slowpg" <<'SLOW'
#!/usr/bin/env bash
in=$(cat)
printf '%s' "$in" | docker exec -i "$1" "${@:2}"
if grep -q 'CREATE ROLE' <<<"$in"; then touch "$SLOWPG_FLAG"; sleep 60; fi
SLOW
chmod +x "$tmp/slowpg"
rm -f "$tmp/flag"
PATH="$tmp/bin:$PATH" PG_EXEC="$tmp/slowpg $name" SLOWPG_FLAG="$tmp/flag" OUT_DIR="$tmp/out" KMS=projects/x/locations/global/keyRings/k/cryptoKeys/k \
  bash "$here/provision-cluster-registry.sh" >"$tmp/log-int2" 2>&1 </dev/null &
pid=$!
for _ in $(seq 60); do [ -e "$tmp/flag" ] && break; sleep 0.5; done
interrupt "$pid"
wait "$pid" 2>/dev/null
rc=$?
set +m
[ -e "$tmp/flag" ] && [ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 1 ] \
  && ok "the role was created before the interruption (the case that matters)" || bad "test setup: the role was not created before the interrupt"
kept="$(ls -A "$tmp/out" | grep -c '^\.auth-service-registry\.tmp\.' || true)"
[ "$kept" = 1 ] && grep -q '^sops:' "$tmp/out"/.auth-service-registry.tmp.* \
  && ok "an interruption while the role is being created keeps the encrypted Secret file (the only copy of the password)" \
  || bad "the encrypted file was lost on interrupt (files: $(ls -A "$tmp/out"))"
[ "$rc" != 0 ] && grep -q 'INTERRUPTED while the role was being created' "$tmp/log-int2" && grep -q 'encrypted Secret is kept at' "$tmp/log-int2" \
  && ok "the interruption exits nonzero and says the file is kept" || { bad "interrupt message/exit (rc $rc)"; sed 's/^/    /' "$tmp/log-int2"; }
grep -qE 'postgres://|[0-9a-f]{48}' "$tmp/log-int2" && bad "the interrupt output shows the password or DSN" || ok "no password or DSN in the interrupt output"
# Clean up for the cases below: the role and the kept file.
psql_ -d sefaria_auth -c "DROP OWNED BY auth_service_reader" >/dev/null 2>&1
psql_ -c "DROP ROLE auth_service_reader" >/dev/null 2>&1
rm -f "$tmp/out"/.auth-service-registry.tmp.*
[ "$(psql_ -c "SELECT count(*) FROM pg_roles WHERE rolname = 'auth_service_reader'")" = 0 ] || bad "could not drop the role after the interrupt test"

SECRET_NS=preprod run && ok "create succeeds" || { bad "create failed"; sed 's/^/    /' "$tmp/log"; }
grep -q 'verify: PASS' "$tmp/log" && ok "create ends with a passing verify" || bad "create did not verify"
grep -q '^sops:' "$tmp/out/auth-service-registry.yaml" && ok "the Secret file is encrypted" || bad "Secret file not encrypted"
grep -q 'namespace: preprod' "$tmp/out/auth-service-registry.yaml" && ok "the Secret is for namespace preprod" || bad "Secret namespace"
grep -qE 'postgres://|[0-9a-f]{48}' "$tmp/out/auth-service-registry.yaml" "$tmp/log" && bad "the password or DSN appears in clear" || ok "no password or DSN in clear in the file or the output"
# No plaintext on disk: the fake sops saw the password on stdin, and at no point did a file under OUT_DIR hold it, the
# temporary output file was always mode 0600, and nothing under the test directory holds it after the run.
pw="$(cat "$SOPS_SEEN")"
[ "${#pw}" = 48 ] && ok "the encryption step received the Secret on stdin" || bad "sops was not given the Secret on stdin (saw '${#pw}' chars)"
[ ! -s "$SOPS_SEEN.leak" ] && ok "no file under OUT_DIR ever held the plaintext password while sops ran" || bad "plaintext password on disk in OUT_DIR: $(cat "$SOPS_SEEN.leak")"
[ ! -s "$SOPS_SEEN.mode" ] && ok "the temporary output file was mode 0600" || bad "the temporary file was not mode 0600: $(cat "$SOPS_SEEN.mode")"
! grep -rqF --exclude='seen-pw*' --exclude=slowpg -- "$pw" "$tmp" 2>/dev/null && ok "no file anywhere under the test directory contains the password" || bad "the password is on disk: $(grep -rlF --exclude='seen-pw*' -- "$pw" "$tmp")"
[ "$(stat -c %a "$tmp/out/auth-service-registry.yaml" 2>/dev/null || stat -f %Lp "$tmp/out/auth-service-registry.yaml")" = 600 ] && ok "the Secret file is mode 0600" || bad "the Secret file is not mode 0600"
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
psql_ -c "ALTER ROLE auth_service_reader IN DATABASE sefaria_auth SET default_transaction_read_only = off"
run --verify && bad "--verify passes when a database-specific setting turns read-only off" || ok "--verify fails on a per-database read-only override"
psql_ -c "ALTER ROLE auth_service_reader IN DATABASE sefaria_auth RESET default_transaction_read_only"
psql_ -c "ALTER ROLE auth_service_reader RESET default_transaction_read_only"
run --verify && bad "--verify passes with read-write sessions" || ok "--verify fails when sessions are not read-only"
exit $fail
