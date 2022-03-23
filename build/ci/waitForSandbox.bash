#!/bin/bash

# AUTOMATICALLY PROVIDED
# GITHUB_HASH
waitDuration=${WAIT_DURATION:-900}

echo "Waiting for https://sandbox-${GITHUB_SHA:0:6}.cauldron.sefaria.org/health-check to load for $waitDuration seconds"

timeout $waitDuration bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' https://sandbox-${GITHUB_SHA:0:6}.cauldron.sefaria.org/health-check)" != "200" ]]; do sleep 5; done'

echo "Reached server. Proceeding."
