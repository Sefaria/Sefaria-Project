#!/usr/bin/env bash
# Manually trigger the embed-library-to-pgvector (full text/vectors) job against the dev
# pgvector instance, outside the CronJob schedule. Dev counterpart of
# run-embed-library-to-pgvector-prod.sh -- same job shape, pointed at the "pgvector-split"
# cauldron on the development cluster instead of production (local-settings configmaps/secrets
# and REDIS_HOST follow that cauldron's deployEnv naming, so the job reads/writes the dev
# pgvector instance it's wired to).
set -euo pipefail

CONTEXT="gke_development-205018_us-east1-b_cluster-1"
NAMESPACE="default"
DEPLOY_ENV="${DEPLOY_ENV:-pgvector-split}"
JOB_NAME="embed-library-to-pgvector-manual-$(date +%Y%m%d-%H%M%S)"
THREADS="${THREADS:-10}"

# The pgvector-split cauldron's own live image (branch sc-46215) doesn't work, so this doesn't
# pull from the Rollout the way the dev script originally did. Pinned instead to the image built
# by PR #3711 (branch pgvector-job-fixes) via .github/workflows/continuous.yaml's "Continuous
# Image Build (web)" job -- update this tag by re-running that workflow (push a commit) and
# grabbing the new "sha-<short-sha>-<timestamp>" tag it pushes.
IMAGE="${IMAGE:-us-east1-docker.pkg.dev/development-205018/containers/sefaria-web-pgvector-job-fixes:sha-f56b901-202609091134}"

echo "Job:      $JOB_NAME"
echo "DeployEnv: $DEPLOY_ENV"
echo "Image:    $IMAGE"
echo "Threads:  $THREADS"

# This image is built straight from the current branch, so it should already contain the
# sc-46215 guard / dedupe fixes below (both are already in this repo's source). Kept anyway as a
# defensive no-op, tolerant of the anchor already being gone -- print and skip rather than
# failing the job.
PATCH_B64=$(base64 <<'PATCH_PY' | tr -d '\n'
p = "/app/sefaria/model/text.py"
s = open(p).read()
old = "        for c in content_nodes:\n            try:"
new = "        for c in content_nodes:\n            sections = None\n            try:"
if old not in s:
    print("patch anchor not found in text.py -- already fixed upstream, skipping")
else:
    open(p, "w").write(s.replace(old, new, 1))
    print("patched: sections=None guard added to Index.all_section_refs()")
PATCH_PY
)

PATCH2_B64=$(base64 <<'PATCH2_PY' | tr -d '\n'
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
    print("patch anchor not found in embed_library_to_pgvector.py -- already fixed upstream, skipping")
else:
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
              value: "redis-$DEPLOY_ENV"
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
                name: local-settings-secrets-$DEPLOY_ENV
                optional: true
            - configMapRef:
                name: local-settings-$DEPLOY_ENV
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
            name: local-settings-file-$DEPLOY_ENV
            items:
              - key: local_settings.py
                path: local_settings.py
EOF

echo
echo "Watch:  kubectl --context $CONTEXT -n $NAMESPACE get pods -l job-name=$JOB_NAME -w"
echo "Logs:   kubectl --context $CONTEXT -n $NAMESPACE logs -l job-name=$JOB_NAME -f"
echo "Delete: kubectl --context $CONTEXT -n $NAMESPACE delete job $JOB_NAME"
