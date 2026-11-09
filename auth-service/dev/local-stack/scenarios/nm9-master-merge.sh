#!/usr/bin/env bash
# N-M9: merge master into a local scratch branch (never pushed), resolve clienttrafficpolicy.yaml keeping both
# blocks, then render the chart with auth on and off and run Jest, the powered_by and merged-area pytest files, and
# an app smoke test of the merged code (runserver on :8111 against the drill database). Desired: both keys render
# under spec, everything green.
#   nm9-master-merge.sh [MASTER_REF]   default origin/master
#   KEEP_WT=1 keeps the worktree; the scratch branch is kept either way, for inspection.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

MASTER_REF="${1:-origin/master}"
BRANCH=scratch/apikeys-nm9-master-merge
OUT="$D11_DIR/nm9"; rm -rf "$OUT"; mkdir -p "$OUT"
SMOKE_PORT=8111
drill_up
WT="$(tmp_worktree nm9 HEAD "$BRANCH")"
SERVER_PID=
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ "${KEEP_WT:-0}" = 1 ] || drop_worktree "$WT"
}
trap cleanup EXIT
g() { git -C "$WT" -c core.hooksPath=/dev/null "$@"; }
info "N-M9 scratch branch $BRANCH at $(g rev-parse --short HEAD) + $MASTER_REF $(g rev-parse --short "$MASTER_REF")"

# 1. Merge, expecting exactly the ClientTrafficPolicy conflict.
g merge --no-edit --no-ff "$MASTER_REF" >"$OUT/merge.log" 2>&1
conflicts="$(g diff --name-only --diff-filter=U | paste -sd, -)"
check N-M9 "the only conflict" "$conflicts" helm-chart/sefaria/templates/gateway/clienttrafficpolicy.yaml
CTP="$WT/helm-chart/sefaria/templates/gateway/clienttrafficpolicy.yaml"
g show "$MASTER_REF:helm-chart/sefaria/templates/gateway/clienttrafficpolicy.yaml" >"$OUT/ctp.master.yaml"
g show "HEAD:helm-chart/sefaria/templates/gateway/clienttrafficpolicy.yaml" >"$OUT/ctp.branch.yaml"
python3 - "$OUT/ctp.master.yaml" "$OUT/ctp.branch.yaml" "$CTP" <<'PY'
import sys
master = open(sys.argv[1]).read()
branch = open(sys.argv[2]).read()
start = branch.index("  {{- if .Values.authService.enabled }}")
auth_block = branch[start:branch.rindex("{{- end }}")]
tail = master.rindex("{{- end }}")
open(sys.argv[3], "w").write(master[:tail] + auth_block + master[tail:])
PY
g add "$CTP" && g commit -q --no-verify -m "chore: scratch merge of master (local test only)" \
  && pass "N-M9 merge committed on the local scratch branch ($(g rev-parse --short HEAD))" || fail "N-M9 merge commit failed"

# 2. Chart: both blocks under spec with auth on; the path block alone with auth off.
helm_tpl() { docker run --rm -v "$WT/helm-chart/sefaria:/chart:ro" alpine/helm:3.16.4 template x /chart --set deployEnv=x --set gateway.enabled=true "$@"; }
helm_tpl --set authService.enabled=true --set authService.image.tag=test >"$OUT/on.yaml" 2>"$OUT/on.err" || fail "N-M9 chart does not render with auth on"
helm_tpl >"$OUT/off.yaml" 2>"$OUT/off.err" || fail "N-M9 chart does not render with auth off"
ctp() { yq -N "select(.kind == \"ClientTrafficPolicy\") | $2" "$OUT/$1.yaml"; }
check N-M9 "auth on: spec.path.escapedSlashesAction" "$(ctp on .spec.path.escapedSlashesAction)" KeepUnchanged
check N-M9 "auth on: spec.headers.earlyRequestHeaders.remove" "$(ctp on '.spec.headers.earlyRequestHeaders.remove | join(",")')" x-sefaria-tier,x-sefaria-project,x-sefaria-auth-result
check N-M9 "auth off: spec.path.escapedSlashesAction" "$(ctp off .spec.path.escapedSlashesAction)" KeepUnchanged
check N-M9 "auth off: no spec.headers" "$(ctp off .spec.headers)" null
ENV=x bash "$WT/auth-service/scripts/render-check.sh" "$OUT/on.yaml" >"$OUT/render-check.log" 2>&1 \
  && pass "N-M9 render-check.sh on the merged chart" || fail "N-M9 render-check.sh: $(grep -m1 FAIL "$OUT/render-check.log")"
