#!/bin/bash
# AUTOMATICALLY PROVIDED
# GIT_COMMIT
waitDuration=${WAIT_DURATION:-900}
HEALTH_URL="https://sandbox-${GIT_COMMIT}.cauldron.sefaria.org/health-check"

echo "Waiting for ${HEALTH_URL} to load for $waitDuration seconds"

if timeout $waitDuration bash -c 'while [[ "$(curl -s -k -o /dev/null -w ''%{http_code}'' -L '"${HEALTH_URL}"')" != "200" ]]; do sleep 5; done'; then
  echo "Reached server. Proceeding."
else
  echo "Timed out waiting for ${HEALTH_URL}."
  exit 1
fi
