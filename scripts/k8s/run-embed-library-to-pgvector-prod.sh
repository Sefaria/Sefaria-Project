#!/usr/bin/env bash
# Manually trigger the embed-library-to-pgvector (full text/vectors) job on prod,
# outside the CronJob schedule. Mirrors helm-chart/sefaria/templates/cronjob/embed-library-to-pgvector.yaml
# (mode=full, not the metadata-only variant).
set -euo pipefail

CONTEXT="gke_production-deployment_us-east1-b_cluster-1"
NAMESPACE="default"
JOB_NAME="embed-library-to-pgvector-manual-$(date +%Y%m%d-%H%M%S)"
THREADS="${THREADS:-10}"

# Pull the currently-live web image so this always matches what's actually running in prod.
IMAGE_REGISTRY=$(yq e '.spec.values.web.containerImage.imageRegistry' envs/prod/helmrelease.yaml)
IMAGE_TAG=$(yq e '.spec.values.web.containerImage.tag' envs/prod/helmrelease.yaml)
IMAGE="${IMAGE_REGISTRY}:${IMAGE_TAG}"

echo "Job:   $JOB_NAME"
echo "Image: $IMAGE"
echo "Threads: $THREADS"

# Prod's image predates the sc-46215 fix for the all_section_refs() crash on DictionaryNode
# indexes (UnboundLocalError on 'sections' masking the real AttributeError). Patch it into the
# container at startup rather than waiting on a full image rebuild/deploy -- base64'd so the
# patch source never has to survive raw through this heredoc -> YAML -> container-shell chain.
PATCH_B64=$(base64 <<'PATCH_PY' | tr -d '\n'
import sys
p = "/app/sefaria/model/text.py"
s = open(p).read()
old = "        for c in content_nodes:\n            try:"
new = "        for c in content_nodes:\n            sections = None\n            try:"
if old not in s:
    sys.exit("patch anchor not found in text.py -- has it already been fixed/changed upstream?")
open(p, "w").write(s.replace(old, new, 1))
print("patched: sections=None guard added to Index.all_section_refs()")
PATCH_PY
)

# Overlapping passage-based units (get_passages_for_index() has no type filter/overlap check)
# can independently converge on the same chunk_metadata key within one flush batch, which
# Postgres's ON CONFLICT DO UPDATE rejects outright -- failing every chunk in that batch, not
# just the colliding one. Dedupe (last write wins, logged) right before the upsert.
PATCH2_B64=$(base64 <<'PATCH2_PY' | tr -d '\n'
import sys
p = "/app/sefaria/helper/vector/embed_library_to_pgvector.py"
s = open(p).read()
old = '''    silently skipped forever on every future run)."""
    chunk_store.upsert([b.chunk for b in batch])'''
new = '''    silently skipped forever on every future run)."""
    deduped = {}
    for b in batch:
        key = (b.chunk.ref, b.chunk.version_title, b.chunk.language, b.chunk.chunk_ordinal,
               b.chunk.chunking_scheme_id)
        if key in deduped:
            logger.warning(f"Dropping duplicate chunk key within one flush batch: {key}")
        deduped[key] = b
    batch = list(deduped.values())
    chunk_store.upsert([b.chunk for b in batch])'''
if old not in s:
    sys.exit("patch anchor not found in embed_library_to_pgvector.py -- has it already been fixed/changed upstream?")
open(p, "w").write(s.replace(old, new, 1))
print("patched: dedupe chunk_metadata batch before upsert in _flush_chunk_and_vector_batch()")
PATCH2_PY
)

cat <<EOF | kubectl --context "$CONTEXT" apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
  namespace: $NAMESPACE
spec:
  backoffLimit: 1
  activeDeadlineSeconds: 21600
  ttlSecondsAfterFinished: 432000
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: embed-library-to-pgvector
          image: "$IMAGE"
          command: ["bash"]
          args:
            - "-c"
            - "echo $PATCH_B64 | base64 -d | python3 - && echo $PATCH2_B64 | base64 -d | python3 - && pip install 'patot[chunking] @ git+https://github.com/Sefaria/patot.git' && /app/run /app/sefaria/helper/vector/embed_library_to_pgvector.py --mode=full --threads=$THREADS"
          env:
            - name: REDIS_HOST
              value: "redis-production"
            - name: TQDM_DISABLE
              value: "1"
            - name: PYTHONUNBUFFERED
              value: "1"
          envFrom:
            - secretRef:
                name: pgvector-secret
            - secretRef:
                name: gemini-api-key
            - secretRef:
                name: local-settings-secrets-production
                optional: true
            - configMapRef:
                name: local-settings-production
          resources:
            requests:
              memory: "4Gi"
              cpu: "2"
            limits:
              memory: "16Gi"
              cpu: "4"
          volumeMounts:
            - mountPath: /app/sefaria/local_settings.py
              name: local-settings
              subPath: local_settings.py
              readOnly: true
      volumes:
        - name: local-settings
          configMap:
            name: local-settings-file-production
            items:
              - key: local_settings.py
                path: local_settings.py
EOF

echo
echo "Watch:  kubectl --context $CONTEXT -n $NAMESPACE get pods -l job-name=$JOB_NAME -w"
echo "Logs:   kubectl --context $CONTEXT -n $NAMESPACE logs -l job-name=$JOB_NAME -f"
echo "Delete: kubectl --context $CONTEXT -n $NAMESPACE delete job $JOB_NAME"
