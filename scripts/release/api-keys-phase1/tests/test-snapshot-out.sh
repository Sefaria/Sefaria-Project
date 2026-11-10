#!/usr/bin/env bash
# test-snapshot-out.sh: where snapshot.sh writes. The default is outside any checkout; a directory inside a git work tree
# is refused unless git-ignored. Needs bash and git; no cluster.
#   tests/test-snapshot-out.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REL="$HERE/.."
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

grep -q 'OUT="${HOME}/.local/state/api-keys-phase1-snapshots"' "$REL/snapshot.sh" && ok "the default output directory is ~/.local/state/api-keys-phase1-snapshots" || bad "snapshot.sh default OUT"
! grep -q 'OUT="${PWD}' "$REL/snapshot.sh" && ok "the default no longer depends on the working directory" || bad "snapshot.sh still defaults to \$PWD"

git init -q "$T/work"
mkdir -p "$T/work/sub" "$T/outside"
echo 'ignored-snaps/' >"$T/work/.gitignore"
refuse() { bash -c 'source "$1/lib.sh"; refuse_tracked_dir "$2"' _ "$REL" "$1" 2>&1; }
allow() { bash -c 'source "$1/lib.sh"; refuse_tracked_dir "$2"' _ "$REL" "$1" >/dev/null 2>&1; }

out="$(refuse "$T/work/snaps")" && bad "a new directory in a work tree was accepted" || { grep -q "not git-ignored" <<<"$out" && ok "a new directory inside a work tree is refused" || bad "refusal text: $out"; }
out="$(refuse "$T/work/sub/deeper/snaps")" && bad "a nested new directory in a work tree was accepted" || ok "a directory several levels below the work tree is refused"
allow "$T/work/ignored-snaps" && ok "a git-ignored directory inside the work tree is accepted" || bad "an ignored directory was refused"
allow "$T/outside/snaps" && ok "a directory outside any work tree is accepted" || bad "an outside directory was refused"
(cd "$T/work" && out="$(bash -c 'source "$1/lib.sh"; refuse_tracked_dir snaps' _ "$REL" 2>&1)") && bad "a relative directory in a work tree was accepted" || ok "a relative directory (against the working directory) in a work tree is refused"
exit "$fail"
