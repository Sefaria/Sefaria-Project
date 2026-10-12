#!/usr/bin/env bash
# scripts/provision-cluster-registry.sh — create the cluster's one key registry inside its shared Postgres (postgres-18):
# a dedicated role, a database it owns, the schema, and a SOPS-encrypted DSN Secret file for the infrastructure repo.
# Every auth service in the cluster then reads it through authService.postgres.secrets.dsn.ref (default auth-service-registry).
#
# The password is generated here and written only into the encrypted file; it is never printed.
# Refuses to run if the role, the database or the output file already exists (a re-run would desync the password).
#   scripts/provision-cluster-registry.sh   (any cwd; OUT_DIR defaults to the infrastructure-registry worktree)
set -euo pipefail
CTX=${CTX:-gke_development-205018_us-east1-b_cluster-1}
OUT_DIR=${OUT_DIR:-$HOME/dev/sefaria/infrastructure-registry/dev/cluster-1/spec/default}
cd "$(dirname "$(realpath "$0")")/.."
KMS=${KMS:-projects/development-205018/locations/global/keyRings/sops/cryptoKeys/sops-key}
DB=${DB:-sefaria_apikeys}
ROLE=${ROLE:-auth_service_registry}
SECRET=${SECRET:-auth-service-registry}
OUT="$OUT_DIR/$SECRET.yaml"
pg() { kubectl --context "$CTX" -n default exec -i postgres-18-0 -- sh -c 'psql -v ON_ERROR_STOP=1 -qtA -U "${POSTGRES_USER:-postgres}" "$@"' psql "$@"; }

[ -e "$OUT" ] && { echo "refusing: $OUT already exists"; exit 1; }
[ "$(pg -c "SELECT count(*) FROM pg_roles WHERE rolname = '$ROLE'")" = 0 ] || { echo "refusing: role $ROLE exists"; exit 1; }
[ "$(pg -c "SELECT count(*) FROM pg_database WHERE datname = '$DB'")" = 0 ] || { echo "refusing: database $DB exists"; exit 1; }

# KMS must work before the role exists: a password that cannot be stored would strand the role.
printf 'probe: x\n' | sops --encrypt --gcp-kms "$KMS" --input-type yaml --output-type yaml /dev/stdin >/dev/null \
  || { echo "refusing: sops cannot encrypt with $KMS (gcloud auth application-default login?)"; exit 1; }

PW=$(openssl rand -hex 24)
printf "CREATE ROLE %s LOGIN PASSWORD '%s';\nCREATE DATABASE %s OWNER %s;\nREVOKE ALL ON DATABASE %s FROM PUBLIC;\n" \
  "$ROLE" "$PW" "$DB" "$ROLE" "$DB" | pg
{ echo "SET ROLE $ROLE;"; cat internal/registry/schema.sql; } | pg -d "$DB"
echo "ok: role $ROLE, database $DB (owner $ROLE), schema applied"

umask 077
printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\n  namespace: default\ntype: Opaque\nstringData:\n  AUTH_PG_DSN: postgres://%s:%s@postgres-18.default.svc.cluster.local:5432/%s?sslmode=disable\n' \
  "$SECRET" "$ROLE" "$PW" "$DB" > "$OUT"
unset PW
sops --encrypt --gcp-kms "$KMS" --encrypted-regex '^(data|stringData)$' --in-place "$OUT" || { rm -f "$OUT"; echo "FAIL: sops encryption failed; plaintext removed"; exit 1; }
grep -q '^sops:' "$OUT" || { rm -f "$OUT"; echo "FAIL: $OUT not encrypted; removed"; exit 1; }
echo "ok: wrote encrypted $OUT"
