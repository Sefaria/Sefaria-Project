#!/usr/bin/env bash
# E3: the chart rendered with authService off and on. Desired: off renders no gateway-auth objects and is
# byte-identical to master; on is sane (render-check.sh, helm-matrix); DEVELOPER_SETTINGS_MOCKS and _ENABLED are off
# outside cauldrons. Uses the chart's own values per deployEnv; the infrastructure repo's per-environment values are
# a manual check. Helm runs in the alpine/helm image; yq is local.
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
  n="$(yq -N 'select(.kind == "SecurityPolicy" or (.metadata.name | test("auth-service"))) | .kind' "$OUT/$env.off.yaml" | grep -c . || true)"
  check E3 "$env off: no auth-service objects and no SecurityPolicy" "$n" 0
  strip="$(yq -N 'select(.kind == "ClientTrafficPolicy") | .spec.headers.earlyRequestHeaders.remove' "$OUT/$env.off.yaml" | grep -c 'x-sefaria' || true)"
  check E3 "$env off: the ClientTrafficPolicy strips no x-sefaria-* headers" "$strip" 0
  diff <(normalize <"$OUT/$env.base.yaml") <(normalize <"$OUT/$env.off.yaml") >"$OUT/$env.base.diff"
  other="$(grep '^[<>]' "$OUT/$env.base.diff" | grep -vcE '^> +DEVELOPER_SETTINGS_(MOCKS|ENABLED)(: "False"| = os.getenv\("DEVELOPER_SETTINGS_(MOCKS|ENABLED)", "False"\))' || true)"
  if [ "$other" = 0 ]; then
    pass "E3 $env off: identical to the merge base's chart except the two DEVELOPER_SETTINGS_* flags, both False ($(grep -c '^>' "$OUT/$env.base.diff") added lines)"
  else
    fail "E3 $env off: $other unexpected lines differ from the merge base's chart ($OUT/$env.base.diff)"
  fi
  if diff -q <(normalize <"$OUT/$env.master.yaml") <(normalize <"$OUT/$env.off.yaml") >/dev/null; then
    info "E3 $env off: identical to origin/master's chart too"
  else
    diff <(normalize <"$OUT/$env.master.yaml") <(normalize <"$OUT/$env.off.yaml") >"$OUT/$env.master.diff"
    info "E3 $env off: $(grep -c '^[<>]' "$OUT/$env.master.diff") lines differ from origin/master's chart (master has moved on; see $OUT/$env.master.diff)"
  fi
  flags="$(yq -N 'select(.kind == "ConfigMap") | .data | with_entries(select(.key | test("^DEVELOPER_SETTINGS_"))) | to_entries | .[] | .key + "=" + .value' "$OUT/$env.off.yaml" | sort -u | paste -sd, -)"
  check E3 "$env: developer settings flags off by default" "$flags" "DEVELOPER_SETTINGS_ENABLED=False,DEVELOPER_SETTINGS_MOCKS=False"
done

# On: render-check.sh and the helm-matrix assertions, through a helm shim that runs the container.
SHIM="$OUT/bin"; mkdir -p "$SHIM"
cat >"$SHIM/helm" <<EOF
#!/usr/bin/env bash
exec docker run --rm -v "$REPO:$REPO:ro" -w "\$PWD" $HELM_IMAGE "\$@"
EOF
chmod +x "$SHIM/helm"
for env in staging preprod prod; do
  PATH="$SHIM:$PATH" helm template "$env" "$BRANCH_CHART" --set deployEnv=$env --set gateway.enabled=true \
    --set authService.enabled=true --set authService.image.tag=sha-test >"$OUT/$env.on.yaml" 2>"$OUT/$env.on.err" \
    || { fail "E3 $env on: does not render ($(head -c 200 "$OUT/$env.on.err"))"; continue; }
  if ENV=$env bash "$REPO/auth-service/scripts/render-check.sh" "$OUT/$env.on.yaml" >"$OUT/$env.render-check.log" 2>&1; then
    pass "E3 $env on: render-check.sh ($(grep -c '^ok:' "$OUT/$env.render-check.log") assertions)"
  else
    fail "E3 $env on: render-check.sh: $(grep -m1 FAIL "$OUT/$env.render-check.log")"
  fi
done
if (cd "$REPO/auth-service" && PATH="$SHIM:$PATH" make -s helm-matrix) >"$OUT/helm-matrix.log" 2>&1; then
  pass "E3 make helm-matrix ($(grep -c '^==' "$OUT/helm-matrix.log") checks)"
else
  fail "E3 make helm-matrix: $(tail -2 "$OUT/helm-matrix.log" | tr '\n' ' ')"
fi
info "E3 the infrastructure repo's staging/preprod/prod values were not rendered here (manual-only)"
finish
