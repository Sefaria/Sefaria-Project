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
  backoffLimit: 1
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
yq -i '.spec.template.spec.containers[0].args = ["-c", "pip3 install pytest-django pytest-timeout; pytest -v --timeout=120 -m \"not deep and not failing\" ./sefaria"]' job.yaml
yq -i '.spec.template.spec.containers[0].env += [{"name": "CI_RUN", "value": "true"}]' job.yaml
yq -i 'del(.spec.template.spec.containers[0].startupProbe)' job.yaml
yq -i 'del(.spec.template.spec.containers[0].livenessProbe)' job.yaml
yq -i 'del(.spec.template.spec.containers[0].readinessProbe)' job.yaml

kubectl apply -f job.yaml
