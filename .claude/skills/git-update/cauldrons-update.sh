#!/usr/bin/env bash
# cauldrons-update.sh — part of the git-update skill.
#
# Puts the cauldrons repo on its main branch and pulls GitHub's main into it.
# Never pushes. Prints one CAULDRONS_OK or CAULDRONS_STOP line that the skill reads.
#
# This lives in its own file, not in SKILL.md, because Claude Code replaces $0, $1, ...
# in SKILL.md text with the words typed after the skill's name.
#
# Usage: cauldrons-update.sh <cauldrons folder>

cd "$1" 2>/dev/null && [ -f create-cauldron.sh ] || { echo "CAULDRONS_STOP: not-found"; exit 0; }
# Only edits to files git tracks count; untracked files are left alone (git refuses a checkout or merge that would overwrite one).
dirty=$(git status --porcelain --untracked-files=no)
[ -n "$dirty" ] && { echo "CAULDRONS_STOP: uncommitted"; echo "$dirty"; exit 0; }
git fetch origin || { echo "CAULDRONS_STOP: fetch-failed"; exit 0; }
branch=$(git branch --show-current)
if [ "$branch" != main ]; then
  git checkout main || { echo "CAULDRONS_STOP: checkout-failed ${branch:-detached}"; exit 0; }
  switched=" (switched from ${branch:-a detached commit})"
fi
if ! git merge --no-edit origin/main; then
  echo "CAULDRONS_STOP: merge-failed"
  git diff --name-only --diff-filter=U
  git merge --abort 2>/dev/null
  exit 0
fi
echo "CAULDRONS_OK: main updated$switched"
