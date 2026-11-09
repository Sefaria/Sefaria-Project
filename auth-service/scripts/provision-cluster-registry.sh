#!/usr/bin/env bash
# auth-service/scripts/provision-cluster-registry.sh — the auth service's read-only access to the key registry in
# Django's Postgres database (sefaria_auth on postgres-18), and the SOPS-encrypted DSN Secret for the infrastructure repo.
#
#   --verify     read-only: the role exists, its sessions are read-only, it has SELECT on exactly the columns the loader
#                reads (internal/registry/pgload.go), and the loader's queries run as that role. Run it in each cluster
#                before `authService.enabled: true` there (the release plan's "reader role lacks SELECT" risk).
#   (no flag)    create the role and its grants, and write the encrypted Secret file. Refuses when the role or the
#                output file already exists (a re-run would desync the password).
#
# Django owns the tables and their NOTIFY triggers through its migrations; run them first. The password is generated
# here and written only into the encrypted file; it is never printed.
#
# Env (no context default: name the cluster explicitly):
#   CTX        kube context of the cluster whose postgres-18-0 holds the registry (required unless PG_EXEC is set)
#   PG_NS      namespace of postgres-18-0 (default: default)
#   SECRET_NS  namespace the Secret is for (default: default; preprod reads it in namespace preprod)
#   OUT_DIR    infrastructure-repo directory for the Secret file (create mode only)
#   KMS        SOPS GCP KMS key (create mode only)
#   DB, ROLE, SECRET  defaults sefaria_auth, auth_service_reader, auth-service-registry
#   PG_EXEC    a command that runs its arguments next to Postgres instead of kubectl exec (tests, a local stack), e.g.
#              PG_EXEC="docker exec -i sefaria-apikeys-stack-pg-1"
set -euo pipefail
MODE=create
[ "${1:-}" = --verify ] && MODE=verify
DB=${DB:-sefaria_auth}
ROLE=${ROLE:-auth_service_reader}
SECRET=${SECRET:-auth-service-registry}
SECRET_NS=${SECRET_NS:-default}
PG_NS=${PG_NS:-default}
if [ -z "${PG_EXEC:-}" ]; then
  CTX=${CTX:?set CTX to the kube context of the cluster (no default)}
