#!/bin/bash

GITHUB_RUN_ID=$1
DEPLOY_ENV=$2

cat << EOF > job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  labels:
    ci-run: "${GITHUB_RUN_ID}"
    test-name: pytest
  name: $DEPLOY_ENV-pytest-sandbox-$GITHUB_RUN_ID
spec:
  backoffLimit: 0   # waitForCIJob.bash selects logs/status by label (ci-run=...,test-name=pytest), not pod name; a retry pod
                    # under the same label makes `kubectl logs -l` return combined/duplicate output from both pods (corrupting
                    # the "print only new lines" tailing) and can hit a still-ContainerCreating pod mid-poll. The wait script
                    # also isn't retry-aware — it reports the job failed on the first pod's status.failed, before any retry
                    # would even finish. A retry here buys nothing but corrupted logs and misleading duplicate test results
                    # (see run 28873987240 on PR #3470), so don't retry at the Job level at all.
  template:
    metadata:
      labels:
        ci-run: "${GITHUB_RUN_ID}"
        test-name: pytest
    spec:
EOF

kubectl get rollout $DEPLOY_ENV-web -o yaml | yq '.spec.template.spec' > spec.yaml
yq -i '.spec.template.spec += load("spec.yaml")' job.yaml
yq -i '.spec.template.spec.restartPolicy = "Never"' job.yaml
yq -i '.spec.template.spec.containers[0].args = ["-c", "python /app/build/ci/cleanup_test_data.py && pip3 install pytest-django pytest-timeout && pytest -v --timeout=600 --reuse-db -m \"not deep and not failing\" ./sefaria"]' job.yaml
yq -i 'del(.spec.template.spec.containers[0].startupProbe)' job.yaml
yq -i 'del(.spec.template.spec.containers[0].livenessProbe)' job.yaml
yq -i 'del(.spec.template.spec.containers[0].readinessProbe)' job.yaml

kubectl apply -f job.yaml
