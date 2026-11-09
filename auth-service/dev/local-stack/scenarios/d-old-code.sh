#!/usr/bin/env bash
# D-1..D-3: master's code against the branch's migrated schema, as during a rollback or while old pods still run.
# Master is checked out in a temporary worktree (removed at the end) and runs through its own manage.py with the
# stack's settings wrapper pointed at the drill database. Never touches the shared stack's Postgres.
#   d-old-code.sh [REF]   default origin/master
set -uo pipefail
source "$(dirname "$0")/lib.sh"

REF="${1:-origin/master}"
WT="${D11_MASTER_WT:-/private/tmp/apikeys-d11-master}"
drill_up
git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true
git -C "$REPO" worktree add --detach "$WT" "$REF" >/dev/null 2>&1 || die "worktree add $REF failed"
trap 'git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1' EXIT
info "D master worktree at $(git -C "$WT" rev-parse --short HEAD) ($REF)"
ln -sf "$(readlink "$REPO/sefaria/local_settings.py" || echo "$REPO/sefaria/local_settings.py")" "$WT/sefaria/local_settings.py"

(cd "$WT" && APIKEYS_STACK_PG_PORT=$D11_PG_PORT django_env "$PYTHON" manage.py shell <"$SCEN_DIR/d_old_code.py") \
  >"$D11_DIR/d-old-code.out" 2>&1
grep '^D11RESULT' "$D11_DIR/d-old-code.out" >"$D11_DIR/d-old-code.results" || true
[ -s "$D11_DIR/d-old-code.results" ] || { tail -20 "$D11_DIR/d-old-code.out"; die "the driver printed no results"; }
while read -r _ status case text; do
  case "$status" in
    pass) pass "$case $text" ;;
    GAP) gap "$case" "$text" ;;
    *) fail "$case $text" ;;
  esac
done <"$D11_DIR/d-old-code.results"
grep -q 'Traceback' "$D11_DIR/d-old-code.out" && info "D the driver logged tracebacks (expected for the failing cases): $D11_DIR/d-old-code.out"
finish
