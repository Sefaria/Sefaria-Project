#!/bin/bash
set -e
set -x
timeout ${TIMEOUT:-900} bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' http://${TARGET_HOSTNAME:-localhost}/healthz-rollout)" != "200" ]]; do curl http://${TARGET_HOSTNAME:-localhost}/healthz-rollout;  sleep 10; done'
