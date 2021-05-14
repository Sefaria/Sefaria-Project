#!/bin/bash

# AUTOMATICALLY PROVIDED
# GITHUB_HASH
waitDuration=${WAIT_DURATION:-900}

echo "Waiting for https://${GITHUB_SHA:0:6}.cauldron.sefaria.org/healthz to load for $waitDuration seconds"

timeout $waitDuration bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' https://${GITHUB_SHA:0:6}.cauldron.sefaria.org/healthz)" != "200" ]]; do sleep 5; done'

echo "Reached server. Proceeding."