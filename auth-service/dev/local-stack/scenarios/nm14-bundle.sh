#!/usr/bin/env bash
# N-M14: size of the main client bundle (webpack.client.js, production mode), branch vs master. Desired: within an
# agreed limit (suggested +60 KB minified) or lazy-loaded. Each side builds in its own temporary worktree with a
# fresh `npm ci`, so the checkout's own bundle and node_modules are never touched.
#   nm14-bundle.sh [BRANCH_REF] [MASTER_REF]   defaults: HEAD and the merge base with origin/master
set -uo pipefail
source "$(dirname "$0")/lib.sh"

LIMIT_KB="${LIMIT_KB:-60}"
BRANCH_REF="$(git -C "$REPO" rev-parse "${1:-HEAD}")"
MASTER_REF="$(git -C "$REPO" rev-parse "${2:-$(git -C "$REPO" merge-base HEAD origin/master)}")"
OUT="$D11_DIR/nm14"; mkdir -p "$OUT"
trap 'drop_worktree /private/tmp/apikeys-d11-nm14-branch; drop_worktree /private/tmp/apikeys-d11-nm14-master' EXIT

build() {  # build NAME REF -> prints "raw gzip" bytes of the client bundle
  local wt; wt="$(tmp_worktree "nm14-$1" "$2")"
  npm_ci "$wt" || { tail -5 "$wt/.d11-npm.log" >&2; return 1; }
  (cd "$wt" && NODE_ENV=production npx --no-install webpack --config ./node/webpack.client.js --mode=production) \
    >"$OUT/$1.webpack.log" 2>&1 || { tail -5 "$OUT/$1.webpack.log" >&2; return 1; }
  local f; f="$(ls "$wt"/static/bundles/client/client-*.js | head -1)"
  echo "$(wc -c <"$f" | tr -d ' ') $(gzip -9c "$f" | wc -c | tr -d ' ')"
}
info "N-M14 branch $(git -C "$REPO" rev-parse --short "$BRANCH_REF"), master $(git -C "$REPO" rev-parse --short "$MASTER_REF")"
b="$(build branch "$BRANCH_REF")" || { fail "N-M14 branch build failed ($OUT/branch.webpack.log)"; finish; }
m="$(build master "$MASTER_REF")" || { fail "N-M14 master build failed ($OUT/master.webpack.log)"; finish; }
read -r b_raw b_gz <<<"$b"; read -r m_raw m_gz <<<"$m"
d_raw=$(( (b_raw - m_raw) / 1024 )); d_gz=$(( (b_gz - m_gz) / 1024 ))
info "N-M14 client bundle minified: master $((m_raw / 1024)) KB, branch $((b_raw / 1024)) KB (+${d_raw} KB); gzip: master $((m_gz / 1024)) KB, branch $((b_gz / 1024)) KB (+${d_gz} KB)"
if [ "$d_raw" -le "$LIMIT_KB" ]; then
  pass "N-M14 the branch adds ${d_raw} KB minified to the client bundle (limit ${LIMIT_KB} KB)"
else
  gap N-M14 "the branch adds ${d_raw} KB minified (+${d_gz} KB gzip) to the main client bundle, over the suggested ${LIMIT_KB} KB; SettingsPage is a static import in ReaderPanel.jsx, not lazy-loaded"
fi
finish
