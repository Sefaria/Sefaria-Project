#!/bin/bash

echo "Starting TURN/STUN server"

turnserver -a -v -L 0.0.0.0 -n --no-dtls --no-tls --log-file "stdout" -u ${TURN_USER}:${TURN_SECRET} -r "${TURN_REALM}"
