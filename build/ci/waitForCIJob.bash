#!/bin/bash
set -e
set -x

echo "Waiting for the test job to finish"
echo "GitHub Run ID $GITHUB_RUN_ID"

LABEL="ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest}"

while true; do
    STATUS=$(kubectl get job -l "$LABEL" -o json)
    SUCCEEDED=$(echo "$STATUS" | jq -r '.items[0].status.succeeded // 0')
    FAILED=$(echo "$STATUS" | jq -r '.items[0].status.failed // 0')

    if [[ "$SUCCEEDED" == "1" ]]; then
        echo ""
        echo "=========================================="
        echo "Job completed successfully (tests passed)"
        echo "=========================================="
        kubectl logs -l "$LABEL" --tail=-1 || true
        exit 0
    fi

    if [[ "$FAILED" -ge "1" ]]; then
        echo ""
        echo "=========================================="
        echo "Job failed (tests failed or pod error)"
        echo "=========================================="
        kubectl logs -l "$LABEL" --tail=-1 || true
        exit 1
    fi

    kubectl logs -l "$LABEL" --tail 5 2>/dev/null || true
    sleep 30
done
