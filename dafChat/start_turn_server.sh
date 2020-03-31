#!/bin/bash

echo "Starting TURN/STUN server"

turnserver -a -o -v -n --no-dtls --no-tls -u ${TURN_USER}:${TURN_SECRET} -r "${TURN_REALM}"
