#!/usr/bin/env bash
# E3: the chart rendered with authService off and on. Desired: off renders no gateway-auth objects and is
# byte-identical to master; on is sane (render-check.sh, helm-matrix); DEVELOPER_SETTINGS_MOCKS, _ENABLED and _STAFF_ONLY are off
# outside cauldrons. The off/on render checks use each env file's HelmRelease values (render-check.sh); the base
# comparison uses the chart's own values per deployEnv. Helm is the local one, or the alpine/helm image when there is
# none; YAML is read with Python (PyYAML), and `make helm-matrix` runs only when yq is installed.
#   e3-helm.sh [BASE_REF]   compare against BASE_REF (default: the merge base with origin/master), and report the
#                           drift from origin/master's chart as info
set -uo pipefail
source "$(dirname "$0")/lib.sh"

HELM_IMAGE=alpine/helm:3.16.4
OUT="$D11_DIR/e3"; rm -rf "$OUT"; mkdir -p "$OUT"
BASE="${1:-$(git -C "$REPO" merge-base HEAD origin/master)}"
for ref in base:$BASE master:origin/master; do
  name="${ref%%:*}"; mkdir -p "$OUT/$name"
  git -C "$REPO" archive "${ref#*:}" helm-chart/sefaria | tar -x -C "$OUT/$name"
done
helm_tpl() {  # helm_tpl CHART_DIR [helm args] -> rendered YAML on stdout
  local chart="$1"; shift
  docker run --rm -v "$chart:/chart:ro" "$HELM_IMAGE" template x /chart "$@"
}
# Drops the chart-version labels and masks the per-render random 8-character values (randAlphaNum).
normalize() { grep -vE '^\s*(helm\.sh/chart|chart):' | sed -E 's/^( +value: )[A-Za-z0-9]{8}$/\1<random>/'; }
BRANCH_CHART="$REPO/helm-chart/sefaria"

for env in staging preprod prod; do
  helm_tpl "$BRANCH_CHART" --set deployEnv=$env >"$OUT/$env.off.yaml" 2>"$OUT/$env.err" || { fail "E3 $env: branch chart does not render with authService off"; continue; }
  helm_tpl "$OUT/base/helm-chart/sefaria" --set deployEnv=$env >"$OUT/$env.base.yaml" 2>/dev/null
  helm_tpl "$OUT/master/helm-chart/sefaria" --set deployEnv=$env >"$OUT/$env.master.yaml" 2>/dev/null
  if "$PYTHON" "$REPO/auth-service/scripts/render_check.py" --off "$OUT/$env.off.yaml" >"$OUT/$env.off.check" 2>&1; then
    pass "E3 $env off: no auth-service objects, no SecurityPolicy, no x-sefaria-* header strip"
  else
    fail "E3 $env off: $(grep -m1 FAIL "$OUT/$env.off.check")"
  fi
  diff <(normalize <"$OUT/$env.base.yaml") <(normalize <"$OUT/$env.off.yaml") >"$OUT/$env.base.diff"
  # What phase 1 changes with the flag off, by design (release plan, "These still go live on merge"): the
  # DEVELOPER_SETTINGS_* flags, all False; api_key scrubbing in gunicorn's access log and nginx's (the scrub maps and
  # the structured log_format, whose fields helm-chart/tests/auth_service_render_test.py checks); comments.
  grep '^[<>]' "$OUT/$env.base.diff" | grep -vE \
    -e '^> +DEVELOPER_SETTINGS_(MOCKS|ENABLED|STAFF_ONLY)(: "False"| = os.getenv\("DEVELOPER_SETTINGS_(MOCKS|ENABLED|STAFF_ONLY)", "False"\)\.lower\(\) == "true"| = os.getenv\("DEVELOPER_SETTINGS_(MOCKS|ENABLED|STAFF_ONLY)", "False"\))$' \
    -e '^> +logger_class = "sefaria\.system\.gunicorn_logger\.ScrubbingLogger"$' \
    -e '^> +map \$[a-z_0-9]+ \$(uri_scrub_[0-9]|request_uri_scrubbed|referer_scrub_[0-9]|referer_scrubbed) \{$' \
    -e '^> +"~\*\^.*(a\|%61\|%41).*" "(\$pre\[REDACTED\]\$post|\[REDACTED-URI\]|\[REDACTED-REFERER\])";$' \
    -e '^> +default \$(request_uri|http_referer|uri_scrub_[0-9]|referer_scrub_[0-9]);$' \
    -e '^> +\}$' \
    -e '^[<>] +log_format structured escape=json ' \
    -e '^> *(#.*)?$' >"$OUT/$env.base.unexpected"
  other="$(grep -c . "$OUT/$env.base.unexpected" || true)"
  if [ "$other" = 0 ]; then
    pass "E3 $env off: differs from the merge base's chart only by the DEVELOPER_SETTINGS_* flags (all False) and api_key log scrubbing ($(grep -c '^>' "$OUT/$env.base.diff") added lines)"
  else
    fail "E3 $env off: $other unexpected lines differ from the merge base's chart ($OUT/$env.base.unexpected; full diff $OUT/$env.base.diff)"
  fi
  if diff -q <(normalize <"$OUT/$env.master.yaml") <(normalize <"$OUT/$env.off.yaml") >/dev/null; then
    info "E3 $env off: identical to origin/master's chart too"
  else
    diff <(normalize <"$OUT/$env.master.yaml") <(normalize <"$OUT/$env.off.yaml") >"$OUT/$env.master.diff"
    info "E3 $env off: $(grep -c '^[<>]' "$OUT/$env.master.diff") lines differ from origin/master's chart (master has moved on; see $OUT/$env.master.diff)"
  fi
  flags="$("$PYTHON" -c "
