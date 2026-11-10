#!/usr/bin/env bash
# auth-service/scripts/render-check.sh — renders the chart with each environment's HelmRelease values, with
# authService off (as shipped) and on, and runs render_check.py on both renders. No cluster is touched.
#   auth-service/scripts/render-check.sh                    staging, preprod and prod
#   auth-service/scripts/render-check.sh preprod prod       just those
#   auth-service/scripts/render-check.sh --file R.yaml      one existing flag-on render (the old interface)
# Needs helm and a Python with PyYAML (PY=..., default python3). Run it after every change to the chart or an env file.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PY:-python3}"
command -v helm >/dev/null || { echo "render-check: helm is not on PATH" >&2; exit 2; }
"$PY" -c 'import yaml' 2>/dev/null || { echo "render-check: $PY cannot import yaml (PyYAML); set PY" >&2; exit 2; }

if [ "${1:-}" = --file ]; then exec "$PY" "$HERE/render_check.py" "${2:?rendered yaml}"; fi

OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
envs=("$@"); [ ${#envs[@]} -gt 0 ] || envs=(staging preprod prod)
rc=0
for env in "${envs[@]}"; do
  file="$ROOT/envs/$env/helmrelease.yaml"
  [ -f "$file" ] || { echo "FAIL: no $file"; rc=1; continue; }
  "$PY" - "$file" "$OUT/$env.values.yaml" <<'PY' || { echo "FAIL: cannot read the HelmRelease values of $env"; rc=1; continue; }
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
release = next(d for d in docs if d.get("kind") == "HelmRelease")
yaml.safe_dump(release["spec"].get("values", {}), open(sys.argv[2], "w"))
PY
  echo "== $env: authService off (forced off, whatever the env file says)"
  if helm template "$env" "$ROOT/helm-chart/sefaria" -f "$OUT/$env.values.yaml" --set authService.enabled=false \
      >"$OUT/$env.off.yaml" 2>"$OUT/$env.off.err"; then
    "$PY" "$HERE/render_check.py" --off "$OUT/$env.off.yaml" || rc=1
  else
    echo "FAIL: helm template ($env, off)"; cat "$OUT/$env.off.err"; rc=1
  fi
  echo "== $env: authService on"
  # A release writes the image tag; the chart refuses to render the flag on without one.
  if helm template "$env" "$ROOT/helm-chart/sefaria" -f "$OUT/$env.values.yaml" \
      --set authService.enabled=true --set authService.image.tag=render-check >"$OUT/$env.on.yaml" 2>"$OUT/$env.on.err"; then
    "$PY" "$HERE/render_check.py" "$OUT/$env.on.yaml" || rc=1
  else
    echo "FAIL: helm template ($env, on)"; cat "$OUT/$env.on.err"; rc=1
  fi
done
[ $rc = 0 ] && echo "render-check: all environments pass" || echo "render-check: FAILURES above"
exit $rc
