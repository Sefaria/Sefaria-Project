#!/usr/bin/env bash
# git-update.sh — part of the git-update skill.
#
# Brings the branch checked out in Sefaria-Project up to date: merges its GitHub copy
# (like git pull), merges GitHub's master, and pushes. On master it only updates master.
# Prints one GIT_OK or GIT_STOP line that the skill reads.
#
# This lives in its own file, not in SKILL.md, because Claude Code replaces $0, $1, ...
# in SKILL.md text with the words typed after the skill's name.
# The skill copies this file to a scratch folder before running it, since merging master
# can change this file while bash is still reading it.
#
# Usage: git-update.sh <Sefaria-Project folder>

cd "$1" || { echo "GIT_STOP: no-repo"; exit 0; }
branch=$(git branch --show-current)
[ -z "$branch" ] && { echo "GIT_STOP: no-branch"; exit 0; }
# Only edits to files git tracks count; untracked files are left alone (git refuses a merge that would overwrite one).
dirty=$(git status --porcelain --untracked-files=no)
[ -n "$dirty" ] && { echo "GIT_STOP: uncommitted"; echo "$dirty"; exit 0; }
git fetch origin || { echo "GIT_STOP: fetch-failed"; exit 0; }
merge() {
  if ! git merge --no-edit "$1"; then
    echo "GIT_STOP: merge-failed $1"
    git diff --name-only --diff-filter=U
    git merge --abort 2>/dev/null
    exit 0
  fi
}
# Same as "git pull": bring in commits pushed to this branch on GitHub (skipped if it was never pushed).
git rev-parse --verify --quiet "origin/$branch" >/dev/null && merge "origin/$branch"
[ "$branch" = master ] && { echo "GIT_OK: master updated, not pushed"; exit 0; }
merge origin/master
git push -u origin "$branch" || { echo "GIT_STOP: push-failed"; exit 0; }
echo "GIT_OK: $branch updated and pushed"
