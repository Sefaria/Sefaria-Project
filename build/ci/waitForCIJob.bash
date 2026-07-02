#!/bin/bash
set -e
set -x

echo "Waiting for the test job to finish"
echo "GitHub Run ID $GITHUB_RUN_ID"

#timeout ${WAIT_DURATION:-900} bash -c "while [[ $(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json | jq -r '.items[0].status.succeeded') != 1 ]]; do sleep 5; done"

while [[ $(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json | jq -r '.items[0].status.succeeded') != 1 ]]
do 
    kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest}
    kubectl get pod -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} || true
    kubectl logs -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} --tail 10 || true
    sleep 30; 
done

echo "Job is complete"
