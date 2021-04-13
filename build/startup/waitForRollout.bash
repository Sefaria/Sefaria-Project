#!/bin/bash

timeout ${TIMEOUT:-900} bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' http://${TARGET_HOSTNAME:-localhost}/healthz-rollout)" != "200" ]]; do sleep 10; done'
