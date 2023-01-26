#!/bin/bash
 
set -e
set -x

# export makes the variable available to scripts called further along
export TARGET_HOSTNAME=${TARGET_HOSTNAME:-localhost}
export SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# Wait for pod come online
timeout ${TIMEOUT:-900} bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' http://$TARGET_HOSTNAME/healthz-rollout)" != "200" ]]; do sleep 10; done'

$SCRIPT_DIR/primeLocalCache.bash

exit 0
