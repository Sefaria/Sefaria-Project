#!/bin/bash
set -e

echo "Waiting for the test job to finish"
echo "GitHub Run ID $GITHUB_RUN_ID"

#timeout ${WAIT_DURATION:-900} bash -c "while [[ $(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json | jq -r '.items[0].status.succeeded') != 1 ]]; do sleep 5; done"

while true;
do
  if [[ $(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json | jq -r '.items[0].status.succeeded') == 1 ]];
  then
    echo "Job is complete"
    exit 0
  fi

  if [[ $(kubectl get job -l ci-run=$GITHUB_RUN_ID,test-name=${TEST_NAME:-pytest} -o json | jq -r '.items[0].status.failed') > 1 ]];
  then
    echo "Job failed"
    exit 1
  fi

  sleep 5;
done

