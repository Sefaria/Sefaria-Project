#!/usr/bin/env bash
# scripts/provision-cluster-registry.sh — give the auth service read-only access to the key registry in Django's
# Postgres database (sefaria_auth on postgres-18) and write a SOPS-encrypted DSN Secret file for the infrastructure repo.
# Django owns the tables (powered_by_project, powered_by_apikey) and their NOTIFY triggers through its migrations;
# run them first. Every auth service in the cluster reads the DSN through authService.postgres.secrets.dsn.ref
# (default auth-service-registry).
#
# The role can connect, LISTEN, and SELECT only the columns the auth service loads. Its sessions are read-only.
# A role provisioned before deleted projects were loaded as revoked needs one more grant (run in $DB as a superuser):
#   GRANT SELECT (deleted_at) ON powered_by_project TO auth_service_reader;
# The password is generated here and written only into the encrypted file; it is never printed.
# Refuses to run if the role or the output file already exists (a re-run would desync the password).
#   scripts/provision-cluster-registry.sh   (any cwd; OUT_DIR defaults to the infrastructure-registry worktree)
set -euo pipefail
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
OUT_DIR=${OUT_DIR:-$HOME/dev/sefaria/infrastructure-registry/dev/cluster-1/spec/default}
KMS=${KMS:-projects/development-205018/locations/global/keyRings/sops/cryptoKeys/sops-key}
DB=${DB:-sefaria_auth}
ROLE=${ROLE:-auth_service_reader}
SECRET=${SECRET:-auth-service-registry}
OUT="$OUT_DIR/$SECRET.yaml"
pg() { kubectl --context "$CTX" -n default exec -i postgres-18-0 -- sh -c 'psql -v ON_ERROR_STOP=1 -qtA -U "${POSTGRES_USER:-postgres}" "$@"' psql "$@"; }

[ -e "$OUT" ] && { echo "refusing: $OUT already exists"; exit 1; }
[ "$(pg -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE'")" = 0 ] || { echo "refusing: role $ROLE exists"; exit 1; }
[ "$(pg -c "SELECT count(*) FROM pg_database WHERE datname = '$DB'")" = 1 ] || { echo "refusing: database $DB does not exist"; exit 1; }
[ "$(pg -d "$DB" -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('powered_by_project', 'powered_by_apikey')")" = 2 ] \
  || { echo "refusing: registry tables missing in $DB (run the Django migrations first)"; exit 1; }
[ "$(pg -d "$DB" -c "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'apikeys\_notify\_%'")" -ge 4 ] \
  || { echo "refusing: NOTIFY triggers missing in $DB (run the Django migrations first)"; exit 1; }

# KMS must work before the role exists: a password that cannot be stored would strand the role.
printf 'probe: x\n' | sops --encrypt --gcp-kms "$KMS" --input-type yaml --output-type yaml /dev/stdin >/dev/null \
  || { echo "refusing: sops cannot encrypt with $KMS (gcloud auth application-default login?)"; exit 1; }

PW=$(openssl rand -hex 24)
printf "CREATE ROLE %s LOGIN PASSWORD '%s';\nALTER ROLE %s SET default_transaction_read_only = on;\nGRANT CONNECT ON DATABASE %s TO %s;\n" \
  "$ROLE" "$PW" "$ROLE" "$DB" "$ROLE" | pg
printf "GRANT USAGE ON SCHEMA public TO %s;\nGRANT SELECT (id, tier, deleted_at) ON powered_by_project TO %s;\nGRANT SELECT (id, key, project_id, label, allowed_origins, revoked_at) ON powered_by_apikey TO %s;\n" \
  "$ROLE" "$ROLE" "$ROLE" | pg -d "$DB"
echo "ok: role $ROLE, read-only on the registry tables in $DB"

umask 077
printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: default\ntype: Opaque\nstringData:\n  AUTH_PG_DSN: postgres://%s:%s@postgres-18.default.svc.cluster.local:5432/%s?sslmode=disable\n' \
  "$SECRET" "$ROLE" "$PW" "$DB" > "$OUT"
unset PW
sops --encrypt --gcp-kms "$KMS" --encrypted-regex '^(data|stringData)$' --in-place "$OUT" || { rm -f "$OUT"; echo "FAIL: sops encryption failed; plaintext removed"; exit 1; }
grep -q '^sops:' "$OUT" || { rm -f "$OUT"; echo "FAIL: $OUT not encrypted; removed"; exit 1; }
echo "ok: wrote encrypted $OUT"
