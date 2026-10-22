#!/usr/bin/env bash
# Switches Envoy between the default config (UNESCAPE_AND_REDIRECT, as Envoy Gateway generates) and the
# KEEP_UNCHANGED variant for escaped slashes, restarting only the envoy container. Prints the active variant.
#   envoy-variant.sh [default|keepunchanged]
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if [ $# -eq 0 ]; then cat "$STACK_RUN_DIR/envoy.variant"; exit 0; fi
"$PYTHON" "$STACK_DIR/render_configs.py" "$STACK_RUN_DIR" --only envoy --envoy-variant "$1"
compose restart envoy >/dev/null 2>&1
for _ in $(seq 1 30); do
  curl -s -m 2 http://127.0.0.1:19000/clusters | grep -q '^authsvc::.*::health_flags::healthy$' && break
  sleep 1
done
log "envoy variant: $(cat "$STACK_RUN_DIR/envoy.variant")"