SHIM="$OUT/bin"; mkdir -p "$SHIM"
printf '#!/usr/bin/env bash\nexec docker run --rm -v "%s:%s:ro" -w "$PWD" alpine/helm:3.16.4 "$@"\n' "$WT" "$WT" >"$SHIM/helm"; chmod +x "$SHIM/helm"
(cd "$WT/auth-service" && PATH="$SHIM:$PATH" make -s helm-matrix) >"$OUT/helm-matrix.log" 2>&1 \
  && pass "N-M9 make helm-matrix on the merged chart" || fail "N-M9 helm-matrix: $(tail -2 "$OUT/helm-matrix.log" | tr '\n' ' ')"

# 3. Jest on the merged tree, with a fresh install from the merged lockfile.
if npm_ci "$WT"; then
  (cd "$WT" && npx --no-install jest --ci --silent --json --outputFile="$OUT/jest.json") >"$OUT/jest.log" 2>&1
  read -r jt jf js <<<"$(python3 -c "import json; r=json.load(open('$OUT/jest.json')); print(r['numTotalTests'], r['numFailedTests'], r['numFailedTestSuites'])")"
  if [ "${jf:-1}" = 0 ] && [ "${js:-1}" = 0 ]; then
    pass "N-M9 Jest on the merged tree: $jt tests, 0 failed"
  else
    python3 -c "import json; r=json.load(open('$OUT/jest.json'))
for s in r['testResults']:
    if s['status'] != 'passed': print(s['name'].split('/static/js/')[-1], '|', (s.get('message') or '').strip().splitlines()[0][:160] if s.get('message') else '')" >"$OUT/jest.failed"
    fail "N-M9 Jest on the merged tree: $jf of $jt tests failed, $js suites ($(cut -d'|' -f1 "$OUT/jest.failed" | paste -sd, - | head -c 300))"
  fi
else
  fail "N-M9 npm ci on the merged tree failed ($WT/.d11-npm.log)"
fi

# Pages render through webpack-stats, so pytest and the smoke test need the merged client bundle.
BUNDLE_OK=0
(cd "$WT" && NODE_ENV=development npx --no-install webpack --config ./node/webpack.client.js) >"$OUT/webpack.log" 2>&1 && BUNDLE_OK=1
[ "$BUNDLE_OK" = 1 ] || fail "N-M9 client bundle build on the merged tree failed ($OUT/webpack.log)"

# 4. pytest: powered_by, the api-terms page and master's merged reader tests, on the drill Postgres.
ln -sf "$(readlink "$REPO/sefaria/local_settings.py" || echo "$REPO/sefaria/local_settings.py")" "$WT/sefaria/local_settings.py"
PYFILES="powered_by/tests reader/tests/api_terms_test.py reader/tests/test_catchall_redirects.py reader/tests/test_knn_backend_header.py"
# The flag off, as CI and the chart default have it; the developer tests turn it on themselves.
(cd "$WT" && env -u FRONT_END_URL -u CI_RUN PYTHONPATH="$WT/auth-service/dev/local-stack" APIKEYS_STACK_PG_PORT=$D11_PG_PORT \
  DEVELOPER_SETTINGS_ENABLED=false "$PYTHON" -m pytest $PYFILES -m "not deep and not failing" -p no:cacheprovider --ds=django_settings -q \
  --junitxml="$OUT/pytest.xml") >"$OUT/pytest.log" 2>&1
summary="$(tail -1 "$OUT/pytest.log")"
if grep -qE '(failed|error)' <<<"$summary"; then
  fail "N-M9 pytest on the merged tree: $summary ($OUT/pytest.log)"
else
  pass "N-M9 pytest on the merged tree ($PYFILES): $summary"
fi

# 5. App smoke: the merged code serving a few pages against the drill database (flag on, mocks off).
if lsof -nP -iTCP:$SMOKE_PORT -sTCP:LISTEN >/dev/null 2>&1; then
  fail "N-M9 port $SMOKE_PORT is already in use; smoke test skipped"
elif [ "$BUNDLE_OK" = 1 ]; then
  (cd "$WT" && exec env -u FRONT_END_URL -u CI_RUN PYTHONPATH="$WT/auth-service/dev/local-stack" APIKEYS_STACK_PG_PORT=$D11_PG_PORT \
    DJANGO_SETTINGS_MODULE=django_settings DEVELOPER_SETTINGS_ENABLED=true "$PYTHON" manage.py runserver --noreload 127.0.0.1:$SMOKE_PORT) >"$OUT/runserver.log" 2>&1 &
  SERVER_PID=$!
  wait_for 120 'test "$(http_code http://127.0.0.1:'$SMOKE_PORT'/api/texts/Genesis.1.1 20)" = 200' >/dev/null
  for path in / /texts /Genesis.1 /api/texts/Genesis.1.1 /api/v3/texts/Genesis.1.1 /api-terms /settings/account /api/developer/state; do
    st="$(curl -s -o /dev/null -m 60 -w '%{http_code}' "http://127.0.0.1:$SMOKE_PORT$path")"
    case "$st" in 2??|3??|401|403) pass "N-M9 smoke $path -> $st" ;; *) fail "N-M9 smoke $path -> $st" ;; esac
  done
fi
finish
