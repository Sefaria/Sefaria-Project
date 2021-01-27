#!/bin/bash
set -e

waitDuration=${WAIT_DURATION:-900}

echo "Waiting for the test pod to become ready"

timeout $waitDuration bash -c "while [[ $(kubectl get pod $POD_NAME -o json | jq -r .status.phase) != 'Running' ]]; do sleep 5; done"

echo "Pod is available for testing. Proceeding."