import sys, yaml
seen = set()
for d in yaml.safe_load_all(open(sys.argv[1])):
    if d and d.get('kind') == 'ConfigMap':
        seen.update(k + '=' + str(v) for k, v in (d.get('data') or {}).items() if k.startswith('DEVELOPER_SETTINGS_'))
print(','.join(sorted(seen)))" "$OUT/$env.off.yaml")"
  # MOCKS is gone once the test controls are removed; whichever flags render must all be False.
  case ",$flags," in
    *DEVELOPER_SETTINGS_ENABLED=False*DEVELOPER_SETTINGS_STAFF_ONLY=False*)
      if [[ ",$flags," == *=True* ]]; then fail "E3 $env: a developer settings flag is on by default ($flags)"
      else pass "E3 $env: developer settings flags off by default ($flags)"; fi ;;
    *) fail "E3 $env: developer settings flags missing or on ($flags)" ;;
  esac
done

# On (and off again) with each env file's values: render-check.sh. Without a local helm, a shim runs the container
# with the checkout and the temporary directory mounted.
SHIM="$OUT/bin"; mkdir -p "$SHIM"
if ! command -v helm >/dev/null 2>&1; then
  tmpdir="${TMPDIR:-/tmp}"
  printf '#!/usr/bin/env bash\nexec docker run --rm -v "%s:%s:ro" -v "%s:%s" -w "$PWD" %s "$@"\n' \
    "$REPO" "$REPO" "${tmpdir%/}" "${tmpdir%/}" "$HELM_IMAGE" >"$SHIM/helm"
  chmod +x "$SHIM/helm"
fi
for env in staging preprod prod; do
  if PATH="$SHIM:$PATH" PY="$PYTHON" bash "$REPO/auth-service/scripts/render-check.sh" "$env" >"$OUT/$env.render-check.log" 2>&1; then
    pass "E3 $env off and on: render-check.sh ($(grep -c '^ok:' "$OUT/$env.render-check.log") assertions)"
  else
    fail "E3 $env: render-check.sh: $(grep -m1 FAIL "$OUT/$env.render-check.log")"
  fi
done
if command -v yq >/dev/null 2>&1; then
  if (cd "$REPO/auth-service" && PATH="$SHIM:$PATH" make -s helm-matrix) >"$OUT/helm-matrix.log" 2>&1; then
    pass "E3 make helm-matrix ($(grep -c '^==' "$OUT/helm-matrix.log") checks)"
  else
    fail "E3 make helm-matrix: $(tail -2 "$OUT/helm-matrix.log" | tr '\n' ' ')"
  fi
else
  info "E3 make helm-matrix skipped: yq is not installed"
fi
info "E3 the infrastructure repo's staging/preprod/prod values were not rendered here (manual-only)"
finish
