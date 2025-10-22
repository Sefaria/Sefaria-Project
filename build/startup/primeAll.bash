#!/bin/bash

export TARGET_HOSTNAME=${TARGET_HOSTNAME:-localhost} # export makes the variable available to scripts called further along


# Wait for pod come online
timeout ${TIMEOUT:-900} bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' http://$TARGET_HOSTNAME/healthz-rollout)" != "200" ]]; do sleep 10; done'


# ./primeLocalCache.bash


exit 0
