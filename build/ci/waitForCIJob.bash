#!/bin/bash

echo "Waiting for the test job to finish"
echo "GitHub Run ID $GITHUB_RUN_ID"

LABEL="ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest}"
PREV_LINES=0
UNREACHABLE_RETRIES=0
MAX_UNREACHABLE_RETRIES=10

while true; do
    STATUS=$(kubectl get job -l "$LABEL" -o json 2>/dev/null) || {
        UNREACHABLE_RETRIES=$((UNREACHABLE_RETRIES + 1))
        if [[ "$UNREACHABLE_RETRIES" -ge "$MAX_UNREACHABLE_RETRIES" ]]; then
            echo "kubectl unreachable after $MAX_UNREACHABLE_RETRIES consecutive attempts, giving up"
            exit 1
        fi
        echo "kubectl unreachable, retrying in 30s... ($UNREACHABLE_RETRIES/$MAX_UNREACHABLE_RETRIES)"
        sleep 30
        continue
    }
    UNREACHABLE_RETRIES=0
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

    TOTAL=$(kubectl logs -l "$LABEL" --tail=-1 2>/dev/null | wc -l)
    if [[ "$TOTAL" -gt "$PREV_LINES" ]]; then
        SKIP=$((PREV_LINES))
        kubectl logs -l "$LABEL" --tail=-1 2>/dev/null | tail -n +$((SKIP + 1))
        PREV_LINES=$TOTAL
    fi
    sleep 30
done
