#!/usr/bin/env bash
# Restores a pgvector dump (produced by scripts/pgvector_dump_prod_to_gcs.sh) from GCS into
# the dev pgvector database. Streams straight from GCS, no local disk, no password on any
# command line / process argv.
#
# Required env var:
#   PGVECTOR_DEV_PASSWORD   password for the pgvector dev Postgres user
#
# Optional:
#   DUMP_PATH      gs:// path to restore (default: the most recent object under
#                   gs://${GCS_BUCKET}/pgvector-dumps/)
#   DEV_CONTEXT    (default: gke_development-205018_us-east1-b_cluster-1)
#   NAMESPACE      (default: default)
#   POD            (default: pgvector-0)
#   DB_USER        (default: pgvector)
#   DB_NAME        (default: pgvector)
#   GCS_BUCKET     (default: sefaria-pgvector-backup)
#
# Usage:
#   PGVECTOR_DEV_PASSWORD='...' ./scripts/pgvector_restore_dev_from_gcs.sh
#   PGVECTOR_DEV_PASSWORD='...' DUMP_PATH=gs://sefaria-pgvector-backup/pgvector-dumps/library_chunks-20260716-093000.dump ./scripts/pgvector_restore_dev_from_gcs.sh
set -euo pipefail

: "${PGVECTOR_DEV_PASSWORD:?Set PGVECTOR_DEV_PASSWORD in your shell before running}"

DEV_CONTEXT="${DEV_CONTEXT:-gke_development-205018_us-east1-b_cluster-1}"
NAMESPACE="${NAMESPACE:-default}"
POD="${POD:-pgvector-0}"
DB_USER="${DB_USER:-pgvector}"
DB_NAME="${DB_NAME:-pgvector}"
GCS_BUCKET="${GCS_BUCKET:-sefaria-pgvector-backup}"

DUMP_PATH="${DUMP_PATH:-}"
if [[ -z "${DUMP_PATH}" ]]; then
  DUMP_PATH="$(gcloud storage ls "gs://${GCS_BUCKET}/pgvector-dumps/**" 2>/dev/null | sort | tail -n 1)"
  if [[ -z "${DUMP_PATH}" ]]; then
    echo "No dump found under gs://${GCS_BUCKET}/pgvector-dumps/ and DUMP_PATH not set" >&2
    exit 1
  fi
fi

echo "Restoring ${DUMP_PATH} -> ${DB_NAME}@${POD} (${DEV_CONTEXT}/${NAMESPACE})" >&2

# Ensure the vector extension exists before restore (pg_restore will fail on the
# `embedding vector(1536)` column type otherwise). Password again goes over exec stdin,
# consumed by `read`, never in argv or on disk.
kubectl --context "${DEV_CONTEXT}" exec -i -n "${NAMESPACE}" "${POD}" -- bash -c '
  set -euo pipefail
  IFS= read -r PGPASSWORD
  export PGPASSWORD
  psql -h localhost -U '"${DB_USER}"' -d '"${DB_NAME}"' -c "CREATE EXTENSION IF NOT EXISTS vector;"
' <<< "${PGVECTOR_DEV_PASSWORD}"

# Stream the dump from GCS straight into pg_restore inside the pod.
# --clean --if-exists drops existing objects first (dev's prior library_chunks data is
# overwritten); --no-owner --no-privileges avoids failing on role mismatches between clusters.
gcloud storage cat "${DUMP_PATH}" \
  | kubectl --context "${DEV_CONTEXT}" exec -i -n "${NAMESPACE}" "${POD}" -- bash -c '
  set -euo pipefail
  IFS= read -r PGPASSWORD
  export PGPASSWORD
  pg_restore -h localhost -U '"${DB_USER}"' -d '"${DB_NAME}"' --clean --if-exists --no-owner --no-privileges
' <<< "${PGVECTOR_DEV_PASSWORD}"

echo "Restore complete." >&2
