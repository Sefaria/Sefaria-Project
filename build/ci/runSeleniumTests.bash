#!/bin/bash

podName=$(kubectl get pod --selector=stackRole=django,deployEnv=${GITHUB_SHA:0:6} -o jsonpath='{range .items[0]}{.metadata.name}{end}')
echo "Testing using pod $podName"


kubectl exec $podName -- env \
    PYTHONPATH="/app" \
    DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE}" \
    SEFARIA_TEST_PASS="${SEFARIA_TEST_PASS}" \
    SEFARIA_TEST_USER="${SEFARIA_TEST_USER}" \
    SELENIUM_SERVER_URL="${SELENIUM_SERVER_URL}" \
    GITHUB_SHA="${GITHUB_SHA}" \
    python3 ./reader/browsertest/zzRun_test.py