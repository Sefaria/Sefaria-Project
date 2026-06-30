#!/bin/bash
set -e
set -x

echo "Waiting for the test job to finish"
echo "GitHub Run ID $GITHUB_RUN_ID"

#timeout ${WAIT_DURATION:-900} bash -c "while [[ $(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json | jq -r '.items[0].status.succeeded') != 1 ]]; do sleep 5; done"

while true
do
    # Tolerate transient kubectl/API errors without aborting the whole wait (set -e is on).
    JOB_JSON=$(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json 2>/dev/null || true)
    SUCCEEDED=$(echo "$JOB_JSON" | jq -r '.items[0].status.succeeded' 2>/dev/null || true)
    FAILED_COND=$(echo "$JOB_JSON" | jq -r '.items[0].status.conditions[]? | select(.type=="Failed") | .type' 2>/dev/null || true)
    if [[ "$SUCCEEDED" == "1" ]]; then
        echo "Job succeeded"
        break
    fi
    if [[ "$FAILED_COND" == "Failed" ]]; then
        # Terminal failure (BackoffLimitExceeded / DeadlineExceeded): the pod was hard-killed
        # and never printed its pytest status digit, so the downstream last-log-line check is
        # unreliable. Fail this step explicitly; the "Get Logs" step (if: always()) still dumps logs.
        echo "Job reached terminal Failed condition; failing the wait step"
        exit 1
    fi
    kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest}
    kubectl get pod -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} || true
    kubectl logs -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} --tail 10 || true
    sleep 30
done

echo "Job is complete"
