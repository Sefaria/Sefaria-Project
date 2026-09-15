#!/bin/bash

GITHUB_RUN_ID=$1
DEPLOY_ENV=$2
JOB_SUFFIX=${3:-}          # lets one run create more than one pytest Job
                            # (mongo vs linker) without colliding on the name

# Which tests this Job runs. Defaults to the historical expression so an
# unparameterised caller behaves exactly as before. Callers that split the suite
# pass a narrower expression, e.g.
#   "not deep and not failing and needs_mongo and not needs_linker"
PYTEST_MARK_EXPR=${PYTEST_MARK_EXPR:-"not deep and not failing"}
PYTEST_TARGETS=${PYTEST_TARGETS:-"./sefaria ./sso ./reader ./powered_by"}

cat << EOF > job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  labels:
    ci-run: "${GITHUB_RUN_ID}"
    test-name: pytest${JOB_SUFFIX:+-$JOB_SUFFIX}
  name: $DEPLOY_ENV-pytest${JOB_SUFFIX:+-$JOB_SUFFIX}-sandbox-$GITHUB_RUN_ID
spec:
  backoffLimit: 0   # a retry pod shares this label with waitForCIJob.bash's label-based log/status lookup, corrupting it
  template:
    metadata:
      labels:
        ci-run: "${GITHUB_RUN_ID}"
        test-name: pytest${JOB_SUFFIX:+-$JOB_SUFFIX}
    spec:
EOF

kubectl get rollout $DEPLOY_ENV-web -o yaml | yq '.spec.template.spec' > spec.yaml
yq -i '.spec.template.spec += load("spec.yaml")' job.yaml
yq -i '.spec.template.spec.restartPolicy = "Never"' job.yaml
PYTEST_CMD="python /app/build/ci/cleanup_test_data.py && pip3 install pytest-django pytest-timeout && pytest -v --timeout=600 --reuse-db -m \"$PYTEST_MARK_EXPR\" $PYTEST_TARGETS"
yq -i ".spec.template.spec.containers[0].args = [\"-c\", \"$PYTEST_CMD\"]" job.yaml
yq -i 'del(.spec.template.spec.containers[0].startupProbe)' job.yaml
yq -i 'del(.spec.template.spec.containers[0].livenessProbe)' job.yaml
yq -i 'del(.spec.template.spec.containers[0].readinessProbe)' job.yaml

kubectl apply -f job.yaml
