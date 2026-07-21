#!/usr/bin/env bash
# Dumps the prod pgvector `library_chunks` database and streams the dump straight to GCS
# (no local disk, no password on any command line / process argv).
#
# Required env var:
#   PGVECTOR_PROD_PASSWORD   password for the pgvector prod Postgres user
#
# Optional overrides:
#   PROD_CONTEXT   (default: gke_production-deployment_us-east1-b_cluster-1)
#   NAMESPACE      (default: default)
#   POD            (default: pgvector-0)
#   DB_USER        (default: pgvector)
#   DB_NAME        (default: pgvector)
#   GCS_BUCKET     (default: sefaria-pgvector-backup)
#
# Usage:
#   PGVECTOR_PROD_PASSWORD='...' ./scripts/pgvector_dump_prod_to_gcs.sh
set -euo pipefail

: "${PGVECTOR_PROD_PASSWORD:?Set PGVECTOR_PROD_PASSWORD in your shell before running}"

PROD_CONTEXT="${PROD_CONTEXT:-gke_production-deployment_us-east1-b_cluster-1}"
NAMESPACE="${NAMESPACE:-default}"
POD="${POD:-pgvector-0}"
DB_USER="${DB_USER:-pgvector}"
DB_NAME="${DB_NAME:-pgvector}"
GCS_BUCKET="${GCS_BUCKET:-sefaria-pgvector-backup}"

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="gs://${GCS_BUCKET}/pgvector-dumps/library_chunks-${TIMESTAMP}.dump"

echo "Dumping ${DB_NAME}@${POD} (${PROD_CONTEXT}/${NAMESPACE}) -> ${DEST}" >&2

# Password is sent over the exec stdin stream and consumed by `read` inside the pod;
# it never appears in argv (no `ps` leak) and is never written to a file.
kubectl --context "${PROD_CONTEXT}" exec -i -n "${NAMESPACE}" "${POD}" -- bash -c '
  set -euo pipefail
  IFS= read -r PGPASSWORD
  export PGPASSWORD
  pg_dump -h localhost -U '"${DB_USER}"' -d '"${DB_NAME}"' -Fc
' <<< "${PGVECTOR_PROD_PASSWORD}" \
  | gcloud storage cp - "${DEST}"

echo "Dump complete: ${DEST}" >&2
