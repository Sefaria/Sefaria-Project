#!/usr/bin/env bash
# The gunicorn ConfigMap is mounted by every image the chart can run (web and name-service pods). It must set
# logger_class only when the image carries sefaria/system/gunicorn_logger.py, so a pod on an older image keeps
# gunicorn's default logger instead of crash-looping on an unknown class.
#
# Renders the ConfigMap per environment, runs the embedded gunicorn.conf.py with the working directory set to
#   (a) an "old image" tree with no sefaria/system/gunicorn_logger.py  -> logger_class must stay unset
#   (b) a tree that has the module (the real file from this repo)      -> logger_class must be the ScrubbingLogger path
# Before that it proves the test can fail: case (a) against the old unconditional line must be rejected.
#
# Needs helm, python3 and PyYAML. No gunicorn, structlog or database: the config runs against stub modules.
# Run from anywhere: bash helm-chart/tests/gunicorn_conf_test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OLD_REF="${OLD_REF:-aa2a8bc71a}"   # the commit that still has the unconditional logger_class line
WANT="sefaria.system.gunicorn_logger.ScrubbingLogger"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Writes the env's HelmRelease values to $2.
env_values() {
  python3 - "$ROOT/envs/$1/helmrelease.yaml" "$2" <<'PY'
import sys, yaml
release = next(d for d in yaml.safe_load_all(open(sys.argv[1])) if d and d.get("kind") == "HelmRelease")
yaml.safe_dump(release["spec"].get("values", {}), open(sys.argv[2], "w"))
PY
}

# render_conf <chart dir> <env> <out file>: the gunicorn.conf.py text of the rendered ConfigMap.
render_conf() {
  local chart="$1" env="$2" out="$3"
  env_values "$env" "$TMP/values-$env.yaml"
  helm template "$env" "$chart" -f "$TMP/values-$env.yaml" -s templates/configmap/gunicorn.yaml > "$TMP/cm.yaml"
  python3 - "$TMP/cm.yaml" "$out" <<'PY'
import sys, yaml
cm = yaml.safe_load(open(sys.argv[1]))
open(sys.argv[2], "w").write(cm["data"]["gunicorn.conf.py"])
PY
}

# Runs a config in a stub environment with cwd = $2; prints "UNSET" or the logger_class value.
cat > "$TMP/run_conf.py" <<'PY'
import os, sys, types
from unittest import mock

conf, appdir = sys.argv[1], sys.argv[2]
# The config imports structlog (and opentelemetry only with instrumentation on); neither is needed to read logger_class.
for name in ("structlog", "structlog.processors", "structlog.stdlib", "opentelemetry"):
    sys.modules.setdefault(name, mock.MagicMock())
os.chdir(appdir)
# gunicorn sets __file__ to the mounted path, which is not under the app tree's sefaria package.
namespace = {"__file__": "/app/gunicorn.conf.py", "__name__": "gunicorn.conf"}
exec(compile(open(conf).read(), conf, "exec"), namespace)
print(namespace.get("logger_class", "UNSET"))
PY

run_conf() { python3 "$TMP/run_conf.py" "$1" "$2"; }

# The two app trees.
OLD_TREE="$TMP/old-image"; NEW_TREE="$TMP/new-image"
mkdir -p "$OLD_TREE/sefaria/system" "$NEW_TREE/sefaria/system"
touch "$OLD_TREE/sefaria/__init__.py" "$OLD_TREE/sefaria/system/__init__.py" \
      "$NEW_TREE/sefaria/__init__.py" "$NEW_TREE/sefaria/system/__init__.py"
cp "$ROOT/sefaria/system/gunicorn_logger.py" "$NEW_TREE/sefaria/system/gunicorn_logger.py"

fail=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "ok: $1 ($3)"; else echo "FAIL: $1 (expected $2, got $3)"; fail=1; fi
}

# Proof the test can fail: the old unconditional line on an old image sets logger_class, so case (a) must be rejected.
OLD_CHART="$TMP/old-chart"
cp -R "$ROOT/helm-chart/sefaria" "$OLD_CHART"
# CI checks out one commit, so OLD_REF may be absent; then rebuild the old line from the current template.
if git -C "$ROOT" show "$OLD_REF:helm-chart/sefaria/templates/configmap/gunicorn.yaml" > "$TMP/old-gunicorn.yaml" 2>/dev/null; then
  cp "$TMP/old-gunicorn.yaml" "$OLD_CHART/templates/configmap/gunicorn.yaml"
else
  echo "note: $OLD_REF not available, rebuilding the unconditional line from the current template"
  python3 - "$OLD_CHART/templates/configmap/gunicorn.yaml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s, n = re.subn(r'    try:\n        if os\.path\.exists.*?    except Exception:\n        pass\n',
               '    logger_class = "sefaria.system.gunicorn_logger.ScrubbingLogger"\n', s, flags=re.S)
assert n == 1, "guarded block not found"
open(p, "w").write(s)
PY
fi
grep -q '^    logger_class = "sefaria' "$OLD_CHART/templates/configmap/gunicorn.yaml" \
  || { echo "FAIL: $OLD_REF no longer has the unconditional logger_class line; set OLD_REF"; exit 1; }
render_conf "$OLD_CHART" staging "$TMP/old.conf.py"
got_old="$(run_conf "$TMP/old.conf.py" "$OLD_TREE")"
if [ "$got_old" = "UNSET" ]; then
  echo "FAIL: must-fail proof: the old unconditional line left logger_class unset on an old image, so the test cannot fail"
  fail=1
else
  echo "ok: must-fail proof: old unconditional line on an old image sets logger_class ($got_old), so assertion (a) rejects it"
fi

for env in staging preprod prod; do
  render_conf "$ROOT/helm-chart/sefaria" "$env" "$TMP/$env.conf.py"
  check "$env: old image tree leaves logger_class unset" "UNSET" "$(run_conf "$TMP/$env.conf.py" "$OLD_TREE")"
  check "$env: image with the module sets ScrubbingLogger" "$WANT" "$(run_conf "$TMP/$env.conf.py" "$NEW_TREE")"
  # The guard can never raise: a working directory that does not exist for os.getcwd must not break the config.
  check "$env: config survives a missing working directory" "UNSET" \
    "$(python3 - "$TMP/$env.conf.py" "$OLD_TREE" <<'PY'
import os, sys
from unittest import mock
for name in ("structlog", "structlog.processors", "structlog.stdlib"):
    sys.modules.setdefault(name, mock.MagicMock())
with mock.patch("os.getcwd", side_effect=OSError("cwd gone")):
    ns = {"__file__": "/app/gunicorn.conf.py"}
    exec(compile(open(sys.argv[1]).read(), sys.argv[1], "exec"), ns)
print(ns.get("logger_class", "UNSET"))
PY
)"
done

if [ "$fail" -ne 0 ]; then echo "gunicorn_conf_test: FAILED"; exit 1; fi
echo "gunicorn_conf_test: ok"