fi
[[ $ROLE =~ ^[a-z_][a-z0-9_]*$ && $DB =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "refusing: ROLE and DB must be plain identifiers"; exit 1; }

pg() {
  if [ -n "${PG_EXEC:-}" ]; then
    $PG_EXEC sh -c 'psql -v ON_ERROR_STOP=1 -X -qtA -U "${POSTGRES_USER:-postgres}" "$@"' psql "$@"
  else
    kubectl --context "$CTX" -n "$PG_NS" exec -i postgres-18-0 -- sh -c 'psql -v ON_ERROR_STOP=1 -X -qtA -U "${POSTGRES_USER:-postgres}" "$@"' psql "$@"
  fi
}

# The loader's columns: keep in step with internal/registry/pgload.go (loadKeysSQL, loadTierLimitsSQL).
GRANTS=(
  "powered_by_apikey:id,key,project_id,label,allowed_origins,revoked_at"
  "api_project:id,tier_id,deleted_at"
  "api_tier:id,per_minute_per_project"
  "api_tier_meter_limit:tier_id,meter,monthly_per_project"
)
LOADER_SQL="SELECT k.id::text, k.key, p.id::text, k.label, t.id, t.per_minute_per_project, k.allowed_origins::text,
  (k.revoked_at IS NOT NULL OR p.deleted_at IS NOT NULL)
  FROM powered_by_apikey k JOIN api_project p ON p.id = k.project_id JOIN api_tier t ON t.id = p.tier_id LIMIT 0;
  SELECT tier_id, meter, monthly_per_project FROM api_tier_meter_limit LIMIT 0;"

verify() {
  local rc=0 table cols col
  ok() { echo "ok:   $*"; }
  bad() { echo "FAIL: $*"; rc=1; }
  [ "$(pg -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE'")" = 1 ] || { bad "role $ROLE does not exist (run this script without --verify)"; return 1; }
  ok "role $ROLE exists"
  [ "$(pg -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE' AND rolcanlogin")" = 1 ] && ok "$ROLE can log in" || bad "$ROLE cannot log in"
  [ "$(pg -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE' AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)")" = 0 ] \
    && ok "$ROLE has no superuser, createrole, createdb or bypassrls" || bad "$ROLE has an admin attribute"
  pg -c "SELECT coalesce(array_to_string(setconfig, ','), '') FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole WHERE r.rolname = '$ROLE'" \
    | grep -q 'default_transaction_read_only=on' && ok "$ROLE sessions are read-only" || bad "$ROLE sessions are not read-only (ALTER ROLE ... SET default_transaction_read_only = on)"
  [ "$(pg -c "SELECT has_database_privilege('$ROLE', '$DB', 'CONNECT')")" = t ] && ok "$ROLE may connect to $DB" || bad "$ROLE may not connect to $DB"
  for entry in "${GRANTS[@]}"; do
    table=${entry%%:*}; cols=${entry#*:}
    for col in ${cols//,/ }; do
      [ "$(pg -d "$DB" -c "SELECT has_column_privilege('$ROLE', 'public.$table', '$col', 'SELECT')")" = t ] \
        || bad "$ROLE lacks SELECT ($col) ON $table"
    done
    ok "$ROLE checked for SELECT ($cols) ON $table"
  done
  local extra
  extra="$(pg -d "$DB" -c "SELECT string_agg(DISTINCT table_name || '.' || privilege_type, ', ') FROM information_schema.role_table_grants WHERE grantee = '$ROLE' AND privilege_type <> 'SELECT'")"
  [ -z "$extra" ] && ok "$ROLE holds no write privilege" || bad "$ROLE holds write privileges: $extra"
  # The loader's own statements, as the role, in a read-only transaction that is rolled back.
  if pg -d "$DB" >/dev/null 2>&1 <<SQL
BEGIN READ ONLY;
SET LOCAL ROLE $ROLE;
$LOADER_SQL
ROLLBACK;
SQL
  then ok "the loader's queries run as $ROLE"; else bad "the loader's queries fail as $ROLE (a missing column grant: the auth service would load nothing and fail open)"; fi
  [ "$(pg -d "$DB" -c "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'apikeys\_notify\_%'")" -ge 4 ] \
    && ok "NOTIFY triggers present in $DB" || bad "NOTIFY triggers missing in $DB (run the Django migrations)"
  [ $rc = 0 ] && echo "verify: PASS ($ROLE on $DB)" || echo "verify: FAIL"
  return $rc
}

if [ "$MODE" = verify ]; then verify; exit $?; fi

OUT_DIR=${OUT_DIR:?set OUT_DIR to the infrastructure-repo directory for the Secret file}
KMS=${KMS:?set KMS to the SOPS GCP KMS key}
OUT="$OUT_DIR/$SECRET.yaml"
[ -e "$OUT" ] && { echo "refusing: $OUT already exists"; exit 1; }
[ "$(pg -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE'")" = 0 ] || { echo "refusing: role $ROLE exists (use --verify)"; exit 1; }
[ "$(pg -c "SELECT count(*) FROM pg_database WHERE datname = '$DB'")" = 1 ] || { echo "refusing: database $DB does not exist"; exit 1; }
[ "$(pg -d "$DB" -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('powered_by_apikey', 'api_project', 'api_tier', 'api_tier_meter_limit')")" = 4 ] \
  || { echo "refusing: registry tables missing in $DB (run the Django migrations first)"; exit 1; }
[ "$(pg -d "$DB" -c "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'apikeys\_notify\_%'")" -ge 4 ] \
  || { echo "refusing: NOTIFY triggers missing in $DB (run the Django migrations first)"; exit 1; }

# KMS must work before the role exists: a password that cannot be stored would strand the role.
printf 'probe: x\n' | sops --encrypt --gcp-kms "$KMS" --input-type yaml --output-type yaml /dev/stdin >/dev/null \
  || { echo "refusing: sops cannot encrypt with $KMS (gcloud auth application-default login?)"; exit 1; }

PW=$(openssl rand -hex 24)
printf "CREATE ROLE %s LOGIN PASSWORD '%s';\nALTER ROLE %s SET default_transaction_read_only = on;\nGRANT CONNECT ON DATABASE %s TO %s;\n" \
  "$ROLE" "$PW" "$ROLE" "$DB" "$ROLE" | pg
{
  printf 'GRANT USAGE ON SCHEMA public TO %s;\n' "$ROLE"
  for entry in "${GRANTS[@]}"; do
    printf 'GRANT SELECT (%s) ON %s TO %s;\n' "${entry#*:}" "${entry%%:*}" "$ROLE"
  done
} | pg -d "$DB"
echo "ok: role $ROLE, read-only on the registry columns in $DB"

umask 077
printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: %s\ntype: Opaque\nstringData:\n  AUTH_PG_DSN: postgres://%s:%s@postgres-18.%s.svc.cluster.local:5432/%s?sslmode=disable\n' \
  "$SECRET" "$SECRET_NS" "$ROLE" "$PW" "$PG_NS" "$DB" > "$OUT"
unset PW
sops --encrypt --gcp-kms "$KMS" --encrypted-regex '^(data|stringData)$' --in-place "$OUT" || { rm -f "$OUT"; echo "FAIL: sops encryption failed; plaintext removed"; exit 1; }
grep -q '^sops:' "$OUT" || { rm -f "$OUT"; echo "FAIL: $OUT not encrypted; removed"; exit 1; }
echo "ok: wrote encrypted $OUT (namespace $SECRET_NS)"
verify
